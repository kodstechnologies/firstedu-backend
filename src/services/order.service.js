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
  if (filters.search && String(filters.search).trim()) {
    const regex = { $regex: String(filters.search).trim(), $options: "i" };
    query.$or = [{ orderNumber: regex }, { paymentId: regex }];
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
 * This aggregates courses, tests, test bundles, events, and merchandise claims
 */
export const getAggregatedOrderHistory = async (
  studentId,
  page = 1,
  limit = 10,
  filters = {}
) => {
  const pageNum = parseInt(page);
  const limitNum = parseInt(limit);
  const skip = (pageNum - 1) * limitNum;
  const { type, from, to } = filters;

  const normalizePaymentMethod = (paymentId, fallbackAmount = 0) => {
    if (!paymentId || paymentId === "free" || Number(fallbackAmount) === 0) return "free";
    if (paymentId === "wallet") return "wallet";
    return "razorpay";
  };

  const toNumber = (value, fallback = 0) => {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
  };

  // Get all purchases, registrations and claims
  const [coursePurchases, testPurchases, merchandiseClaims, eventRegistrations] = await Promise.all([
    orderRepository.findCoursePurchases(studentId),
    orderRepository.findTestPurchases(studentId),
    orderRepository.findMerchandiseClaims(studentId),
    orderRepository.findEventRegistrations(studentId),
  ]);

  // Combine and format into one normalized response
  let allTransactions = [
    ...coursePurchases.map((p) => ({
      id: p._id,
      type: "course",
      date: p.purchaseDate || p.createdAt,
      title: p.course?.title || "Course",
      itemName: p.course?.title || "Course",
      amount: toNumber(p.purchasePrice),
      paymentMethod: normalizePaymentMethod(p.paymentId, p.purchasePrice),
      status: p.paymentStatus,
      data: p,
    })),
    ...testPurchases.map((p) => ({
      id: p._id,
      type: p.test ? "test" : "testbundle",
      date: p.purchaseDate || p.createdAt,
      title: p.test?.title || p.competitionCategory?.title || p.testBundle?.name || "Test/Bundle",
      itemName: p.test?.title || p.competitionCategory?.title || p.testBundle?.name || "Test/Bundle",
      amount: toNumber(p.purchasePrice),
      paymentMethod: normalizePaymentMethod(p.paymentId, p.purchasePrice),
      status: p.paymentStatus,
      data: p,
    })),
    ...eventRegistrations.map((r) => {
      const fallbackAmount = toNumber(r.eventId?.price);
      const amountPaid =
        r.amountPaid !== undefined && r.amountPaid !== null
          ? toNumber(r.amountPaid)
          : fallbackAmount;
      const methodFromModel =
        r.paymentMethod && ["free", "wallet", "razorpay"].includes(r.paymentMethod)
          ? r.paymentMethod
          : null;

      return {
        id: r._id,
        type: r.eventType,
        date: r.registeredAt || r.createdAt,
        title: r.eventId?.title || r.eventType,
        itemName: r.eventId?.title || r.eventType,
        amount: amountPaid,
        paymentMethod:
          methodFromModel || normalizePaymentMethod(r.paymentId, amountPaid),
        status: r.paymentStatus,
        data: r,
      };
    }),
    ...merchandiseClaims.map((c) => ({
      id: c._id,
      type: "merchandise",
      date: c.claimedAt || c.createdAt,
      title: c.merchandise?.name || "Merchandise",
      itemName: c.merchandise?.name || "Merchandise",
      amount: toNumber(c.pointsSpent),
      paymentMethod: "wallet",
      status: c.status,
      amountUnit: "points",
      data: c,
    })),
  ].sort((a, b) => new Date(b.date) - new Date(a.date));

  const normalizeType = (value) => {
    if (!value) return null;
    const normalized = String(value).trim().toLowerCase();
    const aliases = {
      bundle: "testbundle",
      "test-bundle": "testbundle",
      test_bundle: "testbundle",
      testbundle: "testbundle",
    };
    return aliases[normalized] || normalized;
  };

  // Type filter (?type=course or ?type=course,test)
  if (type) {
    const requestedTypes = String(type)
      .split(",")
      .map((item) => normalizeType(item))
      .filter(Boolean);

    if (requestedTypes.length > 0) {
      allTransactions = allTransactions.filter((t) =>
        requestedTypes.includes(normalizeType(t.type))
      );
    }
  }

  // Date filters (?from=2026-01-01&to=2026-01-31)
  if (from) {
    const fromDate = new Date(from);
    if (Number.isNaN(fromDate.getTime())) {
      throw new ApiError(400, "Invalid 'from' date");
    }
    allTransactions = allTransactions.filter((t) => new Date(t.date) >= fromDate);
  }

  if (to) {
    const toDate = new Date(to);
    if (Number.isNaN(toDate.getTime())) {
      throw new ApiError(400, "Invalid 'to' date");
    }
    // Include full end day when only a date is provided (YYYY-MM-DD)
    if (typeof to === "string" && !to.includes("T")) {
      toDate.setHours(23, 59, 59, 999);
    }
    allTransactions = allTransactions.filter((t) => new Date(t.date) <= toDate);
  }

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

