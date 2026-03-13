import User from "../models/Student.js";
import TestPurchase from "../models/TestPurchase.js";
import SupportTicket from "../models/SupportTicket.js";
import RazorpayWebhookEvent from "../models/RazorpayWebhookEvent.js";

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
 * Get total revenue from Razorpay payments (all purchases + wallet topups via Razorpay).
 * RazorpayWebhookEvent stores payment.captured events; amount is in paise.
 */
const getRazorpayRevenueInRange = async (start, end) => {
  const result = await RazorpayWebhookEvent.aggregate([
    {
      $match: {
        event: "payment.captured",
        createdAt: { $gte: start, $lte: end },
        amount: { $exists: true, $ne: null },
      },
    },
    { $group: { _id: null, totalPaise: { $sum: "$amount" } } },
  ]);
  const totalPaise = result[0]?.totalPaise ?? 0;
  return Math.round(totalPaise / 100); // Convert paise to rupees
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
