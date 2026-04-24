import Test from "../models/Test.js";
import Category from "../models/Category.js";
import { attachOfferToList } from "../utils/offerUtils.js";

/**
 * Walk the category tree upward from `startId` and return a
 * human-readable path string like "School > Class 1 > Biology".
 * A single Category.find() fetches all ancestors at once, then we
 * link them by their `parent` references — no recursive DB calls.
 */
async function buildCategoryPath(startId) {
  if (!startId) return '';

  // 1. Seed: fetch the leaf category first
  const leaf = await Category.findById(startId).select('name parent').lean();
  if (!leaf) return '';

  // 2. Collect every ancestor ID by walking parent refs in memory
  //    We do one broad find() up the tree (max depth guard: 10)
  const visited = new Map(); // id → { name, parent }
  visited.set(leaf._id.toString(), leaf);

  let currentParentId = leaf.parent ? leaf.parent.toString() : null;
  const parentIdsToFetch = [];
  while (currentParentId && !visited.has(currentParentId)) {
    parentIdsToFetch.push(currentParentId);
    currentParentId = null; // will be resolved after batch fetch
  }

  if (parentIdsToFetch.length > 0) {
    // Fetch them all at once, then keep walking up
    let idsToFetch = [leaf.parent];
    for (let depth = 0; depth < 10; depth++) {
      if (!idsToFetch.length) break;
      const ancestors = await Category
        .find({ _id: { $in: idsToFetch } })
        .select('name parent')
        .lean();
      idsToFetch = [];
      for (const anc of ancestors) {
        visited.set(anc._id.toString(), anc);
        if (anc.parent && !visited.has(anc.parent.toString())) {
          idsToFetch.push(anc.parent);
        }
      }
    }
  }

  // 3. Walk from leaf → root, collect names, then reverse
  const parts = [];
  let current = leaf;
  while (current) {
    parts.push(current.name);
    const parentId = current.parent ? current.parent.toString() : null;
    current = parentId ? visited.get(parentId) : null;
  }
  parts.reverse();
  return parts.join(' > ');
}

export const createSchoolTest = async (data) => {
  // Legacy bypass: Tests now structurally link directly via Test module
  return true;
};

export const getSchoolTests = async (options = {}) => {
  const { categoryId, page = 1, limit = 10, isPublished } = options;
  const pageNum = parseInt(page);
  const limitNum = parseInt(limit);
  const skip = (pageNum - 1) * limitNum;

  // Use Test.categoryId as the strict source of truth — tests belong only to the subcategory they were created in
  const query = { categoryId, applicableFor: { $in: ["School", "test"] } };
  // Student routes pass isPublished: true; admin routes omit so drafts remain visible.
  if (isPublished !== undefined) {
    query.isPublished = isPublished;
  }

  // Build the full ancestor path once for this categoryId (all tests share the same category)
  const categoryPath = await buildCategoryPath(categoryId);

  const [rawTests, total] = await Promise.all([
    Test.find(query)
      .skip(skip)
      .limit(limitNum)
      .sort({ createdAt: -1 }),
    Test.countDocuments(query),
  ]);

  let processedTests = rawTests.map(test => {
    const obj = test.toObject ? test.toObject() : { ...test };
    // Attach the pre-built full path, e.g. "School > Class 1 > Biology"
    obj.categoryPath = categoryPath;
    return obj;
  });

  if (processedTests.length > 0 && categoryId) {
    const category = await Category.findById(categoryId).lean();
    if (category?.isFree) {
      processedTests = processedTests.map(t => ({
        ...t,
        originalPrice: t.price || 0,
        discountedPrice: 0,
        effectivePrice: 0,
        discountAmount: t.price || 0,
      }));
    } else {
      const pillarModuleType = category?.rootType || "Test";
      processedTests = await attachOfferToList(processedTests, pillarModuleType, "price");
    }
  } else if (processedTests.length > 0) {
    processedTests = await attachOfferToList(processedTests, "Test", "price");
  }

  const tests = processedTests;

  return {
    tests,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      pages: Math.ceil(total / limitNum) || 1,
    },
  };
};

export const updateSchoolTest = async (id, updateData) => {
  // Not used actively since edits hit the main Test Builder API
  return true;
};

export const deleteSchoolTest = async (id) => {
  // Deleting from the folder just unlinks the explicit categoryId
  return await Test.findByIdAndUpdate(id, { $unset: { categoryId: 1 } });
};

export default {
  createSchoolTest,
  getSchoolTests,
  updateSchoolTest,
  deleteSchoolTest,
};
