import Teacher from "../models/Teacher.js";
import { ApiError } from "../utils/ApiError.js";

const create = async (teacherData) => {
  try {
    const existingTeacher = await Teacher.findOne({ email: teacherData.email });
    if (existingTeacher) {
      throw new ApiError(409, "Teacher with this email already exists");
    }
    const teacher = await Teacher.create(teacherData);
    return await Teacher.findById(teacher._id).select(
      "-password -refreshToken -passwordResetOTP -passwordResetOTPExpires"
    );
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(500, "Failed to create teacher", error.message);
  }
};

const findOne = async (filter, includePassword = false) => {
  try {
    let query = Teacher.findOne(filter);
    if (!includePassword) {
      query = query.select("-password -refreshToken -passwordResetOTP -passwordResetOTPExpires");
    }
    return await query;
  } catch (error) {
    throw new ApiError(500, "Failed to fetch teacher", error.message);
  }
};

const findById = async (teacherId, includePassword = false) => {
  try {
    let query = Teacher.findById(teacherId);
    if (!includePassword) {
      query = query.select("-password -refreshToken -passwordResetOTP -passwordResetOTPExpires");
    }
    return await query;
  } catch (error) {
    throw new ApiError(500, "Failed to fetch teacher", error.message);
  }
};

const findAll = async (filter = {}, options = {}) => {
  try {
    const {
      page = 1,
      limit = 10,
      search,
      status,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = options;

    const query = { ...filter };

    if (status) {
      query.status = status;
    }

    if (search) {
      const regex = { $regex: search, $options: "i" };
      query.$or = [
        { name: regex },
        { email: regex },
        { phone: regex },
        { about: regex },
        { skills: regex },
      ];
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;
    const sort = { [sortBy]: sortOrder === "desc" ? -1 : 1 };

    const [teachers, total] = await Promise.all([
      Teacher.find(query)
        .select("-password -refreshToken -passwordResetOTP -passwordResetOTPExpires")
        .sort(sort)
        .skip(skip)
        .limit(limitNum),
      Teacher.countDocuments(query),
    ]);

    return {
      teachers,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum) || 1,
      },
    };
  } catch (error) {
    throw new ApiError(500, "Failed to fetch teachers", error.message);
  }
};

const updateById = async (teacherId, updateData) => {
  try {
    return await Teacher.findByIdAndUpdate(
      teacherId,
      { $set: updateData },
      { new: true, runValidators: true }
    ).select("-password -refreshToken -passwordResetOTP -passwordResetOTPExpires");
  } catch (error) {
    throw new ApiError(500, "Failed to update teacher", error.message);
  }
};

const deleteById = async (teacherId) => {
  try {
    const deleted = await Teacher.findByIdAndDelete(teacherId);
    if (!deleted) {
      throw new ApiError(404, "Teacher not found");
    }
    return deleted;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(500, "Failed to delete teacher", error.message);
  }
};

const save = async (teacher) => {
  try {
    return await teacher.save();
  } catch (error) {
    throw new ApiError(500, "Failed to save teacher", error.message);
  }
};

export default {
  create,
  findOne,
  findById,
  findAll,
  updateById,
  deleteById,
  save,
};

