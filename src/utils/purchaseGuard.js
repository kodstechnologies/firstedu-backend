import CategoryPurchase from "../models/CategoryPurchase.js";
import categoryRepository from "../repository/category.repository.js";
import { ApiError } from "./ApiError.js";

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
};
