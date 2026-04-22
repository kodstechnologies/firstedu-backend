import Test from "../models/Test.js";
import Category from "../models/Category.js";
import { attachOfferToList } from "../utils/offerUtils.js";

export const createCompetitiveTest = async (data) => {
  // Legacy bypass: Tests now structurally link directly via Test module
  return true;
};

export const getCompetitiveTests = async (options = {}) => {
  const { categoryId, page = 1, limit = 10, search } = options;
  const pageNum = parseInt(page);
  const limitNum = parseInt(limit);
  const skip = (pageNum - 1) * limitNum;

  // Use Test.categoryId as the strict source of truth — tests belong only to the subcategory they were created in
  const query = { categoryId };
  if (search) {
    query.title = { $regex: search, $options: 'i' };
  }

  const [rawTests, total] = await Promise.all([
    Test.find(query)
      .skip(skip)
      .limit(limitNum)
      .sort({ createdAt: -1 }),
    Test.countDocuments(query),
  ]);

  let tests = rawTests.map(t => (t.toObject ? t.toObject() : { ...t }));

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
