import { ApiError } from "../utils/ApiError.js";
import merchandiseRepository from "../repository/merchandise.repository.js";
import walletService from "./wallet.service.js";
import { attachOfferToList, attachOfferToItem, getAmountToCharge } from "../utils/offerUtils.js";
import offerRepository from "../repository/offer.repository.js";
import couponService from "./coupon.service.js";
import { createRazorpayOrder, verifyPaymentSignature } from "../utils/razorpayUtils.js";
import razorpayOrderIntentRepository from "../repository/razorpayOrderIntent.repository.js";

/**
 * Get all merchandise items (admin - includes inactive)
 */
export const getAllMerchandiseForAdmin = async (page = 1, limit = 10,  isActive = null, search = null) => {
  const query = {};
  if (isActive !== null) query.isActive = isActive === "true";
  if (search && search.trim()) {
    const regex = { $regex: search.trim(), $options: "i" };
    query.$or = [{ name: regex }, { description: regex }];
  }

  const result = await merchandiseRepository.findMerchandise(query, {
    page,
    limit,
    sort: { createdAt: -1 },
  });

  return {
    items: result.items,
    pagination: result.pagination,
  };
};

/**
 * Get merchandise by ID (admin - no isActive check)
 */
export const getMerchandiseByIdForAdmin = async (itemId) => {
  const item = await merchandiseRepository.findMerchandiseById(itemId);
  if (!item) {
    throw new ApiError(404, "Merchandise not found");
  }
  return item;
};

/**
 * Get all active merchandise items
 */
export const getMerchandiseItems = async (page = 1, limit = 10) => {
  const query = { isActive: true };

  const result = await merchandiseRepository.findMerchandise(query, {
    page,
    limit,
    sort: { createdAt: -1 },
  });

  return {
    items: result.items,
    pagination: result.pagination,
  };
};

/**
 * Get merchandise item by ID
 */
export const getMerchandiseById = async (itemId) => {
  const item = await merchandiseRepository.findMerchandiseById(itemId);

  if (!item) {
    throw new ApiError(404, "Merchandise item not found");
  }

  if (!item.isActive) {
    throw new ApiError(404, "Merchandise item not available");
  }

  return item;
};

/**
 * Unified claim/purchase handler for merchandise.
 * Supports: points (default), wallet, gateway (Razorpay).
 *
 * Mobile app backward compatibility:
 *   - If paymentMethod is omitted or "points", the original flow runs unchanged.
 *   - New paymentMethod values ("wallet", "gateway") activate money flows.
 *
 * Gateway (Razorpay) two-step flow:
 *   Step 1 — call with paymentMethod:"gateway" and NO razorpayPaymentId
 *            → returns { requiresAction: true, orderId, amount, key }
 *   Step 2 — call again with razorpayOrderId, razorpayPaymentId, razorpaySignature
 *            → verifies payment and creates the claim
 *
 * @param {string} studentId
 * @param {string} itemId
 * @param {object} payload - validated body from controller
 */
export const claimMerchandise = async (studentId, itemId, payload = {}) => {
  const { deliveryAddress } = payload;
  const item = await getMerchandiseById(itemId);

  if (item.stockQuantity !== null && item.stockQuantity <= 0) {
    throw new ApiError(400, "Item is out of stock");
  }

  if (item.isPhysical && !deliveryAddress) {
    throw new ApiError(400, "Delivery address is required for physical items");
  }

  const pointsRequired = item.pointsRequired;
  const wallet = await walletService.getOrCreateWallet(studentId, "User");
  
  if (wallet.rewardPoints < pointsRequired) {
    throw new ApiError(400, "Insufficient reward points");
  }

  await walletService.deductRewardPoints(
    studentId,
    pointsRequired,
    "merchandise_redemption",
    `Redeemed points for: ${item.name}`,
    itemId,
    "MerchandiseClaim"
  );

  const claim = await merchandiseRepository.createMerchandiseClaim({
    student: studentId,
    merchandise: itemId,
    pointsSpent: pointsRequired,
    moneyPaid: 0,
    paymentMethod: "points",
    status: "pending",
    paymentStatus: "completed",
    deliveryAddress: item.isPhysical ? deliveryAddress : undefined,
  });

  if (item.stockQuantity !== null) {
    await merchandiseRepository.updateMerchandise(itemId, { stockQuantity: item.stockQuantity - 1 });
  }

  return await merchandiseRepository.findMerchandiseClaimById(claim._id);
};

