import { ApiError } from "../utils/ApiError.js";
import Category from "../models/Category.js";
import CategoryPurchase from "../models/CategoryPurchase.js";
import categoryRepository from "../repository/category.repository.js";
import razorpayOrderIntentRepository from "../repository/razorpayOrderIntent.repository.js";
import { createRazorpayOrder } from "../utils/razorpayUtils.js";

const fetchDescendantIds = async (categoryId) => {
  const children = await categoryRepository.findChildren(categoryId);
  let ids = [];
  for (const child of children) {
    ids.push(child._id);
    const subIds = await fetchDescendantIds(child._id);
    ids = ids.concat(subIds);
  }
  return ids;
};

/**
 * Calculates upgrade cost for an existing user for a given category node.
 * Formula: MAX(0, CurrentPrice - PaidSoFar)
 */
export const calculateUpgradeCost = async (studentId, targetCategoryId) => {
  const category = await Category.findById(targetCategoryId);
  if (!category) throw new ApiError(404, "Category not found");

  // Check if they already have access to this exact node
  const existingAccess = await CategoryPurchase.findOne({
    student: studentId,
    unlockedCategoryIds: targetCategoryId,
    paymentStatus: "completed"
  });

  if (existingAccess) {
    return { upgradeCost: 0, hasFullAccess: true, category };
  }

  // Find all past purchases they made that INTERSECT this node's ancestors
  // Actually, wait: we need to find if they bought any ancestor, or if we trace it up.
  // E.g., they bought "School -> Class 1" for 500rs. They want "School -> Class 1 -> Math" (new subject).
  // "targetCategoryId" is "Math". We find if they purchased "Class 1".
  
  // Get all ancestors of target category
  let currentId = category.parent;
  let paidSoFar = 0;
  let basePurchaseId = null;

  while (currentId) {
    const parentPurchase = await CategoryPurchase.findOne({
      student: studentId,
      categoryId: currentId,
      paymentStatus: "completed"
    }).sort({ createdAt: -1 });

    if (parentPurchase) {
      paidSoFar = parentPurchase.purchasePrice;
      basePurchaseId = parentPurchase._id;
      break; 
    }
    const pCat = await Category.findById(currentId);
    currentId = pCat ? pCat.parent : null;
  }

  if (!basePurchaseId) {
    // They never bought any parent class. They must pay full price of this specific node.
    let cp = category.discountedPrice !== null && category.discountedPrice !== undefined ? category.discountedPrice : category.price;
    return { upgradeCost: cp, hasFullAccess: false, isIsolated: true, category };
  }

  // They did buy an ancestor. They want a new node under it.
  // Evaluate the Upgrade cost against the ANCESTOR's current price.
  // Because if admin increased "Class 1" from 50 to 60, cost is 10.
  // Wait, what if they are upgrading to unlock the NEW subject?
  // The cost should be: MAX(0, Current "Class 1" price - What they paid for "Class 1") 
  const ancestorCat = await Category.findById(currentId); // Re-fetch base purchase category
  const currentAncestorPrice = ancestorCat.discountedPrice !== null && ancestorCat.discountedPrice !== undefined ? ancestorCat.discountedPrice : ancestorCat.price;
  
  const diff = currentAncestorPrice - paidSoFar;
  const upgradeCost = Math.max(0, diff);

  return { upgradeCost, hasFullAccess: false, basePurchaseId, category };
};

export const processUpgrade = async (studentId, targetCategoryId, paymentMethod = "free") => {
  const { upgradeCost, hasFullAccess, basePurchaseId, isIsolated } = await calculateUpgradeCost(studentId, targetCategoryId);

  if (hasFullAccess) {
    throw new ApiError(400, "You already have access to this category.");
  }

  if (isIsolated) {
    throw new ApiError(400, "You do not hold a parent package. Use standard purchase flow for isolated purchases.");
  }

  const category = await Category.findById(targetCategoryId);
  const unlockedIds = [category._id, ...(await fetchDescendantIds(category._id))];

  if (upgradeCost <= 0 || paymentMethod === "free") {
    if (upgradeCost > 0) {
      throw new ApiError(400, `Upgrade requires payment of Rs ${upgradeCost}`);
    }

    // Auto-grant access wrapper
    const basePurchase = await CategoryPurchase.findById(basePurchaseId);
    // Add the new targetCategoryId and all its children to their unlocked list
    const newUnlocked = Array.from(new Set([...basePurchase.unlockedCategoryIds.map(o => o.toString()), ...unlockedIds.map(o => o.toString())]));
    
    basePurchase.unlockedCategoryIds = newUnlocked;
    await basePurchase.save();

    return { completed: true, message: "Auto-upgraded successfully (free of cost)." };
  }

  if (paymentMethod === "razorpay") {
    // generate razorpay intent for upgrade
    const receipt = `upg_${targetCategoryId}_${studentId}_${Date.now()}`.substring(0, 40);
    const order = await createRazorpayOrder(upgradeCost, receipt);
    
    await razorpayOrderIntentRepository.create({
      orderId: order.orderId,
      studentId,
      type: "categoryUpgrade",
      entityId: basePurchaseId, 
      entityModel: "CategoryPurchase",
      amountPaise: order.amount,
      currency: order.currency || "INR",
      receipt,
      metadata: { targetCategoryId: targetCategoryId.toString() }
    });

    return {
      completed: false,
      orderId: order.orderId,
      amount: order.amount,
      currency: order.currency,
      key: process.env.RAZORPAY_KEY_ID,
      title: `Upgrade Access for ${category.name}`,
    };
  }

  throw new ApiError(400, "Invalid payment method");
};

export const confirmUpgrade = async (studentId, { razorpayOrderId, razorpayPaymentId, razorpaySignature }) => {
  // standard razorpay confirm, then basePurchase.unlockedCategoryIds.push(...) + save
};

export default {
  calculateUpgradeCost,
  processUpgrade,
  confirmUpgrade,
};
