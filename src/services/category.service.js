import { ApiError } from "../utils/ApiError.js";
import Category from "../models/Category.js";
import categoryRepository from "../repository/category.repository.js";
import QuestionBank from "../models/QuestionBank.js";
import Test from "../models/Test.js";
import TestBundle from "../models/TestBundle.js";
import Olympiad from "../models/Olympiad.js";
import Tournament from "../models/Tournament.js";
import CategoryPurchase from "../models/CategoryPurchase.js";
import orderRepository from "../repository/order.repository.js";
import eventRegistrationRepository from "../repository/eventRegistration.repository.js";
import olympiadRepository from "../repository/olympiad.repository.js";
import tournamentRepository from "../repository/tournament.repository.js";
import { getApplicableOfferDetails } from "../utils/offerUtils.js";

import { assertSubtreeNotPurchased } from "../utils/purchaseGuard.js";

/**
 * Recursively create children under a parent category.
 * Supports unlimited nesting: School -> Classes -> Class 1 -> Subjects -> Math -> Geometry, etc.
 */
const createChildrenRecursive = async (children, parentId, createdBy, orderStart = 0) => {
  const created = [];
  let order = orderStart;
  for (const child of children) {
    const { name, children: nestedChildren } = child;
    const category = await categoryRepository.create({
      name,
      parent: parentId,
      order: order++,
      createdBy,
    });
    created.push(category);

    if (nestedChildren && nestedChildren.length > 0) {
      await createChildrenRecursive(
        nestedChildren,
        category._id,
        createdBy,
        0
      );
    }
  }
  return created;
};

/**
 * Create category - single or with unlimited nested children.
 * - Single: { name: "School" } or { name: "Classes", parent: "parentId" }
 * - Nested: { name: "School", children: [{ name: "Classes", children: [{ name: "Class 1", children: [...] }] }] }
 */
export const createCategory = async (data, createdBy) => {
  if (data.parent) {
    const parent = await categoryRepository.findById(data.parent);
    if (!parent) throw new ApiError(404, "Parent category not found");
  }

  const payload = {
    name: data.name,
    parent: data.parent || null,
    order: data.order ?? 0,
    createdBy,
    ...(data.rootType   && { rootType:     data.rootType }),
    ...(data.isPredefined !== undefined && { isPredefined: data.isPredefined }),
  };
  const created = await categoryRepository.create(payload);

  if (data.children && data.children.length > 0) {
    const children = await createChildrenRecursive(
      data.children,
      created._id,
      createdBy,
      0
    );
    return { category: created, children };
  }

  return created;
};

export const getCategories = async (options = {}) => {
  return await categoryRepository.findAll({}, options);
};

export const getCategoryTree = async () => {
  // Ensure the 4 predefined pillar roots are always marked correctly.
  // This is a lightweight idempotent upsert that runs on every tree fetch.
  const PILLAR_ROOTS = [
    { name: "School Management",    rootType: "School Management" },
    { name: "Competitive Management", rootType: "Competitive Management" },
    { name: "Olympiads",             rootType: "Olympiads" },
    { name: "Skill Development",     rootType: "Skill Development" },
  ];

  for (const pillar of PILLAR_ROOTS) {
    // Find a root node matching this rootType (top-level: parent null)
    const existing = await Category.findOne({ rootType: pillar.rootType, parent: null });
    if (existing) {
      // Always ensure predefined flag is set; sync name if different
      const updates = { isPredefined: true };
      if (existing.name !== pillar.name) updates.name = pillar.name;
      await Category.updateOne({ _id: existing._id }, updates);
    }
    // Also mark any that have the correct name but not rootType
    else {
      const byName = await Category.findOne({ name: pillar.name, parent: null });
      if (byName) {
        await Category.updateOne({ _id: byName._id }, { rootType: pillar.rootType, isPredefined: true });
      }
    }
  }

  return await categoryRepository.findTree({});
};

export const getCategoryById = async (id) => {
  const item = await categoryRepository.findById(id);
  if (!item) throw new ApiError(404, "Category not found");
  return item;
};

export const getChildren = async (parentId) => {
  return await categoryRepository.findChildren(parentId);
};

