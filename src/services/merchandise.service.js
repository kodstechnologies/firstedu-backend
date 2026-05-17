import { ApiError } from "../utils/ApiError.js";
import merchandiseRepository from "../repository/merchandise.repository.js";
import walletService from "./wallet.service.js";
import { attachOfferToList, attachOfferToItem, getAmountToCharge } from "../utils/offerUtils.js";
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

  const itemsWithOffer = await attachOfferToList(result.items, "Ecommerce", "pointsRequired");
  return {
    items: itemsWithOffer,
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

  return await attachOfferToItem(item, "Ecommerce", "pointsRequired");
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
  const {
    deliveryAddress,
    couponCode = null,
    paymentMethod = "points",
    razorpayOrderId,
    razorpayPaymentId,
    razorpaySignature,
  } = payload;

  const item = await getMerchandiseById(itemId);

  // Stock check (shared for all methods)
  if (item.stockQuantity !== null && item.stockQuantity <= 0) {
    throw new ApiError(400, "Item is out of stock");
  }

  // Delivery address check (shared for physical items)
  if (item.isPhysical && !deliveryAddress) {
    throw new ApiError(400, "Delivery address is required for physical items");
  }

  // ── GATEWAY (Razorpay) ─────────────────────────────────────────────────────
  if (paymentMethod === "gateway") {
    if (!item.price || item.price <= 0) {
      throw new ApiError(400, "This item is not available for money purchase");
    }

    // STEP 1: Initiate — no payment receipt yet → create Razorpay order
    if (!razorpayPaymentId) {
      const razorpayKeyId = process.env.RAZORPAY_KEY_ID;
      if (!razorpayKeyId || !process.env.RAZORPAY_KEY_SECRET) {
        throw new ApiError(500, "Payment gateway not configured");
      }

      const receipt = `merch_${itemId}_${studentId}_${Date.now()}`.substring(0, 40);
      let order;
      try {
        order = await createRazorpayOrder(item.price, receipt);
      } catch (err) {
        throw new ApiError(500, "Payment gateway error. Please try again later.");
      }

      await razorpayOrderIntentRepository.create({
        orderId: order.orderId,
        studentId,
        type: "merchandise",
        entityId: itemId,
        entityModel: "Merchandise",
        amountPaise: order.amount,
        currency: order.currency || "INR",
        receipt,
      });

      // Tell the frontend to open Razorpay checkout
      return {
        requiresAction: true,
        orderId: order.orderId,
        amount: order.amount,
        currency: order.currency || "INR",
        key: razorpayKeyId,
        itemName: item.name,
      };
    }

    // STEP 2: Verify — payment receipt present → verify and create claim
    if (!razorpayOrderId || !razorpaySignature) {
      throw new ApiError(400, "Missing Razorpay payment details");
    }

    const isValid = verifyPaymentSignature(razorpayOrderId, razorpayPaymentId, razorpaySignature);
    if (!isValid) {
      throw new ApiError(400, "Payment verification failed");
    }

    const intent = await razorpayOrderIntentRepository.findByOrderId(razorpayOrderId);
    if (!intent) throw new ApiError(400, "Invalid payment session");
    if (intent.studentId?.toString() !== studentId?.toString()) throw new ApiError(403, "Unauthorized");
    if (intent.type !== "merchandise" || intent.entityId?.toString() !== itemId?.toString()) {
      throw new ApiError(400, "Payment does not match this item");
    }

    const moneyPaid = intent.amountPaise / 100;

    const claim = await merchandiseRepository.createMerchandiseClaim({
      student: studentId,
      merchandise: itemId,
      pointsSpent: 0,
      moneyPaid,
      paymentMethod: "gateway",
      paymentId: razorpayPaymentId,
      status: "pending",
      deliveryAddress: item.isPhysical ? deliveryAddress : undefined,
    });

    await razorpayOrderIntentRepository.markReconciled(razorpayOrderId, razorpayPaymentId);

    if (item.stockQuantity !== null) {
      await merchandiseRepository.updateMerchandise(itemId, { stockQuantity: item.stockQuantity - 1 });
    }

    return await merchandiseRepository.findMerchandiseClaimById(claim._id);
  }

  // ── WALLET ─────────────────────────────────────────────────────────────────
  if (paymentMethod === "wallet") {
    if (!item.price || item.price <= 0) {
      throw new ApiError(400, "This item is not available for money purchase");
    }

    await walletService.deductMonetaryBalance(studentId, item.price, "User");

    const claim = await merchandiseRepository.createMerchandiseClaim({
      student: studentId,
      merchandise: itemId,
      pointsSpent: 0,
      moneyPaid: item.price,
      paymentMethod: "wallet",
      paymentId: "wallet",
      status: "pending",
      deliveryAddress: item.isPhysical ? deliveryAddress : undefined,
    });

    if (item.stockQuantity !== null) {
      await merchandiseRepository.updateMerchandise(itemId, { stockQuantity: item.stockQuantity - 1 });
    }

    return await merchandiseRepository.findMerchandiseClaimById(claim._id);
  }

  // ── POINTS (default — original mobile app flow, untouched) ─────────────────
  const basePoints = item.discountedPrice != null ? item.discountedPrice : item.pointsRequired;
  const { amountToCharge: pointsRequired, couponId } = await getAmountToCharge(
    "Ecommerce",
    basePoints,
    couponCode
  );

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
    deliveryAddress: item.isPhysical ? deliveryAddress : undefined,
  });

  if (item.stockQuantity !== null) {
    await merchandiseRepository.updateMerchandise(itemId, { stockQuantity: item.stockQuantity - 1 });
  }

  if (couponId) {
    await couponService.incrementCouponUsedCount(couponId);
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
  getStudentClaims,
  getAllClaims,
};