export const initiateMerchandisePayment = async (itemId, studentId, paymentMethod, options = {}) => {
  const { couponCode, deliveryAddress } = options;

  const item = await getMerchandiseById(itemId);

  if (item.stockQuantity !== null && item.stockQuantity <= 0) {
    throw new ApiError(400, "Item is out of stock");
  }

  if (item.price === undefined || item.price === null) {
    throw new ApiError(400, "This item cannot be purchased with money.");
  }

  let amountToCharge = item.price;
  let appliedOffer = null;
  let appliedCoupon = null;
  let couponId = null;

  // Merchandise doesn't currently support global pillar offers directly in model, 
  // but if Admin creates it, we apply it. We use getAmountToCharge logic.
  let resolvedOffer = await offerRepository.getActiveOffer("Merchandise");
  
  if (resolvedOffer) {
    const discountAmount = resolvedOffer.discountType === "percentage" 
      ? (item.price * resolvedOffer.discountValue) / 100 
      : Math.min(resolvedOffer.discountValue, item.price);
    amountToCharge = Math.max(0, item.price - discountAmount);
    appliedOffer = {
      _id: resolvedOffer._id,
      offerName: resolvedOffer.offerName,
      applicableOn: resolvedOffer.applicableOn,
      discountType: resolvedOffer.discountType,
      discountValue: resolvedOffer.discountValue,
      description: resolvedOffer.description,
      validTill: resolvedOffer.validTill,
    };
  }

  if (couponCode && String(couponCode).trim()) {
    const result = await couponService.validateCoupon(couponCode.trim(), amountToCharge, "Merchandise", itemId);
    amountToCharge = Math.max(0, amountToCharge - result.discount);
    appliedCoupon = { _id: result.coupon._id, code: result.coupon.code, discountType: result.coupon.discountType, discountValue: result.coupon.discountValue };
    couponId = result.coupon._id;
  }

  if (paymentMethod === "free") {
    if (amountToCharge > 0) {
      throw new ApiError(400, "This item is paid. Use paymentMethod: wallet or razorpay.");
    }
    if (item.isPhysical && !deliveryAddress) {
      throw new ApiError(400, "Delivery address is required for physical items");
    }

    const claim = await merchandiseRepository.createMerchandiseClaim({
      student: studentId,
      merchandise: itemId,
      pointsSpent: 0,
      moneyPaid: 0,
      discount: Math.max(0, item.price - amountToCharge),
      coupon: couponId || null,
      paymentMethod: "free",
      paymentId: "free",
      status: "pending",
      paymentStatus: "completed",
      deliveryAddress: item.isPhysical ? deliveryAddress : undefined,
    });
    
    if (couponId) await couponService.incrementCouponUsedCount(couponId);
    if (item.stockQuantity !== null) {
      await merchandiseRepository.updateMerchandise(itemId, { stockQuantity: item.stockQuantity - 1 });
    }
    
    return { claim, completed: true };
  }

  if (paymentMethod === "wallet") {
    if (amountToCharge < 1) throw new ApiError(400, "This item is free. Use paymentMethod: free.");
    if (item.isPhysical && !deliveryAddress) {
      throw new ApiError(400, "Delivery address is required for physical items");
    }
    
    await walletService.deductMonetaryBalance(studentId, amountToCharge, "User");
    
    const claim = await merchandiseRepository.createMerchandiseClaim({
      student: studentId,
      merchandise: itemId,
      pointsSpent: 0,
      moneyPaid: amountToCharge,
      discount: Math.max(0, item.price - amountToCharge),
      coupon: couponId || null,
      paymentMethod: "wallet",
      paymentId: "wallet",
      status: "pending",
      paymentStatus: "completed",
      deliveryAddress: item.isPhysical ? deliveryAddress : undefined,
    });
    
    if (couponId) await couponService.incrementCouponUsedCount(couponId);
    if (item.stockQuantity !== null) {
      await merchandiseRepository.updateMerchandise(itemId, { stockQuantity: item.stockQuantity - 1 });
    }
    
    return { claim, completed: true };
  }

  if (paymentMethod === "razorpay") {
    if (amountToCharge < 1) throw new ApiError(400, "This item is free.");
    
    const receipt = `merch_${itemId}_${studentId}_${Date.now()}`.substring(0, 40);
    const order = await createRazorpayOrder(amountToCharge, receipt);
    
    await razorpayOrderIntentRepository.create({
      orderId: order.orderId,
      studentId,
      type: "merchandise",
      entityId: itemId,
      entityModel: "Merchandise",
      amountPaise: order.amount,
      currency: order.currency || "INR",
      receipt,
      couponId: couponId || undefined,
    });
    
    return {
      completed: false,
      orderId: order.orderId,
      amount: order.amount,
      currency: order.currency,
      key: process.env.RAZORPAY_KEY_ID,
      itemId,
      title: item.name,
      appliedOffer,
      appliedCoupon,
      originalPrice: item.price,
      discountedPrice: amountToCharge,
    };
  }

  throw new ApiError(400, "Invalid paymentMethod. Use: free, wallet, or razorpay.");
};

