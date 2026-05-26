import User from "../models/Student.js";
import TestPurchase from "../models/TestPurchase.js";
import CoursePurchase from "../models/CoursePurchase.js";
import EventRegistration from "../models/EventRegistration.js";
import SupportTicket from "../models/SupportTicket.js";
import RevenueTransaction from "../models/RevenueTransaction.js";
import { ApiError } from "../utils/ApiError.js";
import mongoose from "mongoose";

// Register missing CompetitionCategory model to prevent Mongoose populate error
if (!mongoose.models.CompetitionCategory) {
  mongoose.model("CompetitionCategory", new mongoose.Schema({}, { strict: false, collection: "categories" }));
}

// Ensure other populated models are loaded
import "../models/Test.js";
import "../models/TestBundle.js";
import "../models/Category.js";
import "../models/Course.js";


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
 * This utilizes the unified RevenueTransaction collection for perfect synchronization.
 */
const getRazorpayRevenueInRange = async (start, end) => {
  const result = await RevenueTransaction.aggregate([
    {
      $match: {
        paymentStatus: "completed",
        purchasedAt: { $gte: start, $lte: end },
      },
    },
    {
      $group: {
        _id: null,
        total: { $sum: "$amount" },
      },
    },
  ]);
  return Math.round(result[0]?.total || 0);
};

/**
 * Get all-time total revenue from completed purchases/registrations.
 * This utilizes the unified RevenueTransaction collection for perfect synchronization.
 */
const getRazorpayTotalRevenue = async () => {
  const result = await RevenueTransaction.aggregate([
    {
      $match: {
        paymentStatus: "completed",
      },
    },
    {
      $group: {
        _id: null,
        total: { $sum: "$amount" },
      },
    },
  ]);
  return Math.round(result[0]?.total || 0);
};

/**
 * Get daily revenue for the last 7 days
 */
