import RazorpayOrderIntent from "../models/RazorpayOrderIntent.js";
import { ApiError } from "../utils/ApiError.js";

const create = async (data) => {
  try {
    return await RazorpayOrderIntent.create(data);
  } catch (error) {
    if (error.code === 11000) {
      throw new ApiError(409, "Order intent already exists for this orderId");
    }
    throw new ApiError(500, "Failed to create order intent", error.message);
  }
};

const findByOrderId = async (orderId) => {
  try {
    return await RazorpayOrderIntent.findOne({
      orderId: String(orderId).trim(),
      reconciled: false,
    });
  } catch (error) {
    throw new ApiError(500, "Failed to find order intent", error.message);
  }
};

/** Find intent by orderId regardless of reconciled status (for complete/verify flows) */
const findByOrderIdAny = async (orderId) => {
  try {
    return await RazorpayOrderIntent.findOne({
      orderId: String(orderId).trim(),
    });
  } catch (error) {
    throw new ApiError(500, "Failed to find order intent", error.message);
  }
};

const markReconciled = async (orderId, paymentId) => {
  try {
    return await RazorpayOrderIntent.findOneAndUpdate(
      { orderId: String(orderId).trim() },
      { reconciled: true, reconciledAt: new Date(), paymentId },
      { new: true }
    );
  } catch (error) {
    throw new ApiError(500, "Failed to mark intent reconciled", error.message);
  }
};

export default {
  create,
  findByOrderId,
  findByOrderIdAny,
  markReconciled,
};
