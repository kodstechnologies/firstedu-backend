import QuestionBank from "../models/QuestionBank.js";
import Question from "../models/Question.js";
import { ApiError } from "../utils/ApiError.js";

const create = async (data) => {
  try {
    return await QuestionBank.create(data);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(500, "Failed to create question bank", error.message);
  }
};

const findById = async (id, populate = true) => {
  try {
    let q = QuestionBank.findById(id);
    if (populate) {
      q = q
        .populate("classType", "name")
        .populate("subjects", "name");
    }
    return await q;
  } catch (error) {
    throw new ApiError(500, "Failed to fetch question bank", error.message);
  }
};

const findAll = async (filter = {}, options = {}) => {
  try {
    const {
      page = 1,
      limit = 20,
      sortBy = "createdAt",
      sortOrder = "desc",
      search,
      classType,
    } = options;

    const query = { ...filter };
    if (classType) query.classType = classType;
    if (search) {
      query.name = { $regex: search, $options: "i" };
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit) || 20;
    const skip = (pageNum - 1) * limitNum;
    const sort = { [sortBy]: sortOrder === "desc" ? -1 : 1 };

    const [items, total] = await Promise.all([
      QuestionBank.find(query)
        .populate("classType", "name")
        .populate("subjects", "name")
        .sort(sort)
        .skip(skip)
        .limit(limitNum),
      QuestionBank.countDocuments(query),
    ]);

    return {
      items,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum) || 1,
      },
    };
  } catch (error) {
    throw new ApiError(500, "Failed to fetch question banks", error.message);
  }
};

const updateById = async (id, updateData) => {
  try {
    return await QuestionBank.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true, runValidators: true }
    )
      .populate("classType", "name")
      .populate("subjects", "name");
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(500, "Failed to update question bank", error.message);
  }
};

const deleteById = async (id) => {
  try {
    const deleted = await QuestionBank.findByIdAndDelete(id);
    if (!deleted) throw new ApiError(404, "Question bank not found");
    return deleted;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(500, "Failed to delete question bank", error.message);
  }
};

const getQuestionsByBankId = async (bankId, options = {}) => {
  try {
    const { sortBy = "orderInBank", sortOrder = "asc" } = options;
    const sort = { [sortBy]: sortOrder === "desc" ? -1 : 1 };
    return await Question.find({ questionBank: bankId })
      .populate("subjectRef", "name")
      .populate("createdBy", "name email")
      .sort(sort)
      .lean();
  } catch (error) {
    throw new ApiError(500, "Failed to fetch questions for bank", error.message);
  }
};

const countQuestionsByBankId = async (bankId) => {
  try {
    return await Question.countDocuments({ questionBank: bankId });
  } catch (error) {
    throw new ApiError(500, "Failed to count questions", error.message);
  }
};

const deleteQuestionsByBankId = async (bankId) => {
  try {
    const result = await Question.deleteMany({ questionBank: bankId });
    return result.deletedCount;
  } catch (error) {
    throw new ApiError(500, "Failed to delete questions for bank", error.message);
  }
};

export default {
  create,
  findById,
  findAll,
  updateById,
  deleteById,
  getQuestionsByBankId,
  countQuestionsByBankId,
  deleteQuestionsByBankId,
};
