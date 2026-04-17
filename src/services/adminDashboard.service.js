import User from "../models/Student.js";
import TestPurchase from "../models/TestPurchase.js";
import CoursePurchase from "../models/CoursePurchase.js";
import EventRegistration from "../models/EventRegistration.js";
import SupportTicket from "../models/SupportTicket.js";
import { ApiError } from "../utils/ApiError.js";

/**
 * Get start and end of a month (in UTC)
 * @param {number} monthOffset - 0 = current month, -1 = last month, -2 = 2 months ago
 * @returns {{ start: Date, end: Date }}
 */
const getMonthRange = (monthOffset = 0) => {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const targetDate = new Date(year, month + monthOffset, 1);
  const start = new Date(Date.UTC(targetDate.getFullYear(), targetDate.getMonth(), 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(targetDate.getFullYear(), targetDate.getMonth() + 1, 0, 23, 59, 59, 999));
  return { start, end };
};

/**
 * Compute change (value + formatted string) comparing currentPeriod to previousPeriod
 * @param {number} currentVal
 * @param {number} previousVal
 * @param {'number'|'percent'} format - 'number' for absolute diff, 'percent' for % change
 * @returns {{ value: number, change: string, positive: boolean }}
 */
const computeChange = (currentVal, previousVal, format = "percent") => {
  const diff = currentVal - previousVal;
  const positive = diff >= 0;
  let changeStr;
  if (format === "percent") {
    const pct = previousVal === 0 ? (currentVal > 0 ? 100 : 0) : Math.round((diff / previousVal) * 100);
    changeStr = `${positive ? "+" : ""}${pct}%`;
  } else {
    changeStr = `${positive ? "+" : ""}${diff}`;
  }
  return { value: currentVal, change: changeStr, positive };
};

/**
 * Sum revenue from completed purchases/registrations in a date range.
 * This does not depend on webhook logs, so dashboard remains correct even if webhook history is partial.
 */
const getRazorpayRevenueInRange = async (start, end) => {
  const [courseAgg, testAgg, eventAgg] = await Promise.all([
    CoursePurchase.aggregate([
      {
        $match: {
          paymentStatus: "completed",
          purchaseDate: { $gte: start, $lte: end },
          purchasePrice: { $exists: true, $ne: null },
        },
      },
      { $group: { _id: null, total: { $sum: "$purchasePrice" } } },
    ]),
    TestPurchase.aggregate([
      {
        $match: {
          paymentStatus: "completed",
          purchaseDate: { $gte: start, $lte: end },
          purchasePrice: { $exists: true, $ne: null },
        },
      },
      { $group: { _id: null, total: { $sum: "$purchasePrice" } } },
    ]),
    EventRegistration.aggregate([
      {
        $match: {
          paymentStatus: "completed",
          registeredAt: { $gte: start, $lte: end },
          amountPaid: { $exists: true, $ne: null },
        },
      },
      { $group: { _id: null, total: { $sum: "$amountPaid" } } },
    ]),
  ]);

  const courseRevenue = courseAgg[0]?.total ?? 0;
  const testRevenue = testAgg[0]?.total ?? 0;
  const eventRevenue = eventAgg[0]?.total ?? 0;
  return Math.round(courseRevenue + testRevenue + eventRevenue);
};

/**
 * Get all-time total revenue from completed purchases/registrations.
 */
const getRazorpayTotalRevenue = async () => {
  const [courseAgg, testAgg, eventAgg] = await Promise.all([
    CoursePurchase.aggregate([
      {
        $match: {
          paymentStatus: "completed",
          purchasePrice: { $exists: true, $ne: null },
        },
      },
      { $group: { _id: null, total: { $sum: "$purchasePrice" } } },
    ]),
    TestPurchase.aggregate([
      {
        $match: {
          paymentStatus: "completed",
          purchasePrice: { $exists: true, $ne: null },
        },
      },
      { $group: { _id: null, total: { $sum: "$purchasePrice" } } },
    ]),
    EventRegistration.aggregate([
      {
        $match: {
          paymentStatus: "completed",
          amountPaid: { $exists: true, $ne: null },
        },
      },
      { $group: { _id: null, total: { $sum: "$amountPaid" } } },
    ]),
  ]);

  const courseRevenue = courseAgg[0]?.total ?? 0;
  const testRevenue = testAgg[0]?.total ?? 0;
  const eventRevenue = eventAgg[0]?.total ?? 0;
  return Math.round(courseRevenue + testRevenue + eventRevenue);
};

/**
 * Get count of test purchases in date range
 */
const getTestsSoldInRange = async (start, end) => {
  return await TestPurchase.countDocuments({
    purchaseDate: { $gte: start, $lte: end },
    paymentStatus: "completed",
  });
};

/**
 * Get user signup count in date range
 */
const getUserSignupsInRange = async (start, end) => {
  return await User.countDocuments({
    createdAt: { $gte: start, $lte: end },
  });
};

/**
 * Get current count of open/in-progress support tickets
 */
const getOpenTicketsCount = async () => {
  return await SupportTicket.countDocuments({
    status: { $in: ["open", "in_progress"] },
  });
};

const getTicketsOpenedInRange = async (start, end) => {
  return await SupportTicket.countDocuments({
    openedAt: { $gte: start, $lte: end },
  });
};

/**
 * Get urgent support tickets (priority=urgent, raised by users/students)
 * SupportTicket has student ref - all are user-raised. Filter: priority=urgent, status in open/in_progress
 */
const getUrgentTickets = async (limit = 10) => {
  const tickets = await SupportTicket.find({
    priority: "urgent",
    status: { $in: ["open", "in_progress"] },
  })
    .populate("student", "name email")
    .sort({ lastMessageAt: -1 })
    .limit(limit)
    .lean();

  return tickets.map((t) => ({
    id: t._id,
    ticketNumber: t.ticketNumber,
    subject: t.subject,
    student: t.student?.name || "Unknown",
    lastUpdate: t.lastMessageAt
      ? new Date(t.lastMessageAt).toLocaleDateString("en-IN", {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })
      : null,
    priority: t.priority,
    status: t.status,
  }));
};

/**
 * Get revenue by day for last 7 days
 */
const getRevenueLast7Days = async () => {
  const now = new Date();
  const start = new Date(now);
  start.setDate(start.getDate() - 6);
  start.setHours(0, 0, 0, 0);

  const dayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const results = [];

  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
    const dayEnd = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);

    const revenue = await getRazorpayRevenueInRange(dayStart, dayEnd);
    const label = dayLabels[dayStart.getDay()];
    results.push({ day: label, revenue: Math.round(revenue), date: dayStart });
  }

  return results;
};

