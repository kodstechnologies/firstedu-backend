/**
 * upgrade.service.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Handles post-purchase upgrades for all 3 pillar categories when:
 *  - Admin adds new tests/sub-categories after a student has already purchased
 *  - Admin increases the category price
 *
 * Edge-cases handled:
 *  • priceDiff <= 0 (price same or DECREASED) → free upgrade, no payment needed
 *  • priceDiff > 0 (price INCREASED) → student pays only the difference
 *  • Old content stays unlocked unconditionally — only new content is gated
 *  • paymentMethod: "free" | "wallet" | "razorpay"
 *  • Razorpay confirmUpgrade is fully implemented (was previously a stub)
 *  • Webhook reconciliation for "categoryUpgrade" type is handled in webhook service
 */

import { ApiError } from "../utils/ApiError.js";
import categoryPurchaseRepository from "../repository/categoryPurchase.repository.js";
import walletService from "./wallet.service.js";
import razorpayOrderIntentRepository from "../repository/razorpayOrderIntent.repository.js";
import { createRazorpayOrder, verifyPaymentSignature } from "../utils/razorpayUtils.js";
import { resolveAccessStatus, fetchDescendantIds } from "../utils/categoryAccessUtils.js";

// ─── calculateUpgradeCost ─────────────────────────────────────────────────────

/**
 * Returns:
 * {
 *   upgradeCost: number       — 0 (free) or positive rupee amount
 *   isFreeUpgrade: boolean
 *   hasAccess: boolean        — false if student never purchased
 *   hasNewContent: boolean    — whether new cats/tests exist after their snapshot
 *   newCategoryIds: string[]  — IDs not in their snapshot
 *   purchase: doc | null
 *   currentPrice: number
 *   paidSoFar: number
 * }
 */
export const calculateUpgradeCost = async (studentId, categoryId) => {
  const status = await resolveAccessStatus(studentId, categoryId);

  if (!status.hasAccess) {
    // Student never purchased this category — direct purchase flow applies
    throw new ApiError(
      400,
      "No existing purchase found for this category. Use the standard purchase flow."
    );
  }

  return {
    upgradeCost: status.upgradeCost,
    isFreeUpgrade: status.isFreeUpgrade,
    hasAccess: true,
    hasNewContent: status.hasNewContent,
    newCategoryIds: status.newCategoryIds,
    purchase: status.purchase,
    currentPrice: status.currentPrice,
    paidSoFar: status.paidSoFar,
  };
};

// ─── processUpgrade ───────────────────────────────────────────────────────────

/**
 * Process the upgrade payment.
 *
 * paymentMethod: "free" | "wallet" | "razorpay"
 *
 * Rules:
 *  - "free"     → only allowed when upgradeCost === 0 (price unchanged / lowered)
 *  - "wallet"   → deduct difference; push new IDs immediately
 *  - "razorpay" → create Razorpay order intent; caller must call confirmUpgrade after payment
 *
 * IMPORTANT: Old unlocked content is NEVER removed. We only ADD newCategoryIds.
 */