/**
 * Get category IDs connected to question banks, tests, test bundles, olympiads, and/or tournaments.
 * linkedTo: "all" | "questionBank" | "test" | "testBundle" | "both" | "olympiad" | "tournament" | "examhall" | null
 * - all: union of test + testBundle + olympiad + tournament (categories used in marketplace/events)
 * - questionBank: categories on any question bank
 * - test: categories on question banks of published tests
 * - testBundle: categories on question banks of tests that are in at least one active bundle
 * - both: union of test + testBundle
 * - olympiad: categories on question banks of tests used by published olympiads
 * - tournament: categories on question banks of tests used in stages of published tournaments
 * - examhall: categories linked to items visible in the student's exam hall
 */
const getConnectedCategoryIds = async (linkedTo, studentId) => {
  if (!linkedTo) return null;

  let categoryIds = new Set();

  if (linkedTo === "questionBank") {
    const fromBanks = await QuestionBank.distinct("categories");
    fromBanks.forEach((id) => categoryIds.add(id?.toString?.() || id));
  }

  if (linkedTo === "test" || linkedTo === "both") {
    const publishedBankIds = await Test.find({ isPublished: true }).distinct("questionBank");
    if (publishedBankIds.length > 0) {
      const fromTests = await QuestionBank.find({ _id: { $in: publishedBankIds } }).distinct("categories");
      fromTests.forEach((id) => categoryIds.add(id?.toString?.() || id));
    }
  }

  if (linkedTo === "all" || linkedTo === "testBundle" || linkedTo === "both") {
    const activeBundles = await TestBundle.find({ isActive: true }).select("tests").lean();
    const allTestIds = activeBundles.flatMap((b) => b.tests || []);
    if (allTestIds.length > 0) {
      const bankIdsFromBundles = await Test.find({ _id: { $in: allTestIds } }).distinct("questionBank");
      if (bankIdsFromBundles.length > 0) {
        const fromBundles = await QuestionBank.find({ _id: { $in: bankIdsFromBundles } }).distinct("categories");
        fromBundles.forEach((id) => categoryIds.add(id?.toString?.() || id));
      }
    }
  }

  if (linkedTo === "olympiad") {
    const publishedOlympiads = await Olympiad.find({ isPublished: true }).select("test").lean();
    const testIds = publishedOlympiads.map((o) => o.test).filter(Boolean);
    if (testIds.length > 0) {
      const bankIds = await Test.find({ _id: { $in: testIds } }).distinct("questionBank");
      if (bankIds.length > 0) {
        const fromOlympiads = await QuestionBank.find({ _id: { $in: bankIds } }).distinct("categories");
        fromOlympiads.forEach((id) => categoryIds.add(id?.toString?.() || id));
      }
    }
  }

  if (linkedTo === "all" || linkedTo === "tournament") {
    const publishedTournaments = await Tournament.find({ isPublished: true }).select("stages").lean();
    const testIds = publishedTournaments.flatMap((t) => (t.stages || []).map((s) => s.test).filter(Boolean));
    const uniqueTestIds = [...new Set(testIds)];
    if (uniqueTestIds.length > 0) {
      const bankIds = await Test.find({ _id: { $in: uniqueTestIds } }).distinct("questionBank");
      if (bankIds.length > 0) {
        const fromTournaments = await QuestionBank.find({ _id: { $in: bankIds } }).distinct("categories");
        fromTournaments.forEach((id) => categoryIds.add(id?.toString?.() || id));
      }
    }
  }

  if (linkedTo === "examhall") {
    if (!studentId) {
      return new Set();
    }

    // 1) Purchased tests / bundles (from exam hall purchases helper)
    const purchases = await orderRepository.findTestPurchasesForExamHall(studentId);
    const bankIdsFromPurchases = new Set();
    purchases.forEach((p) => {
      if (p.test?.questionBank?._id || p.test?.questionBank) {
        const qb = p.test.questionBank;
        const qbId = qb._id?.toString?.() || qb.toString?.();
        if (qbId) bankIdsFromPurchases.add(qbId);
      }
      if (p.testBundle?.tests?.length) {
        p.testBundle.tests.forEach((t) => {
          const qb = t?.questionBank;
          const qbId = qb?._id?.toString?.() || qb?.toString?.();
          if (qbId) bankIdsFromPurchases.add(qbId);
        });
      }
    });

    // 2) Registered olympiads / tournaments (from event registrations)
    const regs = await eventRegistrationRepository.find(
      {
        student: studentId,
        eventType: { $in: ["olympiad", "tournament"] },
        paymentStatus: "completed",
      },
      { limit: 500 }
    );

    const olympiadIds = [
      ...new Set(regs.filter((r) => r.eventType === "olympiad").map((r) => r.eventId).filter(Boolean)),
    ];
    const tournamentIds = [
      ...new Set(regs.filter((r) => r.eventType === "tournament").map((r) => r.eventId).filter(Boolean)),
    ];

    const eventBankIds = new Set();

    if (olympiadIds.length > 0) {
      const olympiads = await olympiadRepository.find(
        { _id: { $in: olympiadIds } },
        {
          populate: [
            {
              path: "test",
              select: "questionBank",
              populate: { path: "questionBank", select: "categories" },
            },
          ],
          limit: 500,
        }
      );
      olympiads.forEach((o) => {
        const qb = o.test?.questionBank;
        const qbId = qb?._id?.toString?.() || qb?.toString?.();
        if (qbId) eventBankIds.add(qbId);
      });
    }

    if (tournamentIds.length > 0) {
      const tournaments = await tournamentRepository.find(
        { _id: { $in: tournamentIds } },
        {
          populate: [
            {
              path: "stages.test",
              select: "questionBank",
              populate: { path: "questionBank", select: "categories" },
            },
          ],
          limit: 500,
        }
      );
      tournaments.forEach((t) => {
        (t.stages || []).forEach((s) => {
          const qb = s?.test?.questionBank;
          const qbId = qb?._id?.toString?.() || qb?.toString?.();
          if (qbId) eventBankIds.add(qbId);
        });
      });
    }

    const allBankIds = new Set([...bankIdsFromPurchases, ...eventBankIds]);
    if (allBankIds.size > 0) {
      const fromExamHall = await QuestionBank.find({ _id: { $in: [...allBankIds] } }).distinct("categories");
      fromExamHall.forEach((id) => categoryIds.add(id?.toString?.() || id));
    }
  }

  return categoryIds.size > 0 ? categoryIds : new Set();
};