/**
 * Admin Dashboard - main aggregation
 * KPIs: current month = main value, last month = comparison
 */
export const getDashboardData = async () => {
  const currentMonth = getMonthRange(0);
  const lastMonth = getMonthRange(-1);

  const [
    revenueCurrentMonth,
    revenueLastMonth,
    signupsCurrentMonth,
    signupsLastMonth,
    testsSoldCurrentMonth,
    testsSoldLastMonth,
    openTicketsNow,
    ticketsOpenedCurrentMonth,
    ticketsOpenedLastMonth,
    totalRevenueAllTime,
    revenueChart,
  ] = await Promise.all([
    getRazorpayRevenueInRange(currentMonth.start, currentMonth.end),
    getRazorpayRevenueInRange(lastMonth.start, lastMonth.end),
    getUserSignupsInRange(currentMonth.start, currentMonth.end),
    getUserSignupsInRange(lastMonth.start, lastMonth.end),
    getTestsSoldInRange(currentMonth.start, currentMonth.end),
    getTestsSoldInRange(lastMonth.start, lastMonth.end),
    getOpenTicketsCount(),
    getTicketsOpenedInRange(currentMonth.start, currentMonth.end),
    getTicketsOpenedInRange(lastMonth.start, lastMonth.end),
    getRazorpayTotalRevenue(),
    getRevenueLast7Days(),
  ]);

  const formatCurrency = (n) => `₹${Number(n).toLocaleString("en-IN")}`;

  const revenueKpi = computeChange(revenueCurrentMonth, revenueLastMonth, "number");
  const signupsKpi = computeChange(signupsCurrentMonth, signupsLastMonth, "percent");
  const testsKpi = computeChange(testsSoldCurrentMonth, testsSoldLastMonth, "number");
  const ticketsKpi = computeChange(ticketsOpenedCurrentMonth, ticketsOpenedLastMonth, "number");

  const revenueDiff = revenueCurrentMonth - revenueLastMonth;
  const revenueChangeStr =
    revenueDiff >= 0 ? `+${formatCurrency(revenueDiff)}` : formatCurrency(revenueDiff);

  const stats = [
    {
      title: "Total Revenue",
      value: formatCurrency(revenueCurrentMonth),
      change: revenueChangeStr,
      iconKey: "TrendingUp",
      positive: revenueKpi.positive,
    },
    {
      title: "New Signups",
      value: String(signupsCurrentMonth),
      change: signupsKpi.change,
      iconKey: "Users",
      positive: signupsKpi.positive,
    },
    {
      title: "Tests Sold",
      value: String(testsSoldCurrentMonth),
      change: testsKpi.change,
      iconKey: "ShoppingCart",
      positive: testsKpi.positive,
    },
    {
      title: "Open Support Tickets",
      value: String(openTicketsNow),
      change: ticketsKpi.change,
      iconKey: "LifeBuoy",
      positive: !ticketsKpi.positive, // more open tickets = bad
    },
  ];

  const urgentTickets = await getUrgentTickets(10);
  const totalRevenue7Days = revenueChart.reduce((s, d) => s + d.revenue, 0);

  return {
    stats,
    // Explicit revenue keys for clients expecting direct fields
    totalRevenue: totalRevenueAllTime,
    daywiseRevenue: revenueChart,
    revenueData: revenueChart,
    revenueSummary: {
      total: totalRevenue7Days,
      avgPerDay: Math.round(totalRevenue7Days / 7),
    },
    needsAttention: urgentTickets,
  };
};

