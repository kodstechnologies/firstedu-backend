import { asyncHandler } from "../utils/asyncHandler.js";
import mongoose from "mongoose";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import studentRepository from "../repository/student.repository.js";
import studentSessionRepository from "../repository/studentSession.repository.js";
import examSessionRepository from "../repository/examSession.repository.js";
import categoryRepository from "../repository/category.repository.js";
import Category from "../models/Category.js";
import QuestionBank from "../models/QuestionBank.js";
import Test from "../models/Test.js";
import TestBundle from "../models/TestBundle.js";
import Course from "../models/Course.js";
import TestPurchase from "../models/TestPurchase.js";
import CoursePurchase from "../models/CoursePurchase.js";
import CategoryPurchase from "../models/CategoryPurchase.js";

const getStudentIdsByPurchasedCategory = async (categoryId) => {
  if (!mongoose.isValidObjectId(categoryId)) {
    throw new ApiError(400, "Invalid categoryId");
  }

  const categoryExists = await Category.exists({ _id: categoryId });
  if (!categoryExists) {
    throw new ApiError(404, "Category not found");
  }

  const categoryIds = await categoryRepository.findDescendantIds(categoryId);
  const questionBankIds = await QuestionBank.find({
    categories: { $in: categoryIds },
  }).distinct("_id");

  const testIds = await Test.find({
    $or: [
      { categoryId: { $in: categoryIds } },
      { questionBank: { $in: questionBankIds } },
    ],
  }).distinct("_id");

  const [bundleIds, courseIds] = await Promise.all([
    TestBundle.find({ tests: { $in: testIds } }).distinct("_id"),
    Course.find({ categoryIds: { $in: categoryIds } }).distinct("_id"),
  ]);

  const testPurchaseOr = [
    { schoolCategory: { $in: categoryIds } },
    { skillCategory: { $in: categoryIds } },
  ];
  if (testIds.length > 0) testPurchaseOr.push({ test: { $in: testIds } });
  if (bundleIds.length > 0) {
    testPurchaseOr.push({ testBundle: { $in: bundleIds } });
  }

  const [categoryStudents, courseStudents, testStudents] = await Promise.all([
    CategoryPurchase.distinct("student", {
      paymentStatus: "completed",
      $or: [
        { categoryId: { $in: categoryIds } },
        { unlockedCategoryIds: { $in: categoryIds } },
      ],
    }),
    courseIds.length > 0
      ? CoursePurchase.distinct("student", {
          paymentStatus: "completed",
          course: { $in: courseIds },
        })
      : [],
    TestPurchase.distinct("student", {
      paymentStatus: "completed",
      $or: testPurchaseOr,
    }),
  ]);

  return [
    ...new Set(
      [...categoryStudents, ...courseStudents, ...testStudents]
        .map((id) => id?.toString?.())
        .filter(Boolean)
    ),
  ];
};

// List Students with pagination/search
export const getStudents = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10, search, status, categoryId } = req.query;

  const filter = {};
  if (status && ["active", "banned"].includes(status)) {
    filter.status = status;
  }
  if (categoryId) {
    const studentIds = await getStudentIdsByPurchasedCategory(categoryId);
    filter._id = { $in: studentIds };
  }

  const [result, counts] = await Promise.all([
    studentRepository.findAll(filter, {
      page,
      limit,
      search,
      sortBy: "createdAt",
      sortOrder: "desc",
    }),
    studentRepository.getCounts(),
  ]);

  const meta = {
    ...result.pagination,
    totalUsers: counts.totalUsers,
    totalBannedUsers: counts.totalBannedUsers,
  };

  return res.status(200).json(
    ApiResponse.success(result.students, "Students fetched successfully", meta)
  );
});


// Get Student by ID
export const getStudentById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const student = await studentRepository.findById(id);

  if (!student) {
    throw new ApiError(404, "Student not found");
  }

  return res.status(200).json(
    ApiResponse.success(student, "Student fetched successfully")
  );
});

// Get a student's test (exam) history
export const getStudentTestHistory = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { page = 1, limit = 10, status } = req.query;

  const student = await studentRepository.findById(id);
  if (!student) {
    throw new ApiError(404, "Student not found");
  }

  const query = { student: id };
  if (status) {
    query.status = status;
  }

  const result = await examSessionRepository.findAll(query, {
    page,
    limit,
    sortBy: "createdAt",
    sortOrder: "desc",
  });

  // Populate test field
  const sessions = await Promise.all(
    result.sessions.map(async (session) => {
      const populated = await examSessionRepository.findById(session._id, {
        test: "title durationMinutes questionBank",
      });
      return populated;
    })
  );

  return res.status(200).json(
    ApiResponse.success(sessions, "Test history fetched successfully", result.pagination)
  );
});

// Update student status (ban/unban)
export const updateStudentStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!status || !["active", "banned"].includes(status)) {
    throw new ApiError(400, "status must be 'active' or 'banned'");
  }

  const student = await studentRepository.findById(id);
  if (!student) {
    throw new ApiError(404, "Student not found");
  }

  const updateData = status === "banned"
    ? { $set: { status: "banned" } }
    : { $set: { status: "active" } };

  if (status === "banned") {
    await studentSessionRepository.deleteByStudentId(id);
  }

  const updated = await studentRepository.updateById(id, updateData);
  return res.status(200).json(
    ApiResponse.success(updated, `Student ${status === "banned" ? "banned" : "activated"} successfully`)
  );
});

// Get proctor logs for a specific exam session
export const getProctorLogs = asyncHandler(async (req, res) => {
  const { sessionId } = req.params;

  const session = await examSessionRepository.findById(sessionId, {
    student: "name email phone",
    test: "title",
  });

  if (!session) {
    throw new ApiError(404, "Exam session not found");
  }

  return res.status(200).json(
    ApiResponse.success(
      {
        sessionId: session._id,
        student: session.student,
        test: session.test,
        proctoringEvents: session.proctoringEvents || [],
      },
      "Proctor logs fetched successfully"
    )
  );
});

export default {
  getStudents,
  getStudentById,
  getStudentTestHistory,
  getProctorLogs,
  updateStudentStatus,
};


