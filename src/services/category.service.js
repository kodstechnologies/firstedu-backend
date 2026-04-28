import { ApiError } from "../utils/ApiError.js";
import Category from "../models/Category.js";
import categoryRepository from "../repository/category.repository.js";
import QuestionBank from "../models/QuestionBank.js";
import Test from "../models/Test.js";
import TestBundle from "../models/TestBundle.js";
import Tournament from "../models/Tournament.js";
import orderRepository from "../repository/order.repository.js";
import eventRegistrationRepository from "../repository/eventRegistration.repository.js";
import tournamentRepository from "../repository/tournament.repository.js";
import { getApplicableOfferDetails } from "../utils/offerUtils.js";
import Offer from "../models/Offer.js";
import { assertSubtreeNotPurchased } from "../utils/purchaseGuard.js";
import { sendUpgradeNotificationForCategory } from "./notification.service.js";

/**
 * Recursively create children under a parent category.
 * Supports unlimited nesting: School -> Classes -> Class 1 -> Subjects -> Math -> Geometry, etc.
 */
const createChildrenRecursive = async (children, parentId, createdBy, rootType, orderStart = 0) => {
  const created = [];
  let order = orderStart;
  for (const child of children) {
    const { name, children: nestedChildren } = child;
    const payload = {
      name,
      parent: parentId,
      order: order++,
      createdBy,
      status: "Public",
    };
    if (rootType && rootType !== "custom") {
      payload.rootType = rootType;
    }
    const category = await categoryRepository.create(payload);
    created.push(category);

    if (nestedChildren && nestedChildren.length > 0) {
      await createChildrenRecursive(
        nestedChildren,
        category._id,
        createdBy,
        rootType,
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
  let parentNode = null;
  if (data.parent) {
    parentNode = await categoryRepository.findById(data.parent);
    if (!parentNode) throw new ApiError(404, "Parent category not found");

    if (["School", "Competitive", "Skill Development"].includes(parentNode.rootType)) {
      const qBanks = await QuestionBank.find({ categories: parentNode._id }).select('_id');
      if (qBanks.length > 0) {
        const tests = await Test.exists({ questionBank: { $in: qBanks.map(qb => qb._id) } });
        if (tests) {
          throw new ApiError(400, "Cannot add subcategories to a node that already contains tests.");
        }
      }
    }
  }

  let resolvedRootType = data.rootType || "custom";
  if (!data.rootType && parentNode && parentNode.rootType && parentNode.rootType !== "custom") {
    resolvedRootType = parentNode.rootType;
  }

  const payload = {
    name: data.name,
    parent: data.parent || null,
    order: data.order ?? 0,
    createdBy,
    rootType: resolvedRootType,
    status: "Public",
    ...(data.isPredefined !== undefined && { isPredefined: data.isPredefined }),
  };
  const created = await categoryRepository.create(payload);

  if (data.children && data.children.length > 0) {
    const children = await createChildrenRecursive(
      data.children,
      created._id,
      createdBy,
      resolvedRootType,
      0
    );
    
    if (data.parent) {
      sendUpgradeNotificationForCategory(data.parent, data.name, "category", createdBy).catch(err => {
        console.error("Failed to send upgrade notification for category:", err);
      });
    }

    return { category: created, children };
  }

  if (data.parent) {
    sendUpgradeNotificationForCategory(data.parent, data.name, "category", createdBy).catch(err => {
      console.error("Failed to send upgrade notification for category:", err);
    });
  }

  return created;
};

export const getCategories = async (options = {}) => {
  return await categoryRepository.findAll({}, options);
};

export const getCategoryTree = async (filter = {}) => {
  // Ensure the 4 predefined pillar roots are always marked correctly.
  // This is a lightweight idempotent upsert that runs on every tree fetch.
  const PILLAR_ROOTS = [
    { name: "School",    rootType: "School" },
    { name: "Competitive", rootType: "Competitive" },
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

  const fullTree = await categoryRepository.findTree({});
  
  // Attach hasTests boolean to nodes
  const allBankIds = await QuestionBank.find({}).select('categories _id');
  const allTestBanks = await Test.find({}).select('questionBank categoryId').lean();
  const bankIdsWithTests = new Set(allTestBanks.map(t => t.questionBank?.toString()));

  const categoryIdsWithTests = new Set();
  
  allBankIds.forEach(qb => {
    if (bankIdsWithTests.has(qb._id.toString())) {
        qb.categories.forEach(cid => categoryIdsWithTests.add(cid.toString()));
    }
  });

  // Also include direct links where Test natively defines categoryId
  allTestBanks.forEach(test => {
    if (test.categoryId) {
      categoryIdsWithTests.add(test.categoryId.toString());
    }
  });

  const attachHasTests = (nodes) => {
    nodes.forEach(node => {
      node.hasTests = categoryIdsWithTests.has(node._id.toString());
      if (node.children?.length) {
        attachHasTests(node.children);
      }
    });
  };
  attachHasTests(fullTree);

  if (filter && filter.rootType) {
    const requestedRoot = fullTree.find(n => n.rootType === filter.rootType);
    return requestedRoot ? [requestedRoot] : [];
  }
  
  return fullTree;
};

export const getCategoryById = async (id) => {
  const item = await categoryRepository.findById(id);
  if (!item) throw new ApiError(404, "Category not found");

  const obj = typeof item.toObject === "function" ? item.toObject() : { ...item };

  // ── Enrich: Node-type metadata (isLeaf / isSecondSubcategory / linkedSubjects) ──
  const children = await categoryRepository.findChildren(id);

  const childMeta = await Promise.all(
    children.map(async (child) => ({
      name:        child.name,
      hasChildren: await categoryRepository.hasChildren(child._id),
    }))
  );

  const isLeaf              = children.length === 0;
  const isSecondSubcategory = children.length > 0 && childMeta.every((c) => !c.hasChildren);

  const SUBJECT_PILLARS = ["School", "Competitive", "Olympiads"];
  const linkedSubcategories = isSecondSubcategory && SUBJECT_PILLARS.includes(obj.rootType)
    ? childMeta.map((c) => c.name)
    : [];

  obj.isLeaf              = isLeaf;
  obj.isSecondSubcategory = isSecondSubcategory;
  obj.linkedSubcategories = linkedSubcategories;

  // ── Enrich: Global pillar-level offer (for Mode A display in UI) ────────────────
  const PILLAR_TO_APPLICABLE_ON = {
    "School":            "School",
    "Competitive":       "Competitive",
    "Skill Development": "Skill Development",
  };
  const applicableOn = PILLAR_TO_APPLICABLE_ON[obj.rootType];
  obj.globalOffer = applicableOn
    ? (await Offer.findOne({ applicableOn, status: "active" }).lean()) ?? null
    : null;

  // ── Enrich: Category-specific override offer (for Mode B display in UI) ─────────
  obj.overrideOffer = obj.offerOverrideId
    ? (await Offer.findById(obj.offerOverrideId).lean()) ?? null
    : null;
  // ─────────────────────────────────────────────────────────────────────────────────

  return obj;
};

export const getChildren = async (parentId) => {
  return await categoryRepository.findChildren(parentId);
};

const getConnectedCategoryIds = async (linkedTo, studentId) => {
  if (!linkedTo) return null;

  let categoryIds = new Set();

  if (linkedTo === "course") {
    const Course = (await import("../models/Course.js")).default;
    const fromCourses = await Course.find({ isPublished: true }).distinct("categoryIds");
    fromCourses.forEach((id) => categoryIds.add(id?.toString?.() || id));
  }

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

    // 2) Registered tournaments (from event registrations)
    const regs = await eventRegistrationRepository.find(
      {
        student: studentId,
        eventType: "tournament",
        paymentStatus: "completed",
      },
      { limit: 500 }
    );

    const tournamentIds = [
      ...new Set(regs.filter((r) => r.eventType === "tournament").map((r) => r.eventId).filter(Boolean)),
    ];

    const eventBankIds = new Set();

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
  const { linkedTo, format = "tree", rootType, studentId } = options;

  const filter = rootType ? { rootType } : {};
  let tree = await categoryRepository.findTree(filter);

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

  // ── Attach computed prices to all subcategory nodes so frontend needs zero math ──
  const PILLAR_TO_APPLICABLE_ON = {
    "School":            "School",
    "Competitive":       "Competitive",
    "Skill Development": "Skill Development",
  };
  const applicableOn = rootType ? PILLAR_TO_APPLICABLE_ON[rootType] : null;

  if (applicableOn) {
    // Fetch the single active global offer for this pillar once (1 DB query for ALL nodes)
    const globalOffer = await Offer.findOne({ applicableOn, status: "active", entityId: null }).lean();

    // Fetch any custom override offers used by nodes in the tree efficiently
    const overrideIds = new Set();
    const collectIds = (node) => {
      if (node.offerOverrideId) overrideIds.add(node.offerOverrideId.toString());
      if (node.children?.length) node.children.forEach(collectIds);
    };
    tree.forEach(collectIds);

    const overrideMap = {};
    if (overrideIds.size > 0) {
      const activeOverrides = await Offer.find({ _id: { $in: Array.from(overrideIds) }, status: "active" }).lean();
      activeOverrides.forEach(o => overrideMap[o._id.toString()] = o);
    }

    const enrichNode = (node) => {
      if (node.price != null) {
        const basePrice = Number(node.price) || 0;
        const activeOffer = (node.offerOverrideId && overrideMap[node.offerOverrideId.toString()])
                            ? overrideMap[node.offerOverrideId.toString()]
                            : globalOffer;

        if (node.isFree || basePrice === 0) {
          node.originalPrice = basePrice;
          node.effectivePrice = 0;
          node.discountedPrice = 0;
        } else if (activeOffer) {
          let discountAmount = 0;
          if (activeOffer.discountType === "percentage") {
            discountAmount = (basePrice * activeOffer.discountValue) / 100;
          } else {
            discountAmount = Math.min(activeOffer.discountValue, basePrice);
          }
          const discountedPrice = Math.max(0, basePrice - discountAmount);
          node.originalPrice = basePrice;
          node.discountedPrice = discountedPrice;
          node.effectivePrice = discountedPrice;
          node.discountAmount = discountAmount;
          node.appliedOffer = {
            _id: activeOffer._id,
            offerName: activeOffer.offerName,
            applicableOn: activeOffer.applicableOn,
            discountType: activeOffer.discountType,
            discountValue: activeOffer.discountValue,
            description: activeOffer.description,
            validTill: activeOffer.validTill,
          };
        } else {
          // No active offer (global or override) — pass through as-is
          node.originalPrice = basePrice;
          node.effectivePrice = basePrice;
          node.discountedPrice = basePrice;
        }
      }
      if (node.children?.length) node.children.forEach(enrichNode);
    };
    tree.forEach(enrichNode);
  }
  // ──────────────────────────────────────────────────────────────────────────────

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
  if (updateData.parent !== undefined) {
    if (updateData.parent === id) {
      throw new ApiError(400, "Category cannot be its own parent");
    }
    if (updateData.parent) {
      const parent = await categoryRepository.findById(updateData.parent);
      if (!parent) throw new ApiError(404, "Parent category not found");
      if (parent.rootType && parent.rootType !== "custom") {
        updateData.rootType = parent.rootType;
      }
    }
  }
  return await categoryRepository.updateById(id, updateData);
};

export const updateCategoryPricing = async (id, updateData) => {
  const existing = await categoryRepository.findById(id);
  if (!existing) throw new ApiError(404, "Category not found");
  // Permitting editing of price, offer, coupon even when purchased
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
    "School": "School",
    "Competitive": "Competitive",
    "Skill Development": "Skill Development"
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