/**
 * Admin revenue history (who purchased what, amount, and source).
 * Supports filters: page, limit, type, from, to, search.
 */
export const getRevenueHistory = async ({
  page = 1,
  limit = 20,
  type,
  from,
  to,
  search,
} = {}) => {
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const skip = (pageNum - 1) * limitNum;

  const parseDate = (value, label) => {
    if (!value) return null;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) {
      throw new ApiError(400, `Invalid '${label}' date`);
    }
    return d;
  };

  const fromDate = parseDate(from, "from");
  const toDate = parseDate(to, "to");
  if (toDate && typeof to === "string" && !to.includes("T")) {
    toDate.setHours(23, 59, 59, 999);
  }
  if (fromDate && toDate && fromDate > toDate) {
    throw new ApiError(400, "'from' date cannot be after 'to' date");
  }

  const buildRange = (dateField) => {
    const query = {
      paymentStatus: "completed",
    };

    if (fromDate || toDate) {
      query[dateField] = {};
      if (fromDate) query[dateField].$gte = fromDate;
      if (toDate) query[dateField].$lte = toDate;
    }

    return query;
  };

  const normalizeType = (value) => {
    const key = String(value || "").trim().toLowerCase();
    const aliases = {
      bundle: "test_bundle",
      "test-bundle": "test_bundle",
      testbundle: "test_bundle",
      test_bundle: "test_bundle",
      competition: "competition_category",
      competitioncategory: "competition_category",
      competition_category: "competition_category",
      livecompetition: "live_competition",
      live_competition: "live_competition",
    };
    return aliases[key] || key;
  };

  const requestedTypes = type
    ? String(type)
        .split(",")
        .map((t) => normalizeType(t))
        .filter(Boolean)
    : [];

  const [coursePurchases, testPurchases, eventRegistrations] = await Promise.all([
    CoursePurchase.find(buildRange("purchaseDate"))
      .populate("student", "name email phone")
      .populate("course", "title")
      .lean(),
    TestPurchase.find(buildRange("purchaseDate"))
      .populate("student", "name email phone")
      .populate("test", "title")
      .populate("testBundle", "name")
      .populate("competitionCategory", "title")
      .lean(),
    EventRegistration.find({
      ...buildRange("registeredAt"),
      eventType: { $in: ["tournament", "workshop"] },
    })
      .populate("student", "name email phone")
      .populate("eventId", "title")
      .lean(),
  ]);

  const getStudentData = (student) => ({
    id: student?._id || null,
    name: student?.name || "Unknown User",
    email: student?.email || null,
    phone: student?.phone || null,
  });

  const transactions = [
    ...coursePurchases.map((p) => ({
      id: p._id,
      sourceType: "course",
      purchasedAt: p.purchaseDate || p.createdAt,
      itemName: p.course?.title || "Course",
      amount: Number(p.purchasePrice) || 0,
      paymentId: p.paymentId || null,
      paymentStatus: p.paymentStatus,
      user: getStudentData(p.student),
    })),
    ...testPurchases.map((p) => {
      const sourceType = p.test
        ? "test"
        : p.testBundle
          ? "test_bundle"
          : "competition_category";
      const itemName =
        p.test?.title ||
        p.testBundle?.name ||
        p.competitionCategory?.title ||
        "Test Purchase";

      return {
        id: p._id,
        sourceType,
        purchasedAt: p.purchaseDate || p.createdAt,
        itemName,
        amount: Number(p.purchasePrice) || 0,
        paymentId: p.paymentId || null,
        paymentStatus: p.paymentStatus,
        user: getStudentData(p.student),
      };
    }),
    ...eventRegistrations.map((r) => ({
      id: r._id,
      sourceType: r.eventType,
      purchasedAt: r.registeredAt || r.createdAt,
      itemName: r.eventId?.title || r.eventType || "Event Registration",
      amount: Number(r.amountPaid) || 0,
      paymentId: r.paymentId || null,
      paymentStatus: r.paymentStatus,
      user: getStudentData(r.student),
    })),
  ]
    .sort((a, b) => new Date(b.purchasedAt) - new Date(a.purchasedAt));

  let filteredTransactions = transactions;

  if (requestedTypes.length > 0) {
    filteredTransactions = filteredTransactions.filter((t) =>
      requestedTypes.includes(normalizeType(t.sourceType))
    );
  }

  if (search && String(search).trim()) {
    const q = String(search).trim().toLowerCase();
    filteredTransactions = filteredTransactions.filter((t) => {
      const haystack = [
        t.itemName,
        t.sourceType,
        t.paymentId,
        t.user?.name,
        t.user?.email,
        t.user?.phone,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }

  const totalRevenue = filteredTransactions.reduce(
    (sum, entry) => sum + (Number(entry.amount) || 0),
    0
  );

  const breakdownMap = filteredTransactions.reduce((acc, entry) => {
    const key = entry.sourceType;
    if (!acc[key]) {
      acc[key] = { sourceType: key, transactions: 0, revenue: 0 };
    }
    acc[key].transactions += 1;
    acc[key].revenue += Number(entry.amount) || 0;
    return acc;
  }, {});

  const sourceBreakdown = Object.values(breakdownMap).sort(
    (a, b) => b.revenue - a.revenue
  );

  const total = filteredTransactions.length;
  const paginatedTransactions = filteredTransactions.slice(skip, skip + limitNum);

  return {
    summary: {
      totalTransactions: total,
      totalRevenue: Math.round(totalRevenue),
      sourceBreakdown: sourceBreakdown.map((entry) => ({
        ...entry,
        revenue: Math.round(entry.revenue),
      })),
    },
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      pages: Math.ceil(total / limitNum) || 1,
    },
    transactions: paginatedTransactions.map((entry) => ({
      ...entry,
      amount: Math.round(Number(entry.amount) || 0),
    })),
  };
};

export default {
  getDashboardData,
  getRevenueHistory,
};
