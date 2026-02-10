import Subject from "../models/Subject.js";
import { ApiError } from "../utils/ApiError.js";

const create = async (data) => {
  try {
    return await Subject.create(data);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(500, "Failed to create subject", error.message);
  }
};

const findById = async (id) => {
  try {
    return await Subject.findById(id).populate("classType", "name");
  } catch (error) {
    throw new ApiError(500, "Failed to fetch subject", error.message);
  }
};

const findByClassType = async (classTypeId) => {
  try {
    return await Subject.find({ classType: classTypeId, isActive: true })
      .sort({ name: 1 })
      .lean();
  } catch (error) {
    throw new ApiError(500, "Failed to fetch subjects", error.message);
  }
};

const findAll = async (filter = {}, options = {}) => {
  try {
    const {
      page = 1,
      limit = 50,
      sortBy = "createdAt",
      sortOrder = "desc",
      search,
      classType,
      isActive,
    } = options;

    const query = { ...filter };
    if (classType) query.classType = classType;
    if (typeof isActive !== "undefined") {
      query.isActive = isActive === "true" || isActive === true;
    }
    if (search) {
      query.name = { $regex: search, $options: "i" };
    }

    const pageNum = parseInt(page);
    const limitNum = Math.min(parseInt(limit) || 50, 100);
    const skip = (pageNum - 1) * limitNum;
    const sort = { [sortBy]: sortOrder === "desc" ? -1 : 1 };

    const [items, total] = await Promise.all([
      Subject.find(query)
        .populate("classType", "name")
        .sort(sort)
        .skip(skip)
        .limit(limitNum),
      Subject.countDocuments(query),
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
    throw new ApiError(500, "Failed to fetch subjects", error.message);
  }
};

const updateById = async (id, updateData) => {
  try {
    return await Subject.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true, runValidators: true }
    ).populate("classType", "name");
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(500, "Failed to update subject", error.message);
  }
};

const deleteById = async (id) => {
  try {
    const deleted = await Subject.findByIdAndDelete(id);
    if (!deleted) throw new ApiError(404, "Subject not found");
    return deleted;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(500, "Failed to delete subject", error.message);
  }
};

export default {
  create,
  findById,
  findByClassType,
  findAll,
  updateById,
  deleteById,
};
