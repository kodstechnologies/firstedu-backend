import offerRepository from "../repository/offer.repository.js";
import couponService from "../services/coupon.service.js";

const MODULE_TO_ITEM_TYPE = {
  Test: "test",
  TestSeries: "testBundle",
  Course: "course",
  Olympiad: "olympiad",
  Tournament: "tournament",
  Workshop: "workshop",
  Ecommerce: "ecommerce",
  CompetitionCategory: "competitionCategory",
  LiveCompetition: "live_competition",
};

/**
 * Resolve amount to charge: Offer is applied first, then coupon stacks on top.
 * - Step 1: Apply offer to original price → priceAfterOffer
 * - Step 2: If coupon provided, apply coupon to priceAfterOffer → final amountToCharge
 * UsedCount is NOT incremented here - only when payment completes.
 * @returns {{ amountToCharge: number, couponId: ObjectId|null, appliedOffer: object|null, appliedCoupon: object|null, originalPrice: number, discountAmount: number }}
 */
export const getAmountToCharge = async (moduleType, originalPrice, couponCode = null) => {
  const price = Number(originalPrice) || 0;
  if (price <= 0) {
    return { amountToCharge: 0, couponId: null, appliedOffer: null, appliedCoupon: null, originalPrice: price, discountAmount: 0 };
  }

  // Step 1: Apply offer first (if any)
  const offerDetails = await getApplicableOfferDetails(moduleType, price);
  const priceAfterOffer = offerDetails.discountedPrice;
  const offerDiscountAmount = offerDetails.discountAmount;

  // Step 2: If coupon provided, apply coupon on top of offer-discounted price
  const itemType = MODULE_TO_ITEM_TYPE[moduleType] || "all";
  if (couponCode && String(couponCode).trim()) {
    const result = await couponService.validateCoupon(couponCode.trim(), priceAfterOffer, itemType);
    const couponDiscount = result.discount;
    const amountToCharge = Math.max(0, priceAfterOffer - couponDiscount);
    const appliedCoupon = {
      _id: result.coupon._id,
      code: result.coupon.code,
      discountType: result.coupon.discountType,
      discountValue: result.coupon.discountValue,
    };
    return {
      amountToCharge,
      couponId: result.coupon._id,
      appliedOffer: offerDetails.appliedOffer,
      appliedCoupon,
      originalPrice: price,
      discountAmount: offerDiscountAmount + couponDiscount,
    };
  }

  return {
    amountToCharge: priceAfterOffer,
    couponId: null,
    appliedOffer: offerDetails.appliedOffer,
    appliedCoupon: null,
    originalPrice: offerDetails.originalPrice,
    discountAmount: offerDiscountAmount,
  };
};

/**
 * Get applied offer details for a product type and price.
 * Returns { appliedOffer, originalPrice, discountedPrice, discountAmount } or { appliedOffer: null } if no offer.
 */
export const getApplicableOfferDetails = async (moduleType, originalPrice) => {
  const price = Number(originalPrice) || 0;
  if (price <= 0) return { appliedOffer: null, originalPrice: price, discountedPrice: price, discountAmount: 0 };

  const offer = await offerRepository.getActiveOffer(moduleType);
  if (!offer) return { appliedOffer: null, originalPrice: price, discountedPrice: price, discountAmount: 0 };

  let discountAmount = 0;
  if (offer.discountType === "percentage") {
    discountAmount = (price * offer.discountValue) / 100;
  } else {
    discountAmount = Math.min(offer.discountValue, price);
  }
  const discountedPrice = Math.max(0, price - discountAmount);

  const appliedOffer = {
    _id: offer._id,
    offerName: offer.offerName,
    applicableOn: offer.applicableOn,
    discountType: offer.discountType,
    discountValue: offer.discountValue,
    description: offer.description,
    validTill: offer.validTill,
  };

  return {
    appliedOffer,
    originalPrice: price,
    discountedPrice,
    discountAmount,
  };
};

/**
 * Attach applied offer to a single item (object with price field)
 */
export const attachOfferToItem = async (item, moduleType, priceField = "price") => {
  const price = item[priceField] != null ? item[priceField] : 0;
  const offerDetails = await getApplicableOfferDetails(moduleType, price);
  const itemObj = typeof item.toObject === "function" ? item.toObject() : { ...item };
  itemObj.appliedOffer = offerDetails.appliedOffer;
  itemObj.originalPrice = offerDetails.originalPrice;
  itemObj.discountedPrice = offerDetails.discountedPrice;
  itemObj.discountAmount = offerDetails.discountAmount;
  itemObj.effectivePrice = offerDetails.discountedPrice;
  if (!offerDetails.appliedOffer) {
    delete itemObj.appliedOffer;
    delete itemObj.discountAmount;
    itemObj.discountedPrice = itemObj.originalPrice;
    itemObj.effectivePrice = itemObj.originalPrice;
  }
  return itemObj;
};

/**
 * Attach applied offer to a list of items
 */
export const attachOfferToList = async (items, moduleType, priceField = "price") => {
  const offer = await offerRepository.getActiveOffer(moduleType);
  if (!offer) {
    return items.map((item) => {
      const obj = typeof item.toObject === "function" ? item.toObject() : { ...item };
      const p = obj[priceField] != null ? obj[priceField] : 0;
      obj.originalPrice = Number(p);
      obj.discountedPrice = Number(p);
      obj.effectivePrice = Number(p);
      return obj;
    });
  }

  return items.map((item) => {
    const obj = typeof item.toObject === "function" ? item.toObject() : { ...item };
    const price = obj[priceField] != null ? obj[priceField] : 0;
    const { appliedOffer, originalPrice, discountedPrice, discountAmount } = (() => {
      const p = Number(price) || 0;
      if (p <= 0) return { appliedOffer: null, originalPrice: p, discountedPrice: p, discountAmount: 0 };
      let d = 0;
      if (offer.discountType === "percentage") d = (p * offer.discountValue) / 100;
      else d = Math.min(offer.discountValue, p);
      return {
        appliedOffer: { _id: offer._id, offerName: offer.offerName, applicableOn: offer.applicableOn, discountType: offer.discountType, discountValue: offer.discountValue, description: offer.description, validTill: offer.validTill },
        originalPrice: p,
        discountedPrice: Math.max(0, p - d),
        discountAmount: d,
      };
    })();
    obj.appliedOffer = appliedOffer;
    obj.originalPrice = originalPrice;
    obj.discountedPrice = discountedPrice;
    obj.effectivePrice = discountedPrice;
    if (appliedOffer) obj.discountAmount = discountAmount;
    return obj;
  });
};
