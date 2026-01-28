import Order from "../models/Order.js";
import CoursePurchase from "../models/CoursePurchase.js";
import TestPurchase from "../models/TestPurchase.js";
import MerchandiseClaim from "../models/MerchandiseClaim.js";
import { ApiError } from "../utils/ApiError.js";

const findOrderById = async (id) => {
  try {
    return await Order.findById(id)
      .populate("student", "name email phone")
      .populate("coupon", "code discountType discountValue");
  } catch (error) {
    throw new ApiError(500, "Failed to fetch order", error.message);
  }
};

const findOrders = async (query, options = {}) => {
  try {
    const { page = 1, limit = 10, sort = { createdAt: -1 } } = options;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const [orders, total] = await Promise.all([
      Order.find(query)
        .populate("student", "name email phone")
        .populate("coupon", "code discountType discountValue")
        .sort(sort)
        .skip(skip)
        .limit(limitNum),
      Order.countDocuments(query),
    ]);

    return {
      orders,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum) || 1,
      },
    };
  } catch (error) {
    throw new ApiError(500, "Failed to fetch orders", error.message);
  }
};

const createOrder = async (orderData) => {
  try {
    return await Order.create(orderData);
  } catch (error) {
    throw new ApiError(500, "Failed to create order", error.message);
  }
};

const findCoursePurchases = async (studentId) => {
  try {
    return await CoursePurchase.find({ student: studentId, paymentStatus: "completed" })
      .populate("course", "title description price")
      .sort({ purchaseDate: -1 });
  } catch (error) {
    throw new ApiError(500, "Failed to fetch course purchases", error.message);
  }
};

const findTestPurchases = async (studentId) => {
  try {
    return await TestPurchase.find({ student: studentId, paymentStatus: "completed" })
      .populate("test", "title description price")
      .populate("testBundle", "name description price")
      .sort({ purchaseDate: -1 });
  } catch (error) {
    throw new ApiError(500, "Failed to fetch test purchases", error.message);
  }
};

const findMerchandiseClaims = async (studentId) => {
  try {
    return await MerchandiseClaim.find({ student: studentId })
      .populate("merchandise", "name description pointsRequired")
      .sort({ claimedAt: -1 });
  } catch (error) {
    throw new ApiError(500, "Failed to fetch merchandise claims", error.message);
  }
};

const findCoursePurchase = async (filter) => {
  try {
    return await CoursePurchase.findOne(filter);
  } catch (error) {
    throw new ApiError(500, "Failed to fetch course purchase", error.message);
  }
};

const createCoursePurchase = async (purchaseData) => {
  try {
    const purchase = await CoursePurchase.create(purchaseData);
    return await CoursePurchase.findById(purchase._id)
      .populate("course", "title description contentUrl price")
      .populate("student", "name email");
  } catch (error) {
    throw new ApiError(500, "Failed to create course purchase", error.message);
  }
};

const findTestPurchase = async (filter) => {
  try {
    return await TestPurchase.findOne(filter);
  } catch (error) {
    throw new ApiError(500, "Failed to fetch test purchase", error.message);
  }
};

const createTestPurchase = async (purchaseData) => {
  try {
    const purchase = await TestPurchase.create(purchaseData);
    return await TestPurchase.findById(purchase._id)
      .populate("test", "title description durationMinutes totalMarks testType")
      .populate("testBundle", "name description tests price")
      .populate("student", "name email");
  } catch (error) {
    throw new ApiError(500, "Failed to create test purchase", error.message);
  }
};

export default {
  findOrderById,
  findOrders,
  createOrder,
  findCoursePurchases,
  findTestPurchases,
  findMerchandiseClaims,
  findCoursePurchase,
  createCoursePurchase,
  findTestPurchase,
  createTestPurchase,
};

