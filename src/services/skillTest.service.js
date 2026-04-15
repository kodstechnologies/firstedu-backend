import SkillTest from "../models/SkillTest.js";
import Category from "../models/Category.js";
import { ApiError } from "../utils/ApiError.js";
import { assertSubtreeNotPurchased } from "../utils/purchaseGuard.js";

export const createSkillTest = async (data) => {
  const category = await Category.findById(data.categoryId);
  if (!category) throw new ApiError(404, "Category not found");
  await assertSubtreeNotPurchased(data.categoryId, "add tests to");

  const existing = await SkillTest.findOne({
    categoryId: data.categoryId,
    $or: [{ testId: data.testId }, { title: data.title }],
  });
  if (existing) {
    throw new ApiError(400, "Test is already added or a test with this title already exists in this category");
  }

  return await SkillTest.create(data);
};

export const getSkillTests = async (options = {}) => {
  const { categoryId, page = 1, limit = 10 } = options;
  const pageNum = parseInt(page);
  const limitNum = parseInt(limit);
  const skip = (pageNum - 1) * limitNum;

  const query = {};
  if (categoryId) query.categoryId = categoryId;

  const [tests, total] = await Promise.all([
    SkillTest.find(query)
      .populate("testId", "title description durationMinutes price")
      .skip(skip)
      .limit(limitNum)
      .sort({ createdAt: -1 }),
    SkillTest.countDocuments(query),
  ]);

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

export const updateSkillTest = async (id, updateData) => {
  const existing = await SkillTest.findById(id);
  if (!existing) throw new ApiError(404, "SkillTest not found");
  await assertSubtreeNotPurchased(existing.categoryId, "edit tests in");

  if (updateData.title) {
    const titleCheck = await SkillTest.findOne({
      categoryId: existing.categoryId,
      title: updateData.title,
      _id: { $ne: id },
    });
    if (titleCheck) {
      throw new ApiError(400, "A test with this title already exists in this category");
    }
  }

  return await SkillTest.findByIdAndUpdate(id, updateData, { new: true });
};

export const deleteSkillTest = async (id) => {
  const existing = await SkillTest.findById(id);
  if (!existing) throw new ApiError(404, "SkillTest not found");
  await assertSubtreeNotPurchased(existing.categoryId, "delete tests from");

  return await SkillTest.findByIdAndDelete(id);
};

export default {
  createSkillTest,
  getSkillTests,
  updateSkillTest,
  deleteSkillTest,
};
