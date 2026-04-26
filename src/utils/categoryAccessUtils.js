/**
 * categoryAccessUtils.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Shared utility for resolving post-purchase access status for all 3 pillars
 * (Competitive, School, Skill Development).
 *
 * Handles every edge-case scenario:
 *  1. Student never purchased → no access
 *  2. Student purchased, no new content, no price change → full access (no upgrade needed)
 *  3. Student purchased, new tests/sub-cats added, price same or LOWER → free upgrade
 *  4. Student purchased, admin RAISED price → diff = newPrice - paidSoFar (>0)
 *     4a. Old content stays unlocked regardless — only NEW content is gated
 *
 * Returns a rich AccessStatus object consumed by all 3 pillar test controllers
 * and getCategoryDetailForStudent.
 */

import Category from "../models/Category.js";
import CategoryPurchase from "../models/CategoryPurchase.js";
import categoryRepository from "../repository/category.repository.js";
import Test from "../models/Test.js";
import TestPurchase from "../models/TestPurchase.js";
import Offer from "../models/Offer.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Fetch ALL descendant category IDs under a given parent (recursive).
 * Uses a single DB round-trip per depth level (no N+1).
 */
export const fetchDescendantIds = async (categoryId) => {
  const children = await categoryRepository.findChildren(categoryId);
  let ids = [];
  for (const child of children) {
    ids.push(child._id.toString());
    const subIds = await fetchDescendantIds(child._id);
    ids = ids.concat(subIds);
  }
  return ids; // array of strings
};

/**
 * Get the effective price of a category (discountedPrice takes priority over price).
 * Returns 0 if the category is free.
 */
const getEffectivePrice = async (category) => {
  if (category.isFree || !category.price) return 0;
  
  const basePrice = Number(category.price) || 0;
  
  const PILLAR_MAP = {
    "School": "School",
    "Competitive": "Competitive",
    "Skill Development": "Skill Development",
  };
  const applicableOn = category.rootType ? PILLAR_MAP[category.rootType] : null;

  let activeOffer = null;
  if (category.offerOverrideId) {
    activeOffer = await Offer.findOne({ _id: category.offerOverrideId, status: "active" }).lean();
  }
  
  if (!activeOffer && applicableOn) {
    activeOffer = await Offer.findOne({ applicableOn, status: "active", entityId: null }).lean();
  }
  
  if (activeOffer) {
    let discountAmount = 0;
    if (activeOffer.discountType === "percentage") {
      discountAmount = (basePrice * activeOffer.discountValue) / 100;
    } else {
      discountAmount = Math.min(activeOffer.discountValue, basePrice);
    }
    return Math.max(0, basePrice - discountAmount);
  }
  
  // Fallback to static discount or base price
  if (category.discountedPrice !== null && category.discountedPrice !== undefined) {
    return category.discountedPrice;
  }
  return basePrice;
};

// ─── Core Export ─────────────────────────────────────────────────────────────

/**
 * Resolve a student's complete access status for a given category node.
 *
 * @param {string|ObjectId} studentId
 * @param {string|ObjectId} categoryId
 * @returns {Promise<AccessStatus>}
 *
 * AccessStatus shape:
 * {
 *   hasAccess:        boolean   — student has any existing access to this category
 *   upgradable:       boolean   — an upgrade action is meaningful (new content exists)
 *   upgradeCost:      number    — 0 = free upgrade; >0 = pay this amount to unlock new content
 *   isFreeUpgrade:    boolean   — shortcut: upgradable && upgradeCost === 0
 *   newCategoryIds:   string[]  — descendant IDs added AFTER their purchase snapshot
 *   purchase:         doc|null  — the raw CategoryPurchase document (or null)
 *   paidSoFar:        number    — what the student paid originally (0 if no purchase)
 *   currentPrice:     number    — category's current effective price
 * }
 */
