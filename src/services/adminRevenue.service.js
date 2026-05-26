import RevenueTransaction from "../models/RevenueTransaction.js";
import User from "../models/Student.js";
import { ApiError } from "../utils/ApiError.js";

const escapeRegex = (value) =>
  String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const CATEGORY_SOURCE_BY_PILLAR = {
  School: "school",
  Competitive: "competitive",
  "Skill Development": "skill_development",
  Olympiads: "olympiads",
};

export const getCategoryRevenueSourceType = (pillar) =>
  CATEGORY_SOURCE_BY_PILLAR[pillar] || "competition_category";

import Category from "../models/Category.js";

const getCategoryAndDescendants = async (cid) => {
  const allIds = [new Category.db.base.Types.ObjectId(cid)];
  let currentParents = [cid];
  while (currentParents.length > 0) {
    const children = await Category.find({ parent: { $in: currentParents } }).select("_id").lean();
    if (children.length === 0) break;
    const childIds = children.map((c) => c._id);
    allIds.push(...childIds);
    currentParents = childIds;
  }
  return allIds;
};

/**
 * Get revenue history from the dedicated RevenueTransaction model.
 * Supports filtering, pagination, and search.
 */
export const getRevenueHistory = async ({
  page = 1,
  limit = 20,
  type,
  pillar,
  categoryId,
  subCategory,
  from,
  to,
  search,
} = {}) => {
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const skip = (pageNum - 1) * limitNum;

  const matchStage = { paymentStatus: "completed" };

  // Date filters
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

  if (from && to && matchStage.purchasedAt.$gte > matchStage.purchasedAt.$lte) {
    throw new ApiError(400, "'from' date cannot be after 'to' date");
  }

  const andConditions = [];

  // Source Type filter
  if (type) {
    const requestedTypes = String(type)
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);
    if (requestedTypes.length > 0) {
      const pillarBySourceType = {
        school: "School",
        competitive: "Competitive",
        skill_development: "Skill Development",
        olympiads: "Olympiads",
      };
      const requestedPillars = requestedTypes
        .map((sourceType) => pillarBySourceType[sourceType])
        .filter(Boolean);

      if (requestedPillars.length > 0) {
        const legacyCategoryIds = await Category.find({
          rootType: { $in: requestedPillars },
        }).distinct("_id");
        
        andConditions.push({
          $or: [
            { sourceType: { $in: requestedTypes } },
            {
              $and: [
                { sourceType: "competition_category" },
                {
                  $or: [
                    { categoryId: { $in: legacyCategoryIds } },
                    { categoryName: { $in: requestedPillars } },
                  ],
                },
              ],
            },
          ],
        });
      } else {
        if (requestedTypes.includes("competition_category")) {
          const allPillars = Object.values(pillarBySourceType);
          const legacyCategoryIds = await Category.find({
            rootType: { $in: allPillars },
          }).distinct("_id");
          
          const exactCompetitionFilter = {
            $and: [
              { sourceType: "competition_category" },
              { categoryId: { $nin: legacyCategoryIds } },
              { categoryName: { $nin: allPillars } }
            ]
          };
          
          const otherTypes = requestedTypes.filter(t => t !== "competition_category");
          if (otherTypes.length > 0) {
            andConditions.push({
              $or: [
                exactCompetitionFilter,
                { sourceType: { $in: otherTypes } }
              ]
            });
          } else {
            andConditions.push(exactCompetitionFilter);
          }
        } else {
          andConditions.push({ sourceType: { $in: requestedTypes } });
        }
      }
    }
  }

  // Pillar / Category / Subcategory filter
  if (categoryId && !Category.db.base.Types.ObjectId.isValid(categoryId)) {
    throw new ApiError(400, "Invalid categoryId");
  }

  if (categoryId && subCategory) {
    const allDescendantIds = await getCategoryAndDescendants(categoryId);
    const fallback = {
      $and: [
        { categoryId: null },
        { subCategoryName: { $regex: new RegExp(`^${escapeRegex(String(subCategory).trim())}$`, "i") } }
      ]
    };
    if (pillar) {
      fallback.$and.push({
        categoryName: { $regex: new RegExp(`^${escapeRegex(String(pillar).trim())}$`, "i") }
      });
    }
    
    andConditions.push({
      $or: [
        { categoryId: { $in: allDescendantIds } },
        fallback
      ]
    });
  } else if (categoryId) {
    const allDescendantIds = await getCategoryAndDescendants(categoryId);
    andConditions.push({ categoryId: { $in: allDescendantIds } });
  } else if (subCategory) {
    andConditions.push({ subCategoryName: { $regex: new RegExp(`^${escapeRegex(String(subCategory).trim())}$`, "i") } });
  } else if (pillar) {
    const normalizedPillar = String(pillar).trim();
    const categoryIds = await Category.find({
      rootType: normalizedPillar,
    }).distinct("_id");
    
    andConditions.push({
      $or: [
        { categoryId: { $in: categoryIds } },
        { categoryName: { $regex: new RegExp(`^${escapeRegex(normalizedPillar)}$`, "i") } }
      ]
    });
  }

  // Search filter
  if (search && String(search).trim()) {
    const q = String(search).trim();
    const amountSearch = Number(q);
    
    const searchConditions = [
      { itemName: { $regex: q, $options: "i" } },
      { paymentId: { $regex: q, $options: "i" } },
      { categoryName: { $regex: q, $options: "i" } },
      { subCategoryName: { $regex: q, $options: "i" } }
    ];

    if (!Number.isNaN(amountSearch)) {
      searchConditions.push({ amount: amountSearch });
    }

    andConditions.push({ $or: searchConditions });
  }

  if (andConditions.length > 0) {
    matchStage.$and = andConditions;
  }

  // Execute query
  const total = await RevenueTransaction.countDocuments(matchStage);

  const transactions = await RevenueTransaction.find(matchStage)
    .populate("student", "name email phone")
    .populate("categoryId", "rootType")
    .sort({ purchasedAt: -1 })
    .skip(skip)
    .limit(limitNum)
    .lean();

  // Format transactions to match frontend expectations
  const formattedTransactions = transactions.map((t) => ({
    id: t._id,
    sourceType:
      t.sourceType === "competition_category"
        ? getCategoryRevenueSourceType(t.categoryId?.rootType || t.categoryName)
        : t.sourceType,
    purchasedAt: t.purchasedAt,
    itemName: t.itemName,
    categoryName: t.categoryName || "-",
    subCategoryName: t.subCategoryName || "-",
    amount: t.amount,
    paymentId: t.paymentId,
    paymentStatus: t.paymentStatus,
    user: t.student ? {
      id: t.student._id,
      name: t.student.name || "Unknown User",
      email: t.student.email,
      phone: t.student.phone
    } : { name: "Unknown User" }
  }));

  // Summary aggregation
  const summaryAgg = await RevenueTransaction.aggregate([
    { $match: matchStage },
    {
      $set: {
        numericAmount: {
          $convert: { input: "$amount", to: "double", onError: 0, onNull: 0 },
        },
      },
    },
    {
      $facet: {
        totalRevenue: [
          { $group: { _id: null, total: { $sum: "$numericAmount" } } }
        ],
        sourceBreakdown: [
          {
            $lookup: {
              from: "categories",
              localField: "categoryId",
              foreignField: "_id",
              as: "categoryDetails"
            }
          },
          {
            $unwind: { path: "$categoryDetails", preserveNullAndEmptyArrays: true }
          },
          {
            $addFields: {
              resolvedSourceType: {
                $cond: {
                  if: { $eq: ["$sourceType", "competition_category"] },
                  then: {
                    $switch: {
                      branches: [
                        { case: { $eq: ["$categoryDetails.rootType", "School"] }, then: "school" },
                        { case: { $eq: ["$categoryDetails.rootType", "Competitive"] }, then: "competitive" },
                        { case: { $eq: ["$categoryDetails.rootType", "Skill Development"] }, then: "skill_development" },
                        { case: { $eq: ["$categoryDetails.rootType", "Olympiads"] }, then: "olympiads" },
                        { case: { $eq: ["$categoryName", "School"] }, then: "school" },
                        { case: { $eq: ["$categoryName", "Competitive"] }, then: "competitive" },
                        { case: { $eq: ["$categoryName", "Skill Development"] }, then: "skill_development" },
                        { case: { $eq: ["$categoryName", "Olympiads"] }, then: "olympiads" }
                      ],
                      default: "competition_category"
                    }
                  },
                  else: "$sourceType"
                }
              }
            }
          },
          { $group: { _id: "$resolvedSourceType", revenue: { $sum: "$numericAmount" }, transactions: { $sum: 1 } } },
          { $sort: { revenue: -1 } },
          { $project: { sourceType: "$_id", revenue: 1, transactions: 1, _id: 0 } }
        ]
      }
    }
  ]);

  const totalRevenue = summaryAgg[0]?.totalRevenue[0]?.total || 0;
  const sourceBreakdown = summaryAgg[0]?.sourceBreakdown || [];

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
    transactions: formattedTransactions,
  };
};

