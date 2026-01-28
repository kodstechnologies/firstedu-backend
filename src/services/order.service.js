import { ApiError } from "../utils/ApiError.js";
import orderRepository from "../repository/order.repository.js";

/**
 * Get student's order history
 */
export const getStudentOrders = async (studentId, page = 1, limit = 10) => {
  return await orderRepository.findOrders({ student: studentId }, { page, limit });
};

/**
 * Get all orders (for admin)
 */
export const getAllOrders = async (page = 1, limit = 10, filters = {}) => {
  const query = {};
  if (filters.paymentStatus) {
    query.paymentStatus = filters.paymentStatus;
  }
  if (filters.orderStatus) {
    query.orderStatus = filters.orderStatus;
  }
  if (filters.studentId) {
    query.student = filters.studentId;
  }

  return await orderRepository.findOrders(query, { page, limit });
};

/**
 * Get order by ID
 */
export const getOrderById = async (orderId) => {
  const order = await orderRepository.findOrderById(orderId);

  if (!order) {
    throw new ApiError(404, "Order not found");
  }

  return order;
};

/**
 * Create order from purchase (helper function)
 * This can be called when a purchase is made
 */
export const createOrderFromPurchase = async (
  studentId,
  items,
  paymentMethod,
  paymentId,
  couponId = null,
  discount = 0,
  pointsUsed = 0
) => {
  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const total = Math.max(0, subtotal - discount - pointsUsed);

  // Calculate points earned (e.g., 1 point per 10 rupees spent)
  const pointsEarned = Math.floor(total / 10);

  const order = await orderRepository.createOrder({
    student: studentId,
    items,
    subtotal,
    discount,
    coupon: couponId,
    total,
    paymentMethod,
    paymentId,
    paymentStatus: "completed",
    orderStatus: "confirmed",
    pointsEarned,
    pointsUsed,
  });

  return order;
};

/**
 * Get order history from purchases and claims
 * This aggregates CoursePurchase, TestPurchase, and MerchandiseClaim into order-like format
 */
export const getAggregatedOrderHistory = async (studentId, page = 1, limit = 10) => {
  const pageNum = parseInt(page);
  const limitNum = parseInt(limit);
  const skip = (pageNum - 1) * limitNum;

  // Get all purchases and claims
  const [coursePurchases, testPurchases, merchandiseClaims, ordersResult] = await Promise.all([
    orderRepository.findCoursePurchases(studentId),
    orderRepository.findTestPurchases(studentId),
    orderRepository.findMerchandiseClaims(studentId),
    orderRepository.findOrders({ student: studentId }, { page: 1, limit: 1000 }),
  ]);
  
  const orders = ordersResult.orders;

  // Combine and format
  const allTransactions = [
    ...coursePurchases.map((p) => ({
      id: p._id,
      type: "course_purchase",
      date: p.purchaseDate,
      itemName: p.course?.title || "Course",
      amount: p.purchasePrice,
      status: p.paymentStatus,
      data: p,
    })),
    ...testPurchases.map((p) => ({
      id: p._id,
      type: p.test ? "test_purchase" : "bundle_purchase",
      date: p.purchaseDate,
      itemName: p.test?.title || p.testBundle?.name || "Test/Bundle",
      amount: p.purchasePrice,
      status: p.paymentStatus,
      data: p,
    })),
    ...merchandiseClaims.map((c) => ({
      id: c._id,
      type: "merchandise_claim",
      date: c.claimedAt,
      itemName: c.merchandise?.name || "Merchandise",
      amount: c.pointsSpent,
      status: c.status,
      data: c,
    })),
    ...orders.map((o) => ({
      id: o._id,
      type: "order",
      date: o.createdAt,
      itemName: `Order ${o.orderNumber}`,
      amount: o.total,
      status: o.orderStatus,
      data: o,
    })),
  ].sort((a, b) => new Date(b.date) - new Date(a.date));

  // Paginate
  const total = allTransactions.length;
  const paginatedTransactions = allTransactions.slice(skip, skip + limitNum);

  return {
    transactions: paginatedTransactions,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      pages: Math.ceil(total / limitNum) || 1,
    },
  };
};

export default {
  getStudentOrders,
  getAllOrders,
  getOrderById,
  createOrderFromPurchase,
  getAggregatedOrderHistory,
};

