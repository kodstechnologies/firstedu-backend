import CourseTestLink from "../models/CourseTestLink.js";
import Course from "../models/Course.js";
import Test from "../models/Test.js";
import { ApiError } from "../utils/ApiError.js";

const create = async (linkData) => {
  try {
    const link = await CourseTestLink.create(linkData);
    return await CourseTestLink.findById(link._id)
      .populate("course", "title description")
      .populate("test", "title description durationMinutes questionBank");
  } catch (error) {
    throw new ApiError(500, "Failed to create course test link", error.message);
  }
};

const findById = async (id, populateOptions = {}) => {
  try {
    let query = CourseTestLink.findById(id);
    if (populateOptions.course) {
      query = query.populate("course", populateOptions.course);
    }
    if (populateOptions.test) {
      query = query.populate("test", populateOptions.test);
    }
    return await query;
  } catch (error) {
    throw new ApiError(500, "Failed to fetch course test link", error.message);
  }
};

const findOne = async (filter, populateOptions = {}) => {
  try {
    let query = CourseTestLink.findOne(filter);
    if (populateOptions.course) {
      query = query.populate("course", populateOptions.course);
    }
    if (populateOptions.test) {
      query = query.populate("test", populateOptions.test);
    }
    return await query;
  } catch (error) {
    throw new ApiError(500, "Failed to fetch course test link", error.message);
  }
};

const findAll = async (filter = {}, options = {}) => {
  try {
    const { sortBy = "order", sortOrder = "asc" } = options;
    const sort = { [sortBy]: sortOrder === "asc" ? 1 : -1 };

    return await CourseTestLink.find(filter)
      .populate("test", "title description durationMinutes questionBank")
      .sort(sort);
  } catch (error) {
    throw new ApiError(500, "Failed to fetch course test links", error.message);
  }
};

const updateById = async (id, updateData) => {
  try {
    return await CourseTestLink.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true, runValidators: true }
    )
      .populate("course", "title description")
      .populate("test", "title description durationMinutes questionBank");
  } catch (error) {
    throw new ApiError(500, "Failed to update course test link", error.message);
  }
};

const deleteById = async (id) => {
  try {
    const deleted = await CourseTestLink.findByIdAndDelete(id);
    if (!deleted) {
      throw new ApiError(404, "Link not found");
    }
    return deleted;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(500, "Failed to delete course test link", error.message);
  }
};

const deleteMany = async (filter = {}) => {
  try {
    return await CourseTestLink.deleteMany(filter);
  } catch (error) {
    throw new ApiError(500, "Failed to delete course test links", error.message);
  }
};

// ========== Course Repository Methods ==========
const findCourseById = async (id) => {
  try {
    return await Course.findById(id);
  } catch (error) {
    throw new ApiError(500, "Failed to fetch course", error.message);
  }
};

// ========== Test Repository Methods ==========
const findTestById = async (id) => {
  try {
    return await Test.findById(id);
  } catch (error) {
    throw new ApiError(500, "Failed to fetch test", error.message);
  }
};

export default {
  create,
  findById,
  findOne,
  findAll,
  updateById,
  deleteById,
  findCourseById,
  findTestById,
  deleteMany,
};

