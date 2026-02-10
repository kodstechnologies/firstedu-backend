import ExamSession from "../models/ExamSession.js";
import Test from "../models/Test.js";
import Question from "../models/Question.js";
import TestPurchase from "../models/TestPurchase.js";
import { ApiError } from "../utils/ApiError.js";

const create = async (sessionData) => {
  try {
    return await ExamSession.create(sessionData);
  } catch (error) {
    throw new ApiError(500, "Failed to create exam session", error.message);
  }
};

const findById = async (id, populateOptions = {}) => {
  try {
    let query = ExamSession.findById(id);
    if (populateOptions.test) {
      query = query.populate("test", populateOptions.test);
    }
    if (populateOptions.student) {
      query = query.populate("student", populateOptions.student);
    }
    if (populateOptions.answers) {
      query = query.populate({
        path: "answers.questionId",
        select: populateOptions.answers.select || "",
        populate: populateOptions.answers.populate || {},
      });
    }
    return await query;
  } catch (error) {
    throw new ApiError(500, "Failed to fetch exam session", error.message);
  }
};

const findOne = async (filter, populateOptions = {}) => {
  try {
    let query = ExamSession.findOne(filter);
    if (populateOptions.test) {
      query = query.populate("test", populateOptions.test);
    }
    if (populateOptions.student) {
      query = query.populate("student", populateOptions.student);
    }
    if (populateOptions.answers) {
      query = query.populate({
        path: "answers.questionId",
        select: populateOptions.answers.select || "",
        populate: populateOptions.answers.populate || {},
      });
    }
    return await query;
  } catch (error) {
    throw new ApiError(500, "Failed to fetch exam session", error.message);
  }
};

const findAll = async (filter = {}, options = {}) => {
  try {
    const {
      page = 1,
      limit = 10,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = options;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;
    const sort = { [sortBy]: sortOrder === "desc" ? -1 : 1 };

    const [sessions, total] = await Promise.all([
      ExamSession.find(filter)
        .populate("test", "title description")
        .populate("student", "name email")
        .sort(sort)
        .skip(skip)
        .limit(limitNum),
      ExamSession.countDocuments(filter),
    ]);

    return {
      sessions,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum) || 1,
      },
    };
  } catch (error) {
    throw new ApiError(500, "Failed to fetch exam sessions", error.message);
  }
};

const updateById = async (id, updateData) => {
  try {
    return await ExamSession.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true, runValidators: true }
    );
  } catch (error) {
    throw new ApiError(500, "Failed to update exam session", error.message);
  }
};

const save = async (session) => {
  try {
    return await session.save();
  } catch (error) {
    throw new ApiError(500, "Failed to save exam session", error.message);
  }
};

// ========== Test Repository Methods ==========
const findTestById = async (id, populateOptions = {}) => {
  try {
    let query = Test.findById(id);
    if (populateOptions.questions) {
      query = query.populate("questions", populateOptions.questions);
    }
    return await query;
  } catch (error) {
    throw new ApiError(500, "Failed to fetch test", error.message);
  }
};

// ========== Question Repository Methods ==========
const findQuestionById = async (id) => {
  try {
    return await Question.findById(id);
  } catch (error) {
    throw new ApiError(500, "Failed to fetch question", error.message);
  }
};

// ========== TestPurchase Repository Methods ==========
const findTestPurchase = async (filter) => {
  try {
    return await TestPurchase.findOne(filter);
  } catch (error) {
    throw new ApiError(500, "Failed to fetch test purchase", error.message);
  }
};

const findAllCompletedSessions = async (testId) => {
  try {
    return await ExamSession.find({
      test: testId,
      status: "completed",
      score: { $ne: null },
    }).select("score");
  } catch (error) {
    throw new ApiError(500, "Failed to fetch completed sessions", error.message);
  }
};

const findExpiredInProgressSessions = async () => {
  try {
    const now = new Date();
    return await ExamSession.find({
      status: "in_progress",
      endTime: { $lte: now },
    });
  } catch (error) {
    throw new ApiError(500, "Failed to fetch expired sessions", error.message);
  }
};

/**
 * Get top N students by best score for a test (one entry per student, best score wins; tie-break: earlier completedAt).
 * studentIds: optional array; if provided, only these students are considered.
 */
const getRankedByTest = async (testId, studentIds = null, limit = 10) => {
  try {
    const match = {
      test: testId,
      status: "completed",
      score: { $ne: null, $gte: 0 },
    };
    if (Array.isArray(studentIds) && studentIds.length) {
      match.student = { $in: studentIds };
    }
    const ranked = await ExamSession.aggregate([
      { $match: match },
      { $sort: { score: -1, completedAt: 1 } },
      {
        $group: {
          _id: "$student",
          score: { $first: "$score" },
          maxScore: { $first: "$maxScore" },
          completedAt: { $first: "$completedAt" },
        },
      },
      { $sort: { score: -1, completedAt: 1 } },
      { $limit: limit },
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "_id",
          as: "studentDoc",
          pipeline: [{ $project: { name: 1, email: 1 } }],
        },
      },
      { $unwind: { path: "$studentDoc", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          student: "$_id",
          score: 1,
          maxScore: 1,
          completedAt: 1,
          name: "$studentDoc.name",
          email: "$studentDoc.email",
        },
      },
    ]);
    return ranked;
  } catch (error) {
    throw new ApiError(500, "Failed to fetch rankings", error.message);
  }
};

export default {
  create,
  findById,
  findOne,
  findAll,
  updateById,
  save,
  findTestById,
  findQuestionById,
  findTestPurchase,
  findAllCompletedSessions,
  findExpiredInProgressSessions,
  getRankedByTest,
};

