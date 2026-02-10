import ClassType from "../models/ClassType.js";
import { ApiError } from "../utils/ApiError.js";

const create = async (data) => {
  try {
    return await ClassType.create(data);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(500, "Failed to create class type", error.message);
  }
};

const findById = async (id) => {
  try {
    return await ClassType.findById(id);
  } catch (error) {
    throw new ApiError(500, "Failed to fetch class type", error.message);
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
      isActive,
    } = options;

    const query = { ...filter };
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
      ClassType.find(query).sort(sort).skip(skip).limit(limitNum),
      ClassType.countDocuments(query),
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
    throw new ApiError(500, "Failed to fetch class types", error.message);
  }
};

const updateById = async (id, updateData) => {
  try {
    return await ClassType.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true, runValidators: true }
    );
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(500, "Failed to update class type", error.message);
  }
};

const deleteById = async (id) => {
  try {
    const deleted = await ClassType.findByIdAndDelete(id);
    if (!deleted) throw new ApiError(404, "Class type not found");
    return deleted;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(500, "Failed to delete class type", error.message);
  }
};

export default {
  create,
  findById,
  findAll,
  updateById,
  deleteById,
};