export const resolveAccessStatus = async (studentId, categoryId) => {
  const catIdStr = categoryId.toString();

  // ── 1. Check if student has any purchase that grants access ───────────────
  const purchase = await CategoryPurchase.findOne({
    student: studentId,
    paymentStatus: "completed",
    $or: [
      { categoryId: catIdStr },
      { unlockedCategoryIds: catIdStr },
    ],
  }).sort({ createdAt: -1 });

  // ── 2. No purchase at all → locked ────────────────────────────────────────
  if (!purchase) {
    return {
      hasAccess: false,
      upgradable: false,
      upgradeCost: 0,
      isFreeUpgrade: false,
      newCategoryIds: [],
      purchase: null,
      paidSoFar: 0,
      currentPrice: 0,
    };
  }

  // ── 3. Fetch the category the student actually PURCHASED (not the child being viewed) ──
  // This fixes the nested price bug: if student bought class1 (free) and we're viewing
  // bio (₹1000), we must compare class1's current price vs what was paid — not bio's price.
  const purchasedCategoryId = purchase.categoryId?.toString?.() || purchase.categoryId;
  const purchasedCategory = await Category.findById(purchasedCategoryId).lean();
  if (!purchasedCategory) {
    // Purchased category deleted — treat as no access
    return {
      hasAccess: false,
      upgradable: false,
      upgradeCost: 0,
      isFreeUpgrade: false,
      newCategoryIds: [],
      purchase,
      paidSoFar: purchase.purchasePrice,
      currentPrice: 0,
    };
  }

  // Price comparison is always against the PURCHASED node, not the child node
  const currentPrice = await getEffectivePrice(purchasedCategory);

  const paidSoFar = purchase.purchasePrice || 0;

  // ── 4. Determine price diff ───────────────────────────────────────────────
  // If diff <= 0 (price unchanged or admin actually lowered it) → free upgrade.
  // If diff > 0 → student owes the difference to unlock NEW content.
  const priceDiff = currentPrice - paidSoFar;
  const upgradeCost = Math.max(0, priceDiff); // never negative

  // ── 5. Find newly added descendant categories ─────────────────────────────
  // All current descendants
  const allCurrentDescendants = await fetchDescendantIds(categoryId);

  // What the student already has unlocked (snapshot from ALL purchases)
  const allStudentPurchases = await CategoryPurchase.find({ student: studentId, paymentStatus: "completed" }).select("unlockedCategoryIds").lean();
  const alreadyUnlocked = new Set();
  allStudentPurchases.forEach(p => {
    if (p.unlockedCategoryIds) {
      p.unlockedCategoryIds.forEach(id => alreadyUnlocked.add(id.toString()));
    }
  });

  // New descendants = exist now but were NOT in the purchase snapshot
  const newCategoryIds = allCurrentDescendants.filter(
    (id) => !alreadyUnlocked.has(id)
  );

  // ── 5.5 Find newly added Tests (tests created after purchase.lastUpgradedAt)
  const purchaseDate = purchase.lastUpgradedAt || purchase.createdAt;
  let hasNewTests = false;

  const boughtTests = await TestPurchase.find({ student: studentId, paymentStatus: "completed" }).select("test").lean();
  const boughtTestIds = boughtTests.filter(p => p && p.test).map(p => p.test.toString());

  const allCatIds = [categoryId.toString(), ...allCurrentDescendants];
  const newTestExists = await Test.exists({
    categoryId: { $in: allCatIds },
    isPublished: true,
    createdAt: { $gt: purchaseDate },
    _id: { $nin: boughtTestIds }
  });
  hasNewTests = !!newTestExists;

  const upgradable = (newCategoryIds.length > 0) || hasNewTests;

  // ── 6. Decide if upgrade UI is needed ─────────────────────────────────────
  const isFreeUpgrade = upgradable && upgradeCost === 0;

  return {
    hasAccess: true,
    upgradable,
    upgradeCost,
    isFreeUpgrade,
    newCategoryIds,
    purchase,
    paidSoFar,
    currentPrice,
    purchaseDate,
  };
};

/**
 * Bulk resolve access status for multiple immediate children nodes.
 * Extracts descendants completely in-memory using the provided tree to prevent N+1 queries.
 */