export const confirmMerchandisePayment = async (itemId, studentId, { razorpayOrderId, razorpayPaymentId, razorpaySignature, deliveryAddress }) => {
  const item = await getMerchandiseById(itemId);

  if (item.stockQuantity !== null && item.stockQuantity <= 0) {
    throw new ApiError(400, "Item is out of stock");
  }

  if (item.isPhysical && !deliveryAddress) {
    throw new ApiError(400, "Delivery address is required for physical items");
  }

  const isValid = verifyPaymentSignature(razorpayOrderId, razorpayPaymentId, razorpaySignature);
  if (!isValid) throw new ApiError(400, "Payment verification failed");

  const intent = await razorpayOrderIntentRepository.findByOrderId(razorpayOrderId);
  if (!intent) throw new ApiError(400, "Invalid order or payment already used");
  if (intent.studentId?.toString?.() !== studentId?.toString?.()) throw new ApiError(403, "Payment user mismatch");
  if (intent.type !== "merchandise" || intent.entityId?.toString?.() !== itemId?.toString?.()) throw new ApiError(400, "Payment entity mismatch");

  const moneyPaid = intent.amountPaise / 100;
  const discount = Math.max(0, item.price - moneyPaid);

  const claim = await merchandiseRepository.createMerchandiseClaim({
    student: studentId,
    merchandise: itemId,
    pointsSpent: 0,
    moneyPaid,
    discount,
    coupon: intent.couponId || null,
    paymentId: razorpayPaymentId,
    paymentMethod: "razorpay",
    status: "pending",
    paymentStatus: "completed",
    deliveryAddress: item.isPhysical ? deliveryAddress : undefined,
  });

  await razorpayOrderIntentRepository.markReconciled(razorpayOrderId, razorpayPaymentId);
  if (intent.couponId) await couponService.incrementCouponUsedCount(intent.couponId);
  
  if (item.stockQuantity !== null) {
    await merchandiseRepository.updateMerchandise(itemId, { stockQuantity: item.stockQuantity - 1 });
  }

  return await merchandiseRepository.findMerchandiseClaimById(claim._id);
};

/**
 * Get student's merchandise claims
 */
export const getStudentClaims = async (studentId, page = 1, limit = 10) => {
  return await merchandiseRepository.findMerchandiseClaims(
    { student: studentId },
    { page, limit, sort: { claimedAt: -1 } }
  );
};

/**
 * Get all merchandise claims (for admin)
 */
export const getAllClaims = async (page = 1, limit = 10, status = null, search = null) => {
  const query = {};
  if (status) {
    query.status = status;
  }
  if (search && String(search).trim()) {
    const regex = { $regex: String(search).trim(), $options: "i" };
    query.$or = [{ trackingNumber: regex }];
  }

  return await merchandiseRepository.findMerchandiseClaims(query, {
    page,
    limit,
    sort: { claimedAt: -1 },
  });
};

export default {
  getMerchandiseItems,
  getMerchandiseById,
  getAllMerchandiseForAdmin,
  getMerchandiseByIdForAdmin,
  claimMerchandise,
  initiateMerchandisePayment,
  confirmMerchandisePayment,
  getStudentClaims,
  getAllClaims,
};