const getDailyRevenueLast7Days = async () => {
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(today.getDate() - 6);
  sevenDaysAgo.setHours(0, 0, 0, 0);

  const transactions = await RevenueTransaction.aggregate([
    {
      $match: {
        paymentStatus: "completed",
        purchasedAt: { $gte: sevenDaysAgo, $lte: today },
      },
    },
    {
      $group: {
        _id: {
          $dateToString: { format: "%Y-%m-%d", date: "$purchasedAt" }
        },
        revenue: { $sum: "$amount" }
      }
    }
  ]);

  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const daywiseRevenue = [];
  let total7Days = 0;

  for (let i = 0; i <= 6; i++) {
    const d = new Date(sevenDaysAgo);
    d.setDate(d.getDate() + i);
    const dateStr = d.toISOString().split("T")[0];
    const match = transactions.find((t) => t._id === dateStr);
    const rev = match ? Math.round(match.revenue) : 0;
    
    total7Days += rev;
    
    // Maintain standard Date format at midnight UTC for consistency if needed by frontend
    const dUTC = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    
    daywiseRevenue.push({
      day: days[d.getDay()],
      revenue: rev,
      date: dUTC.toISOString()
    });
  }

  return {
    daywiseRevenue,
    revenueData: daywiseRevenue,
    revenueSummary: {
      total: total7Days,
      avgPerDay: Math.round(total7Days / 7)
    }
  };
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
 * Get day-wise student registration counts for current month and last month.
 * Returns an array of objects indexed by day-of-month (1..31).
 */
const getStudentRegistrationComparison = async () => {
  const currentMonth = getMonthRange(0);
  const lastMonth = getMonthRange(-1);

  const [currentResult, lastResult] = await Promise.all([
    User.aggregate([
      { $match: { createdAt: { $gte: currentMonth.start, $lte: currentMonth.end } } },
      { $group: { _id: { $dayOfMonth: "$createdAt" }, count: { $sum: 1 } } },
    ]),
    User.aggregate([
      { $match: { createdAt: { $gte: lastMonth.start, $lte: lastMonth.end } } },
      { $group: { _id: { $dayOfMonth: "$createdAt" }, count: { $sum: 1 } } },
    ]),
  ]);

  // Build a lookup map { dayOfMonth -> count }
  const currentMap = {};
  currentResult.forEach((r) => { currentMap[r._id] = r.count; });
  const lastMap = {};
  lastResult.forEach((r) => { lastMap[r._id] = r.count; });

  // Determine how many days to show (max days in either month, capped at today for current)
  const today = new Date();
  const daysInCurrentMonth = today.getDate(); // only up to today
  const daysInLastMonth = new Date(lastMonth.end).getDate();
  const maxDays = Math.max(daysInCurrentMonth, daysInLastMonth);

  const data = [];
  for (let day = 1; day <= maxDays; day++) {
    data.push({
      day,
      thisMonth: currentMap[day] ?? 0,
      lastMonth: lastMap[day] ?? 0,
    });
  }

  return data;
};


/**
 * Get day-wise tests sold counts for current month and last month.
 * Returns an array of objects indexed by day-of-month (1..31).
 */
const getTestSoldComparison = async () => {
  const currentMonth = getMonthRange(0);
  const lastMonth = getMonthRange(-1);

  const [currentResult, lastResult] = await Promise.all([
    TestPurchase.aggregate([
      {
        $match: {
          paymentStatus: "completed",
          purchaseDate: { $gte: currentMonth.start, $lte: currentMonth.end },
        },
      },
      { $group: { _id: { $dayOfMonth: "$purchaseDate" }, count: { $sum: 1 } } },
    ]),
    TestPurchase.aggregate([
      {
        $match: {
          paymentStatus: "completed",
          purchaseDate: { $gte: lastMonth.start, $lte: lastMonth.end },
        },
      },
      { $group: { _id: { $dayOfMonth: "$purchaseDate" }, count: { $sum: 1 } } },
    ]),
  ]);

  const currentMap = {};
  currentResult.forEach((r) => { currentMap[r._id] = r.count; });
  const lastMap = {};
  lastResult.forEach((r) => { lastMap[r._id] = r.count; });

  const today = new Date();
  const daysInCurrentMonth = today.getDate();
  const daysInLastMonth = new Date(lastMonth.end).getDate();
  const maxDays = Math.max(daysInCurrentMonth, daysInLastMonth);

  const data = [];
  for (let day = 1; day <= maxDays; day++) {
    data.push({
      day,
      thisMonth: currentMap[day] ?? 0,
      lastMonth: lastMap[day] ?? 0,
    });
  }

  return data;
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
    totalStudents,
    totalTestsSold,
    chartData,
    studentRegistrationData,
    testSoldData,
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
    User.countDocuments({}),
    TestPurchase.countDocuments({ paymentStatus: "completed" }),
    getDailyRevenueLast7Days(),
    getStudentRegistrationComparison(),
    getTestSoldComparison(),
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
      value: formatCurrency(totalRevenueAllTime),
      change: revenueChangeStr,
      iconKey: "TrendingUp",
      positive: revenueKpi.positive,
    },
    {
      title: "Total Students",
      value: String(totalStudents),
      change: signupsKpi.change,
      iconKey: "Users",
      positive: signupsKpi.positive,
    },
    {
      title: "Total Tests Sold",
      value: String(totalTestsSold),
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

  return {
    stats,
    totalRevenue: totalRevenueAllTime,
    daywiseRevenue: chartData.daywiseRevenue,
    revenueData: chartData.revenueData,
    revenueSummary: chartData.revenueSummary,
    needsAttention: urgentTickets,
    studentRegistrationData,
    testSoldData,
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

  const normalizeType = (value) => {
    if (!value) return null;
    const key = String(value).trim().toLowerCase();
    const aliases = {
      bundle: "test_bundle",
      testbundle: "test_bundle",
      "test-bundle": "test_bundle",
      olympiad: "olympiads",
      olympiads: "olympiads",
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

  const matchStage = {};

  if (requestedTypes.length > 0) {
    matchStage.sourceType = { $in: requestedTypes };
  }

  if (from) {
    const fromDate = new Date(from);
    if (!Number.isNaN(fromDate.getTime())) {
      matchStage.purchasedAt = { $gte: fromDate };
    }
  }

  if (to) {
    const toDate = new Date(to);
    if (!Number.isNaN(toDate.getTime())) {
      if (typeof to === "string" && !to.includes("T")) {
        toDate.setHours(23, 59, 59, 999);
      }
      matchStage.purchasedAt = matchStage.purchasedAt || {};
      matchStage.purchasedAt.$lte = toDate;
    }
  }

  if (search && String(search).trim()) {
    const q = String(search).trim();
    const amountSearch = Number(q);
    
    const searchConditions = [
      { itemName: { $regex: q, $options: "i" } },
      { paymentId: { $regex: q, $options: "i" } },
      { "user.name": { $regex: q, $options: "i" } },
      { "user.email": { $regex: q, $options: "i" } },
      { "user.phone": { $regex: q, $options: "i" } }
    ];

    if (!Number.isNaN(amountSearch)) {
      searchConditions.push({ amount: amountSearch });
    }

    matchStage.$or = searchConditions;
  }

  const pipeline = [
    { $match: { paymentStatus: "completed" } },
    {
      $project: {
        sourceType: { $literal: "course" },
        purchasedAt: { $ifNull: ["$purchaseDate", "$createdAt"] },
        amount: { $convert: { input: "$purchasePrice", to: "double", onError: 0, onNull: 0 } },
        paymentId: { $ifNull: ["$paymentId", ""] },
        paymentStatus: { $ifNull: ["$paymentStatus", "completed"] },
        studentId: "$student",
        itemId: "$course"
      }
    },
    {
      $unionWith: {
        coll: "testpurchases",
        pipeline: [
          { $match: { paymentStatus: "completed" } },
          {
            $project: {
              sourceType: {
                $cond: [
                  { $ifNull: ["$test", false] }, "test",
                  { $cond: [{ $ifNull: ["$testBundle", false] }, "test_bundle", "competition_category"] }
                ]
              },
              purchasedAt: { $ifNull: ["$purchaseDate", "$createdAt"] },
              amount: { $convert: { input: "$purchasePrice", to: "double", onError: 0, onNull: 0 } },
              paymentId: { $ifNull: ["$paymentId", ""] },
              paymentStatus: { $ifNull: ["$paymentStatus", "completed"] },
              studentId: "$student",
              itemId: {
                $cond: [
                  { $ifNull: ["$test", false] }, "$test",
                  { $cond: [{ $ifNull: ["$testBundle", false] }, "$testBundle", "$competitionCategory"] }
                ]
              }
            }
          }
        ]
      }
    },
    {
      $unionWith: {
        coll: "eventregistrations",
        pipeline: [
          { $match: { paymentStatus: "completed" } },
          {
            $project: {
              sourceType: "$eventType",
              purchasedAt: { $ifNull: ["$registeredAt", "$createdAt"] },
              amount: { $convert: { input: "$amountPaid", to: "double", onError: 0, onNull: 0 } },
              paymentId: { $ifNull: ["$paymentId", ""] },
              paymentStatus: { $ifNull: ["$paymentStatus", "completed"] },
              studentId: "$student",
              itemId: "$eventId"
            }
          }
        ]
      }
    },
    {
      $lookup: {
        from: "users",
        localField: "studentId",
        foreignField: "_id",
        as: "userDoc"
      }
    },
    { $unwind: { path: "$userDoc", preserveNullAndEmptyArrays: true } },
    {
      $lookup: { from: "courses", localField: "itemId", foreignField: "_id", as: "cDoc" }
    },
    {
      $lookup: { from: "tests", localField: "itemId", foreignField: "_id", as: "tDoc" }
    },
    {
      $lookup: { from: "testbundles", localField: "itemId", foreignField: "_id", as: "bDoc" }
    },
    {
      $lookup: { from: "categories", localField: "itemId", foreignField: "_id", as: "catDoc" }
    },
    {
      $lookup: { from: "tournaments", localField: "itemId", foreignField: "_id", as: "tournDoc" }
    },
    {
      $lookup: { from: "workshops", localField: "itemId", foreignField: "_id", as: "workDoc" }
    },
    {
      $lookup: { from: "olympiadtests", localField: "itemId", foreignField: "_id", as: "olyDoc" }
    },
    {
      $lookup: { from: "challenges", localField: "itemId", foreignField: "_id", as: "chalDoc" }
    },
    {
      $addFields: {
        itemName: {
          $ifNull: [
            { $arrayElemAt: ["$cDoc.title", 0] },
            { $arrayElemAt: ["$tDoc.title", 0] },
            { $arrayElemAt: ["$bDoc.name", 0] },
            { $arrayElemAt: ["$catDoc.name", 0] },
            { $arrayElemAt: ["$tournDoc.title", 0] },
            { $arrayElemAt: ["$workDoc.title", 0] },
            { $arrayElemAt: ["$olyDoc.title", 0] },
            { $arrayElemAt: ["$chalDoc.title", 0] },
            "Unknown Item"
          ]
        },
        user: {
          id: "$userDoc._id",
          name: { $ifNull: ["$userDoc.name", "Unknown User"] },
          email: { $ifNull: ["$userDoc.email", null] },
          phone: { $ifNull: ["$userDoc.phone", null] }
        }
      }
    },
    {
      $project: {
        cDoc: 0, tDoc: 0, bDoc: 0, catDoc: 0, tournDoc: 0, workDoc: 0, olyDoc: 0, chalDoc: 0, userDoc: 0, studentId: 0, itemId: 0
      }
    },
    { $match: matchStage },
    { $sort: { purchasedAt: -1 } },
    {
      $facet: {
        metadata: [{ $count: "total" }],
        data: [{ $skip: skip }, { $limit: limitNum }],
        revenueSummary: [
          {
            $group: {
              _id: null,
              totalRevenue: { $sum: "$amount" }
            }
          }
        ],
        sourceBreakdown: [
          {
            $group: {
              _id: "$sourceType",
              revenue: { $sum: "$amount" },
              transactions: { $sum: 1 }
            }
          },
          { $sort: { revenue: -1 } },
          {
            $project: {
              sourceType: "$_id",
              revenue: 1,
              transactions: 1,
              _id: 0
            }
          }
        ]
      }
    }
  ];

  const results = await CoursePurchase.aggregate(pipeline);
  const facetResult = results[0];

  const total = facetResult.metadata[0]?.total || 0;
  const transactions = facetResult.data.map(t => ({
    id: t._id,
    sourceType: t.sourceType,
    purchasedAt: t.purchasedAt,
    itemName: t.itemName,
    amount: t.amount,
    paymentId: t.paymentId,
    paymentStatus: t.paymentStatus,
    user: t.user
  }));

  const totalRevenue = facetResult.revenueSummary[0]?.totalRevenue || 0;
  const sourceBreakdown = facetResult.sourceBreakdown || [];

  return {
    summary: {
      totalTransactions: total,
      totalRevenue,
      sourceBreakdown,
    },
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      pages: Math.ceil(total / limitNum) || 1,
    },
    transactions,
  };
};

export default {
  getDashboardData,
  getRevenueHistory,
};
