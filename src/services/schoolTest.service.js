import SchoolTest from "../models/SchoolTest.js";
import Category from "../models/Category.js";
import { ApiError } from "../utils/ApiError.js";
import { assertSubtreeNotPurchased } from "../utils/purchaseGuard.js";

export const createSchoolTest = async (data) => {
  const category = await Category.findById(data.categoryId);
  if (!category) throw new ApiError(404, "Category not found");
  await assertSubtreeNotPurchased(data.categoryId, "add tests to");

  const existing = await SchoolTest.findOne({
    categoryId: data.categoryId,
    $or: [{ testId: data.testId }, { title: data.title }],
  });
  if (existing) {
    throw new ApiError(400, "Test is already added or a test with this title already exists in this category");
  }

  return await SchoolTest.create(data);
};

export const getSchoolTests = async (options = {}) => {
  const { categoryId, page = 1, limit = 10 } = options;
  const pageNum = parseInt(page);
  const limitNum = parseInt(limit);
  const skip = (pageNum - 1) * limitNum;

  const query = {};
  if (categoryId) query.categoryId = categoryId;

  const [tests, total] = await Promise.all([
    SchoolTest.find(query)
      .populate("testId", "title description durationMinutes price")
      .skip(skip)
      .limit(limitNum)
      .sort({ createdAt: -1 }),
    SchoolTest.countDocuments(query),
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

export const updateSchoolTest = async (id, updateData) => {
  const existing = await SchoolTest.findById(id);
  if (!existing) throw new ApiError(404, "SchoolTest not found");
  await assertSubtreeNotPurchased(existing.categoryId, "edit tests in");

  if (updateData.title) {
    const titleCheck = await SchoolTest.findOne({
      categoryId: existing.categoryId,
      title: updateData.title,
      _id: { $ne: id },
    });
    if (titleCheck) {
      throw new ApiError(400, "A test with this title already exists in this category");
    }
  }

  return await SchoolTest.findByIdAndUpdate(id, updateData, { new: true });
};

export const deleteSchoolTest = async (id) => {
  const existing = await SchoolTest.findById(id);
  if (!existing) throw new ApiError(404, "SchoolTest not found");
  await assertSubtreeNotPurchased(existing.categoryId, "delete tests from");

  return await SchoolTest.findByIdAndDelete(id);
};

export default {
  createSchoolTest,
  getSchoolTests,
  updateSchoolTest,
  deleteSchoolTest,
};