// Category model already imported at top

const resolveCategoryDetails = async (categoryId) => {
  if (!categoryId) return { categoryName: "-", subCategoryName: "-" };
  try {
    const cat = await Category.findById(categoryId).lean();
    if (!cat) return { categoryName: "-", subCategoryName: "-" };

    let currentNode = cat;

    while (currentNode.parent) {
      const parentNode = await Category.findById(currentNode.parent).lean();
      if (!parentNode) break;
      currentNode = parentNode;
    }

    const pillarName = currentNode.rootType || currentNode.name || "-";

    if (!cat.parent) {
      return {
        categoryName: pillarName,
        subCategoryName: "-"
      };
    }

    return {
      categoryName: pillarName,
      subCategoryName: cat.name
    };
  } catch (err) {
    console.error("Failed to resolve category details:", err.message);
    return { categoryName: "-", subCategoryName: "-" };
  }
};

export const logTransaction = async ({
  studentId,
  amount,
  sourceType,
  itemId,
  itemName,
  categoryId,
  categoryName,
  subCategoryId,
  subCategoryName,
  paymentId,
  paymentStatus = "completed"
}) => {
  try {
    if (!studentId || !sourceType || !itemId || !itemName) {
      console.warn("[Admin Revenue] Missing required fields for logging transaction");
      return null;
    }

    const parsedAmount = Number(amount);
    const finalAmount = Number.isFinite(parsedAmount) ? parsedAmount : 0;

    // For revenue tracking we typically only want > 0, but 0 amount can be kept for "free" transactions
    // If you prefer not tracking free transactions, you could add: if (finalAmount <= 0) return null;

    // Resolve categories if ID is provided but names are missing
    let finalCatName = categoryName;
    let finalSubCatName = subCategoryName;

    if (categoryId && (!categoryName || !subCategoryName)) {
      const resolved = await resolveCategoryDetails(categoryId);
      finalCatName = categoryName || resolved.categoryName;
      finalSubCatName = subCategoryName || resolved.subCategoryName;
    }

    const transaction = await RevenueTransaction.create({
      student: studentId,
      amount: finalAmount,
      sourceType,
      itemId,
      itemName,
      categoryId,
      categoryName: finalCatName || "-",
      subCategoryName: finalSubCatName || "-",
      paymentId: paymentId || "unknown",
      paymentStatus,
      purchasedAt: new Date()
    });

    return transaction;
  } catch (error) {
    console.error("[Admin Revenue] Failed to log revenue transaction:", error.message);
    return null;
  }
};

