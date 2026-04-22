import OlympiadTest from "../models/OlympiadTest.js";
import Category from "../models/Category.js";
import Test from "../models/Test.js";
import { ApiError } from "../utils/ApiError.js";
import { assertSubtreeNotPurchased } from "../utils/purchaseGuard.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Returns a new Date = startTime + durationMinutes, or null if inputs are missing. */
const computeEndTime = (startTime, durationMinutes) => {
  if (!startTime || !durationMinutes) return null;
  return new Date(new Date(startTime).getTime() + Number(durationMinutes) * 60_000);
};

const validateScheduleOrder = ({ registrationStartTime, registrationEndTime, startTime, endTime, resultDeclarationDate }) => {
  if (registrationStartTime && registrationEndTime) {
    if (new Date(registrationStartTime) >= new Date(registrationEndTime)) {
      throw new ApiError(400, "Registration end time must be after registration start time");
    }
  }
  if (registrationEndTime && startTime) {
    if (new Date(registrationEndTime) > new Date(startTime)) {
      throw new ApiError(400, "Registration must close before the exam start time");
    }
  }
  if (resultDeclarationDate) {
    const referenceTime = endTime || startTime;
    if (referenceTime && new Date(resultDeclarationDate) <= new Date(referenceTime)) {
      throw new ApiError(400, "Result declaration date must be after the exam schedule");
    }
  }
};

// ── CRUD ──────────────────────────────────────────────────────────────────────

export const createOlympiadTest = async (data) => {
  const category = await Category.findById(data.categoryId);
  if (!category) throw new ApiError(404, "Category not found");
  await assertSubtreeNotPurchased(data.categoryId, "add tests to");

  const existing = await OlympiadTest.findOne({
    categoryId: data.categoryId,
    $or: [{ testId: data.testId }, { title: data.title }],
  });
  if (existing) {
    throw new ApiError(400, "Test is already added or a test with this title already exists in this category");
  }

  // Auto-compute endTime from startTime + linked test's durationMinutes
  if (data.startTime) {
    const test = await Test.findById(data.testId).select("durationMinutes");
    if (test?.durationMinutes) {
      data.endTime = computeEndTime(data.startTime, test.durationMinutes);
    }
  }

  validateScheduleOrder(data);

  return await OlympiadTest.create(data);
};

export const getOlympiadTests = async (options = {}) => {
  const { categoryId, page = 1, limit = 10 } = options;
  const pageNum = parseInt(page);
  const limitNum = parseInt(limit);
  const skip = (pageNum - 1) * limitNum;

  const query = {};
  if (categoryId) query.categoryId = categoryId;

  const [tests, total] = await Promise.all([
    OlympiadTest.find(query)
      .populate("testId", "title description durationMinutes price discountType discountValue")
      .skip(skip)
      .limit(limitNum)
      .sort({ createdAt: -1 }),
    OlympiadTest.countDocuments(query),
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

export const getOlympiadTestById = async (id) => {
  const item = await OlympiadTest.findById(id).populate(
    "testId",
    "title description durationMinutes price discountType discountValue isPublished questionBank proctoringInstructions applicableFor"
  );
  if (!item) throw new ApiError(404, "Olympiad Test not found");
  return item;
};

export const updateOlympiadTest = async (id, updateData) => {
  const existing = await OlympiadTest.findById(id);
  if (!existing) throw new ApiError(404, "Olympiad Test not found");
  await assertSubtreeNotPurchased(existing.categoryId, "edit tests in");

  if (updateData.title) {
    const titleCheck = await OlympiadTest.findOne({
      categoryId: existing.categoryId,
      title: updateData.title,
      _id: { $ne: id },
    });
    if (titleCheck) {
      throw new ApiError(400, "A test with this title already exists in this category");
    }
  }

  // Re-compute endTime whenever startTime is being updated
  if (updateData.startTime) {
    const test = await Test.findById(existing.testId).select("durationMinutes");
    if (test?.durationMinutes) {
      updateData.endTime = computeEndTime(updateData.startTime, test.durationMinutes);
    }
  }

  // Merge existing + incoming values for schedule validation
  validateScheduleOrder({
    registrationStartTime: updateData.registrationStartTime ?? existing.registrationStartTime,
    registrationEndTime:   updateData.registrationEndTime   ?? existing.registrationEndTime,
    startTime:             updateData.startTime             ?? existing.startTime,
    endTime:               updateData.endTime               ?? existing.endTime,
    resultDeclarationDate: updateData.resultDeclarationDate ?? existing.resultDeclarationDate,
  });

  return await OlympiadTest.findByIdAndUpdate(id, updateData, { new: true });
};

export const deleteOlympiadTest = async (id) => {
  const existing = await OlympiadTest.findById(id);
  if (!existing) throw new ApiError(404, "Olympiad Test not found");
  await assertSubtreeNotPurchased(existing.categoryId, "delete tests from");

  return await OlympiadTest.findByIdAndDelete(id);
};

export default {
  createOlympiadTest,
  getOlympiadTests,
  getOlympiadTestById,
  updateOlympiadTest,
  deleteOlympiadTest,
};
