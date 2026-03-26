import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import orderService from "../services/order.service.js";

/**
 * Get student's order history
 */
export const getMyOrders = asyncHandler(async (req, res) => {
  const studentId = req.user._id;
  const { page = 1, limit = 10, type, from, to } = req.query;

  const result = await orderService.getAggregatedOrderHistory(studentId, page, limit, {
    type,
    from,
    to,
  });

  return res.status(200).json(
    ApiResponse.success(
      result.transactions,
      "Order history fetched successfully",
      result.pagination
    )
  );
});

/**
 * Get all orders (admin)
 */
export const getAllOrders = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10, paymentStatus, orderStatus, studentId, search } = req.query;

  const filters = {
    paymentStatus,
    orderStatus,
    studentId,
    search,
  };

  const result = await orderService.getAllOrders(page, limit, filters);

  return res.status(200).json(
    ApiResponse.success(
      result.orders,
      "Orders fetched successfully",
      result.pagination
    )
  );
});

/**
 * Get order by ID
 */
export const getOrderById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const order = await orderService.getOrderById(id);

  return res
    .status(200)
    .json(ApiResponse.success(order, "Order fetched successfully"));
});

export default {
  getMyOrders,
  getAllOrders,
  getOrderById,
};

