import Test from "../models/Test.js";
import Category from "../models/Category.js";
import { attachOfferToList } from "../utils/offerUtils.js";

export const createSchoolTest = async (data) => {
  // Legacy bypass: Tests now structurally link directly via Test module
  return true;
};

export const getSchoolTests = async (options = {}) => {
  const { categoryId, page = 1, limit = 10 } = options;
  const pageNum = parseInt(page);
  const limitNum = parseInt(limit);
  const skip = (pageNum - 1) * limitNum;

  // Use Test.categoryId as the strict source of truth — tests belong only to the subcategory they were created in
  const query = { categoryId, applicableFor: { $in: ["School", "test"] } };

  const [rawTests, total] = await Promise.all([
    Test.find(query)
      .skip(skip)
      .limit(limitNum)
      .sort({ createdAt: -1 }),
    Test.countDocuments(query),
  ]);

  let processedTests = rawTests.map(test => (test.toObject ? test.toObject() : { ...test }));

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
