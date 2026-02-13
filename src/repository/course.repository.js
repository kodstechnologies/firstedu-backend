import Course from "../models/Course.js";
import { ApiError } from "../utils/ApiError.js";

const create = async (courseData) => {
  try {
    return await Course.create(courseData);
  } catch (error) {
    throw new ApiError(500, "Failed to create course", error.message);
  }
};

const findById = async (id) => {
  try {
    return await Course.findById(id);
  } catch (error) {
    throw new ApiError(500, "Failed to fetch course", error.message);
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
      category,
      isPublished,
    } = options;

    const query = { ...filter };

    if (category) {
      query.category = category;
    }

    if (typeof isPublished !== "undefined") {
      query.isPublished = isPublished === "true" || isPublished === true;
    }

    if (search) {
      const regex = { $regex: search, $options: "i" };
      query.$or = [{ title: regex }, { description: regex }];
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;
    const sort = { [sortBy]: sortOrder === "desc" ? -1 : 1 };

    const [courses, total] = await Promise.all([
      Course.find(query)
        .sort(sort)
        .skip(skip)
        .limit(limitNum),
      Course.countDocuments(query),
    ]);

    return {
      courses,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum) || 1,
      },
    };
  } catch (error) {
    throw new ApiError(500, "Failed to fetch courses", error.message);
  }
};

const updateById = async (id, updateData) => {
  try {
    return await Course.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true, runValidators: true }
    );
  } catch (error) {
    throw new ApiError(500, "Failed to update course", error.message);
  }
};

const deleteById = async (id) => {
  try {
    const course = await Course.findById(id);
    if (!course) {
      throw new ApiError(404, "Course not found");
    }
    return await Course.findByIdAndDelete(id);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(500, "Failed to delete course", error.message);
  }
};

export default {
  create,
  findById,
  findAll,
  updateById,
  deleteById,
};