/**
 * Build id -> parentId map from tree (for ancestor lookup).
 */
const buildIdToParentFromTree = (nodes, map = new Map()) => {
  nodes.forEach((node) => {
    const id = node._id?.toString?.();
    const parentId = node.parent?._id?.toString?.() || node.parent?.toString?.() || null;
    if (id) map.set(id, parentId);
    if (node.children?.length) buildIdToParentFromTree(node.children, map);
  });
  return map;
};

/**
 * Include category and all its ancestors (for path context).
 */
const getAncestorIds = (categoryId, idToParent) => {
  const ids = new Set();
  let current = categoryId?.toString?.();
  while (current) {
    ids.add(current);
    current = idToParent.get(current) || null;
  }
  return ids;
};

/**
 * Filter tree to keep only nodes that are connected (or ancestors of connected).
 */
const filterTreeByConnected = (nodes, allowedIds) => {
  if (!allowedIds || allowedIds.size === 0) return nodes;

  return nodes
    .map((node) => {
      const id = node._id?.toString?.();
      const filteredChildren = node.children?.length
        ? filterTreeByConnected(node.children, allowedIds)
        : [];
      const hasRelevantDescendant = filteredChildren.length > 0;
      const isRelevant = allowedIds.has(id) || hasRelevantDescendant;

      if (!isRelevant) return null;
      return { ...node, children: filteredChildren };
    })
    .filter(Boolean);
};

/**
 * Student-facing: Get all categories (tree) with optional filter by question bank / test / test bundle.
 * linkedTo: "questionBank" | "test" | "testBundle" | "both" | omit = show all
 * - test: only categories used by published tests
 * - testBundle: only categories used by tests that are in an active test bundle
 * - both: union of test + testBundle
 * format: "tree" | "flat"
 */
