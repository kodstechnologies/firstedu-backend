import qna from "../models/QnA.js";
import { ApiError } from "../utils/ApiError.js";

const create = async (Data) => {
  try {
    return await qna.create(Data);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(500, "Failed to create ", error.message);
  }
};

const findById = async (id) => {
  try {
    return await qna.findById(id)
    .populate("createdBy", "name email");
  } catch (error) {
    throw new ApiError(500, "Failed to fetch ", error.message);
  }
};
// selfQnAs
const selfQnAs = async (id) => {
  try {
    return await qna.findById({createdBy:id})
    .populate("createdBy", "name email");
  } catch (error) {
    throw new ApiError(500, "Failed to fetch ", error.message);
  }
};

const findAll = async (filter = {}, options = {}) => {
  try {
    const {
      page = 1,
      limit = 10,
      sortBy = "createdAt",
      sortOrder = "desc",
      search,
      type,
    } = options;

    const query = { ...filter };

    if (search) {
      query.$or = [
        { question: { $regex: search, $options: "i" }},
        { answer: { $regex: search, $options: "i" } },
        { status: { $regex: search, $options: "i" } },
        { subject: { $regex: search, $options: "i" } },
        { creatorModel: { $regex: search, $options: "i" } },
      ];
    }

    if (type) {
      query.creatorModel = type;
    }
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const sort = { [sortBy]: sortOrder === "desc" ? -1 : 1 };

    const s = await qna
      .find(query)
      .populate("createdBy", "name email userType")
      .sort({ priority: 1, createdAt: -1 })
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit));

    const total = await qna.countDocuments(query);
    return {
      data: s,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    };
  } catch (error) {
    throw new ApiError(500, "Failed to fetch s", error.message);
  }
};

const updateById = async (id, updateData) => {
  try {
    return await qna
      .findByIdAndUpdate(
        id,
        { $set: updateData },
        { new: true, runValidators: true },
      )
      .populate("createdBy", "name email");
  } catch (error) {
    throw new ApiError(500, "Failed to update ", error.message);
  }
};

const approveQnA = async (id) => {
  try {
    return await qna
      .findByIdAndUpdate(
        id,
        { $set: { status: "approved", priority: 1 } },
        { new: true, runValidators: true },
      )
      .populate("createdBy", "name email");
  } catch (error) {
    throw new ApiError(500, "Failed to update ", error.message);
  }
};

const deleteById = async (id) => {
  try {
    const qnas = await qna.findById(id);
    if (!qnas) {
      throw new ApiError(404, " not found");
    }
    return await qna.findByIdAndDelete(id);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(500, "Failed to delete ", error.message);
  }
};

export default {
  create,
  findById,
  selfQnAs,
  approveQnA,

  findAll,
  updateById,
  deleteById,
};