/**
 * Returns two sets of names that appear in completed revenue transactions:
 *  - names:       distinct subCategoryName values (the purchased node's name)
 *  - parentNames: distinct categoryName values (the intermediate ancestor name)
 *
 * Both sets are returned WITHOUT strict pillar filtering because old records
 * stored intermediate node names (e.g. "CBSE") as categoryName instead of
 * the pillar root ("School"). The frontend checks both sets to decide
 * which category tree buttons should be active.
 */
export const getActiveSubcategoryNames = async (pillar) => {
  const normalizedPillar = String(pillar || "").trim();
  const categories = normalizedPillar
    ? await Category.find({ rootType: normalizedPillar })
      .select("_id parent")
      .lean()
    : [];
  const categoryIds = categories.map((category) => category._id);
  const categoryIdSet = new Set(categoryIds.map((id) => String(id)));
  const categoryById = new Map(
    categories.map((category) => [String(category._id), category])
  );
  const base = normalizedPillar
    ? {
      paymentStatus: "completed",
      $or: [
        { categoryId: { $in: categoryIds } },
        {
          categoryName: {
            $regex: new RegExp(`^${escapeRegex(normalizedPillar)}$`, "i"),
          },
        },
      ],
    }
    : { paymentStatus: "completed" };

  const [storedCategoryIds, subCatNames, catNames] = await Promise.all([
    RevenueTransaction.distinct("categoryId", base),
    RevenueTransaction.distinct("subCategoryName", {
      ...base,
      categoryId: null,
      subCategoryName: { $nin: ["-", null, ""] },
    }),
    RevenueTransaction.distinct("categoryName", {
      ...base,
      categoryId: null,
      categoryName: { $nin: ["-", null, ""] },
    }),
  ]);

  const directCategoryIds = storedCategoryIds
    .map((id) => String(id))
    .filter((id) => !normalizedPillar || categoryIdSet.has(id));
  const ancestorCategoryIds = new Set();
  directCategoryIds.forEach((id) => {
    let current = categoryById.get(id);
    while (current?.parent) {
      const parentId = String(current.parent);
      ancestorCategoryIds.add(parentId);
      current = categoryById.get(parentId);
    }
  });

  return {
    directCategoryIds,
    ancestorCategoryIds: [...ancestorCategoryIds],
    names: subCatNames.filter(Boolean),
    parentNames: catNames.filter(Boolean),
  };
};

export default {
  getRevenueHistory,
  logTransaction,
  getActiveSubcategoryNames,
};
