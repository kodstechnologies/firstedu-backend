import Test from "../models/Test.js";
import Category from "../models/Category.js";
import { attachOfferToList } from "../utils/offerUtils.js";

/**
 * Walk the category tree upward from `startId` and return a
 * human-readable path string like "Competitive > Class 1 > Biology".
 */
async function buildCategoryPath(startId) {
  if (!startId) return '';
  const leaf = await Category.findById(startId).select('name parent').lean();
  if (!leaf) return '';

  const visited = new Map();
  visited.set(leaf._id.toString(), leaf);

  let idsToFetch = leaf.parent ? [leaf.parent] : [];
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

export const createCompetitiveTest = async (data) => {
  // Legacy bypass: Tests now structurally link directly via Test module
  return true;
};

export const getCompetitiveTests = async (options = {}) => {
  const { categoryId, page = 1, limit = 10, search, isPublished } = options;
  const pageNum = parseInt(page);
  const limitNum = parseInt(limit);
  const skip = (pageNum - 1) * limitNum;

  // Use Test.categoryId as the strict source of truth — tests belong only to the subcategory they were created in
  const query = { categoryId };
  // When isPublished flag is provided, filter by publish status.
  // Student routes pass isPublished: true so draft tests are never exposed.
  // Admin routes omit this flag so all tests (including drafts) are returned.
  if (isPublished !== undefined) {
    query.isPublished = isPublished;
  }
  if (search) {
    query.title = { $regex: search, $options: 'i' };
  }

  // Build the full ancestor path once (all tests on this page share the same category)
  const categoryPath = await buildCategoryPath(categoryId);

  const [rawTests, total] = await Promise.all([
    Test.find(query)
      .skip(skip)
      .limit(limitNum)
      .sort({ createdAt: -1 }),
    Test.countDocuments(query),
  ]);

  let tests = rawTests.map(t => {
    const obj = t.toObject ? t.toObject() : { ...t };
    obj.categoryPath = categoryPath;
    return obj;
  });

  if (tests.length > 0 && categoryId) {
    const category = await Category.findById(categoryId).lean();
    if (category?.isFree) {
      tests = tests.map(t => ({
        ...t,
        originalPrice: t.price || 0,
        discountedPrice: 0,
        effectivePrice: 0,
        discountAmount: t.price || 0,
      }));
    } else {
      // Use pillar-level offer (e.g. "Competitive") when available; "Test" as fallback
      const pillarModuleType = category?.rootType || "Test";
      tests = await attachOfferToList(tests, pillarModuleType, "price");
    }
  } else if (tests.length > 0) {
    tests = await attachOfferToList(tests, "Test", "price");
  }

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

export const updateCompetitiveTest = async (id, updateData) => {
  // Not used actively since edits hit the main Test Builder API
  return true;
};

export const deleteCompetitiveTest = async (id) => {
  // Deleting from the folder just unlinks the explicit categoryId
  return await Test.findByIdAndUpdate(id, { $unset: { categoryId: 1 } });
};

export default {
  createCompetitiveTest,
  getCompetitiveTests,
  updateCompetitiveTest,
  deleteCompetitiveTest,
};
