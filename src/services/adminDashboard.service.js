import User from "../models/Student.js";
import TestPurchase from "../models/TestPurchase.js";
import CoursePurchase from "../models/CoursePurchase.js";
import EventRegistration from "../models/EventRegistration.js";
import SupportTicket from "../models/SupportTicket.js";

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

export default {
  getDashboardData,
};
