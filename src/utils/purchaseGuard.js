import CategoryPurchase from "../models/CategoryPurchase.js";
import categoryRepository from "../repository/category.repository.js";
import { ApiError } from "./ApiError.js";
import QuestionBank from "../models/QuestionBank.js";
import Test from "../models/Test.js";
import TestBundle from "../models/TestBundle.js";
import TestPurchase from "../models/TestPurchase.js";

// Collect all IDs in subtree (self + all descendants)
const collectSubtreeIds = async (id) => {
  const ids = [id.toString()];
  const children = await categoryRepository.findChildren(id);
  for (const child of children) {
    ids.push(...await collectSubtreeIds(child._id));
  }
  return ids;
};

/**
 * Throws 403 if this node OR any descendant has been purchased.
 * Use for: rename, delete, add/edit/delete tests.
 */
export const assertSubtreeNotPurchased = async (categoryId, action = "modify") => {
  const allIds = await collectSubtreeIds(categoryId);
  const purchase = await CategoryPurchase.findOne({
    unlockedCategoryIds: { $in: allIds },
    paymentStatus: "completed",
  }).lean();
  
  if (purchase) {
    throw new ApiError(403, `Cannot ${action}: this category or a subcategory within it has active student purchases.`);
  }

  const qBanks = await QuestionBank.find({ categories: { $in: allIds } }).select("_id").lean();
  if (qBanks.length > 0) {
    const bankIds = qBanks.map(qb => qb._id);
    const tests = await Test.find({ questionBank: { $in: bankIds } }).select("_id").lean();
    if (tests.length > 0) {
      const testIds = tests.map(t => t._id);
      
      const directTestPurchase = await TestPurchase.findOne({
        test: { $in: testIds },
        paymentStatus: "completed",
      }).lean();

      if (directTestPurchase) {
        throw new ApiError(403, `Cannot ${action}: a test within this subcategory has active student purchases.`);
      }

      const bundlesWithTests = await TestBundle.find({ tests: { $in: testIds } }).select("_id").lean();
      if (bundlesWithTests.length > 0) {
        const bundleIds = bundlesWithTests.map(b => b._id);
        const bundlePurchase = await TestPurchase.findOne({
          testBundle: { $in: bundleIds },
          paymentStatus: "completed",
        }).lean();

        if (bundlePurchase) {
          throw new ApiError(403, `Cannot ${action}: a test bundle containing tests within this subcategory has active student purchases.`);
        }
      }
    }
  }
};