export const getCategoriesForStudent = async (options = {}) => {
  const { linkedTo, format = "tree", studentId } = options;

  let tree = await categoryRepository.findTree({});

  if (linkedTo) {
    const connectedIds = await getConnectedCategoryIds(linkedTo, studentId);
    if (connectedIds && connectedIds.size > 0) {
      const idToParent = buildIdToParentFromTree(tree);
      const allowedIds = new Set(connectedIds);
      for (const cid of connectedIds) {
        const ancestors = getAncestorIds(cid, idToParent);
        ancestors.forEach((a) => allowedIds.add(a));
      }
      tree = filterTreeByConnected(tree, allowedIds);
    } else {
      tree = [];
    }
  }

  if (format === "flat") {
    const flatten = (nodes, acc = []) => {
      nodes.forEach((n) => {
        acc.push(n);
        if (n.children?.length) flatten(n.children, acc);
      });
      return acc;
    };
    return flatten(tree);
  }

  return tree;
};

export const updateCategory = async (id, updateData) => {
  const existing = await categoryRepository.findById(id);
  if (!existing) throw new ApiError(404, "Category not found");
  await assertSubtreeNotPurchased(id, "rename");
  if (updateData.parent) {
    if (updateData.parent === id) {
      throw new ApiError(400, "Category cannot be its own parent");
    }
    const parent = await categoryRepository.findById(updateData.parent);
    if (!parent) throw new ApiError(404, "Parent category not found");
  }
  return await categoryRepository.updateById(id, updateData);
};

export const updateCategoryPricing = async (id, updateData) => {
  const existing = await categoryRepository.findById(id);
  if (!existing) throw new ApiError(404, "Category not found");
  await assertSubtreeNotPurchased(id, "update pricing");
  return await categoryRepository.updateById(id, updateData);
};

export const getNodeWithEffectivePrice = async (id) => {
  const node = await categoryRepository.findById(id);
  if (!node) throw new ApiError(404, "Category not found");
  
  const obj = typeof node.toObject === "function" ? node.toObject() : { ...node };
  
  if (obj.isFree) {
    obj.effectivePrice = 0;
    return obj;
  }
  
  if (obj.discountedPrice !== null && obj.discountedPrice !== undefined) {
    // Admin set a specific node-level discount. It overrides global offer completely.
    obj.effectivePrice = obj.discountedPrice;
    return obj;
  }

  // Fallback to global offer
  const rootTypeMap = {
    "School Management": "School Management",
    "Competitive Management": "Competitive Management",
    "Skill Development": "Skill Development",
    "Olympiads": "Olympiads"
  };
  const moduleName = rootTypeMap[obj.rootType] || "Category";
  
  const offerDetails = await getApplicableOfferDetails(moduleName, obj.price || 0);
  
  obj.appliedOffer = offerDetails.appliedOffer;
  obj.originalPrice = offerDetails.originalPrice;
  obj.discountedPrice = offerDetails.discountedPrice;
  obj.discountAmount = offerDetails.discountAmount;
  obj.effectivePrice = offerDetails.discountedPrice;
  
  if (!offerDetails.appliedOffer) {
    delete obj.appliedOffer;
    delete obj.discountAmount;
    obj.effectivePrice = obj.originalPrice;
  }
  
  return obj;
};

export const deleteCategory = async (id, cascade = true) => {
  const existing = await categoryRepository.findById(id);
  if (!existing) throw new ApiError(404, "Category not found");
  await assertSubtreeNotPurchased(id, "delete");
  if (cascade) {
    return await categoryRepository.deleteByIdCascade(id);
  }
  const hasChild = await categoryRepository.hasChildren(id);
  if (hasChild) {
    throw new ApiError(
      400,
      "Cannot delete category with subcategories. Use cascade delete or delete children first."
    );
  }
  return await categoryRepository.deleteById(id);
};

export default {
  createCategory,
  getCategories,
  getCategoryTree,
  getCategoryById,
  getChildren,
  getCategoriesForStudent,
  updateCategory,
  updateCategoryPricing,
  getNodeWithEffectivePrice,
  deleteCategory,
};