export const processUpgrade = async (studentId, categoryId, paymentMethod = "free") => {
  const status = await resolveAccessStatus(studentId, categoryId);

  if (!status.hasAccess) {
    throw new ApiError(400, "No existing purchase found. Use the standard purchase flow.");
  }

  if (!status.upgradable) {
    throw new ApiError(400, "No new content to upgrade to. All content is already unlocked.");
  }

  const { upgradeCost, newCategoryIds, purchase, isFreeUpgrade } = status;

  // ── FREE upgrade (price diff ≤ 0 or explicit free paymentMethod call) ─────
  if (paymentMethod === "free") {
    if (upgradeCost > 0) {
      throw new ApiError(
        400,
        `This upgrade requires payment of ₹${upgradeCost}. Use paymentMethod: wallet or razorpay.`
      );
    }
    // Auto-unlock: push all new IDs into the student's existing purchase doc
    await categoryPurchaseRepository.acknowledgeUpgrade(purchase._id, newCategoryIds);
    return {
      completed: true,
      message: `Auto-upgrade successful. New items unlocked at no cost.`,
      newUnlockedCount: newCategoryIds.length,
    };
  }

  // ── WALLET upgrade ────────────────────────────────────────────────────────
  if (paymentMethod === "wallet") {
    if (upgradeCost <= 0) {
      // Redirect to free if cost is nothing — don't deduct unnecessarily
      await categoryPurchaseRepository.acknowledgeUpgrade(purchase._id, newCategoryIds);
      return {
        completed: true,
        message: `Auto-upgrade successful. New items unlocked at no cost.`,
        newUnlockedCount: newCategoryIds.length,
      };
    }
    // Deduct wallet balance (throws ApiError if insufficient balance)
    await walletService.deductMonetaryBalance(studentId, upgradeCost, "User");
    // Push new IDs immediately after payment and record the amount paid
    // so the next upgrade cost calculation uses the updated baseline (prevents infinite loop).
    await categoryPurchaseRepository.acknowledgeUpgrade(purchase._id, newCategoryIds, upgradeCost);
    return {
      completed: true,
      message: `Upgrade successful. ₹${upgradeCost} deducted from wallet. New items unlocked.`,
      newUnlockedCount: newCategoryIds.length,
      amountPaid: upgradeCost,
    };
  }

  // ── RAZORPAY upgrade ──────────────────────────────────────────────────────
  if (paymentMethod === "razorpay") {
    if (upgradeCost <= 0) {
      // Free — no point going to Razorpay; auto-unlock
      await categoryPurchaseRepository.acknowledgeUpgrade(purchase._id, newCategoryIds);
      return {
        completed: true,
        message: `Auto-upgrade successful. New items unlocked at no cost.`,
        newUnlockedCount: newCategoryIds.length,
      };
    }

    const receipt = `upg_${categoryId}_${studentId}_${Date.now()}`.substring(0, 40);
    const order = await createRazorpayOrder(upgradeCost, receipt);

    // Store intent with enough metadata to fulfil the upgrade on confirmation/webhook
    await razorpayOrderIntentRepository.create({
      orderId: order.orderId,
      studentId,
      type: "categoryUpgrade",
      entityId: purchase._id,           // basePurchaseId — so we know which doc to update
      entityModel: "CategoryPurchase",
      amountPaise: order.amount,
      currency: order.currency || "INR",
      receipt,
      metadata: {
        categoryId: categoryId.toString(),
        newCategoryIds,                  // snapshot the new IDs at intent-creation time
      },
    });

    return {
      completed: false,
      orderId: order.orderId,
      amount: order.amount,
      currency: order.currency,
      key: process.env.RAZORPAY_KEY_ID,
      upgradeCost,
      newContentCount: newCategoryIds.length,
    };
  }

  throw new ApiError(400, "Invalid paymentMethod. Use: free, wallet, or razorpay.");
};

// ─── confirmUpgrade (Razorpay only) ─────────────────────────────────────────

/**
 * Called by the student after Razorpay checkout completes in the browser.
 * Verifies signature → pushes new IDs → marks intent as reconciled.
 */
export const confirmUpgrade = async (
  studentId,
  { razorpayOrderId, razorpayPaymentId, razorpaySignature }
) => {
  if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
    throw new ApiError(400, "razorpayOrderId, razorpayPaymentId, and razorpaySignature are required.");
  }

  // 1. Verify Razorpay HMAC signature
  const isValid = verifyPaymentSignature(razorpayOrderId, razorpayPaymentId, razorpaySignature);
  if (!isValid) throw new ApiError(400, "Payment verification failed. Invalid signature.");

  // 2. Look up the intent
  const intent = await razorpayOrderIntentRepository.findByOrderId(razorpayOrderId);
  if (!intent) throw new ApiError(400, "Invalid order or payment already processed.");
  if (intent.studentId?.toString() !== studentId?.toString()) {
    throw new ApiError(403, "Payment user mismatch.");
  }
  if (intent.type !== "categoryUpgrade") {
    throw new ApiError(400, "This order is not an upgrade payment.");
  }

  // 3. Load the base purchase and push new IDs
  const basePurchaseId = intent.entityId;
  const newCategoryIds = intent.metadata?.newCategoryIds || [];

  if (newCategoryIds.length === 0) {
    // If there are no new subcategories, it might just be new tests.
    // We STILL need to acknowledge the upgrade to update the lastUpgradedAt timestamp.
    // So we don't return early here.
  }

  // Record the amount paid so the next upgrade cost calculation uses the updated
  // baseline and never asks the student to pay the same difference twice.
  const paidAmount = (intent.amountPaise || 0) / 100;
  await categoryPurchaseRepository.acknowledgeUpgrade(basePurchaseId, newCategoryIds, paidAmount);
  await razorpayOrderIntentRepository.markReconciled(razorpayOrderId, razorpayPaymentId);

  return {
    completed: true,
    message: `Upgrade confirmed. New items unlocked.`,
    newUnlockedCount: newCategoryIds.length,
  };
};

export default {
  calculateUpgradeCost,
  processUpgrade,
  confirmUpgrade,
};