export const resolveBulkAccessStatus = async (studentId, nodes, tree, rootType) => {
  // 1. Fetch ALL purchases for this student
  const purchases = await CategoryPurchase.find({
    student: studentId,
    paymentStatus: "completed",
  }).sort({ createdAt: -1 }).lean();

  if (!purchases || purchases.length === 0) {
    return nodes.map((node) => ({
      ...node,
      hasAccess: false,
      upgradable: false,
      upgradeCost: 0,
      isFreeUpgrade: false,
    }));
  }

  const boughtTests = await TestPurchase.find({ student: studentId, paymentStatus: "completed" }).select("test").lean();
  const boughtTestIds = boughtTests.filter(p => p && p.test).map(p => p.test.toString());

  // Helper: Find a node anywhere in the tree and return all its descendant IDs
  const getDescendantIdsFromTree = (targetId, currentLayer) => {
    let result = null;
    const findNodeAndChildrenIds = (layer) => {
      for (const item of layer) {
        if (item._id.toString() === targetId.toString()) {
          return item; // Found it
        }
        if (item.children && item.children.length > 0) {
          const found = findNodeAndChildrenIds(item.children);
          if (found) return found;
        }
      }
      return null;
    };

    const targetNode = findNodeAndChildrenIds(currentLayer);

    // Once found, gather all descendant IDs
    const descendantIds = [];
    const gatherIds = (node) => {
      if (node.children && node.children.length > 0) {
        for (const child of node.children) {
          descendantIds.push(child._id.toString());
          gatherIds(child);
        }
      }
    };

    if (targetNode) gatherIds(targetNode);
    return descendantIds;
  };

  // Removed ModelMap logic for resolveBulkAccessStatus as tests are unified.
  return Promise.all(
    nodes.map(async (node) => {
      const catIdStr = node._id.toString();
      const purchase = purchases.find(
        (p) =>
          p.categoryId?.toString() === catIdStr ||
          (p.unlockedCategoryIds && p.unlockedCategoryIds.some(id => id.toString() === catIdStr))
      );

      if (!purchase) {
        return {
          ...node,
          hasAccess: false,
          upgradable: false,
          upgradeCost: 0,
          isFreeUpgrade: false,
        };
      }

      // Fix: compare against the price of the category the student actually purchased,
      // not the child node being displayed.
      const purchasedCatId = purchase.categoryId?.toString?.() || purchase.categoryId;
      const purchasedNode = currentLayer.find
        ? currentLayer.find(n => n._id?.toString?.() === purchasedCatId)
        : null;
      // Fall back to node itself if we can't find the purchased node in-memory tree
      const nodeForPrice = purchasedNode || node;
      const currentPrice = getEffectivePrice(nodeForPrice);
      const paidSoFar = purchase.purchasePrice || 0;
      const priceDiff = currentPrice - paidSoFar;
      const upgradeCost = Math.max(0, priceDiff);

      // Extract descendants safely from memory
      const allCurrentDescendants = getDescendantIdsFromTree(catIdStr, tree);

      const alreadyUnlocked = new Set();
      purchases.forEach(p => {
        if (p.unlockedCategoryIds) {
          p.unlockedCategoryIds.forEach(id => alreadyUnlocked.add(id.toString()));
        }
      });

      const newCategoryIds = allCurrentDescendants.filter((id) => !alreadyUnlocked.has(id));

      const purchaseDate = purchase.lastUpgradedAt || purchase.createdAt;
      let hasNewTests = false;

      const allCatIds = [catIdStr, ...allCurrentDescendants];
      const newTestExists = await Test.exists({
        categoryId: { $in: allCatIds },
        isPublished: true,
        createdAt: { $gt: purchaseDate },
        _id: { $nin: boughtTestIds }
      });
      hasNewTests = !!newTestExists;

      const upgradable = newCategoryIds.length > 0 || hasNewTests;
      const isFreeUpgrade = upgradable && upgradeCost === 0;

      return {
        ...node,
        hasAccess: true,
        upgradable,
        upgradeCost,
        isFreeUpgrade,
      };
    })
  );
};

