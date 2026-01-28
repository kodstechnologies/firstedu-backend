import Coupon from "../models/Coupon.js";
import { ApiError } from "../utils/ApiError.js";

const findCouponByCode = async (code) => {
  try {
    return await Coupon.findOne({ code: code.toUpperCase() });
  } catch (error) {
    throw new ApiError(500, "Failed to fetch coupon", error.message);
  }
};

const findCouponById = async (id) => {
  try {
    return await Coupon.findById(id);
  } catch (error) {
    throw new ApiError(500, "Failed to fetch coupon", error.message);
  }
};

const findCoupons = async (query, options = {}) => {
  try {
    const { page = 1, limit = 10, sort = { createdAt: -1 } } = options;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const [coupons, total] = await Promise.all([
      Coupon.find(query).sort(sort).skip(skip).limit(limitNum),
      Coupon.countDocuments(query),
    ]);

    return {
      coupons,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum) || 1,
      },
    };
  } catch (error) {
    throw new ApiError(500, "Failed to fetch coupons", error.message);
  }
};

const createCoupon = async (couponData) => {
  try {
    return await Coupon.create(couponData);
  } catch (error) {
    throw new ApiError(500, "Failed to create coupon", error.message);
  }
};

const updateCoupon = async (id, updateData) => {
  try {
    return await Coupon.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    });
  } catch (error) {
    throw new ApiError(500, "Failed to update coupon", error.message);
  }
};

const deleteCoupon = async (id) => {
  try {
    return await Coupon.findByIdAndDelete(id);
  } catch (error) {
    throw new ApiError(500, "Failed to delete coupon", error.message);
  }
};

export default {
  findCouponByCode,
  findCouponById,
  findCoupons,
  createCoupon,
  updateCoupon,
  deleteCoupon,
};

