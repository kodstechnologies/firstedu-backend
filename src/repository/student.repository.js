import User from "../models/Student.js";
import { ApiError } from "../utils/ApiError.js";

const create = async (studentData) => {
  try {
    const existingStudent = await User.findOne({ email: studentData.email });
    if (existingStudent) {
      throw new ApiError(409, "Student with this email already exists");
    }
    const student = await User.create(studentData);
    return await User.findById(student._id).select("-password -refreshToken");
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(500, "Failed to create student", error.message);
  }
};

const findOne = async (filter, includePassword = false) => {
  try {
    let query = User.findOne(filter);
    if (!includePassword) {
      query = query.select("-password -refreshToken -passwordResetOTP -passwordResetOTPExpires");
    }
    return await query;
  } catch (error) {
    throw new ApiError(500, "Failed to fetch student", error.message);
  }
};

const findById = async (userId, includePassword = false) => {
  try {
    let query = User.findById(userId);
    if (!includePassword) {
      query = query.select("-password -refreshToken -passwordResetOTP -passwordResetOTPExpires");
    }
    return await query;
  } catch (err) {
    throw new ApiError(500, err.message || "Failed to fetch user by ID");
  }
};

const findAll = async (filter = {}, options = {}) => {
  try {
    const {
      page = 1,
      limit = 10,
      search,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = options;

    const query = { ...filter };

    if (search) {
      const regex = { $regex: search, $options: "i" };
      query.$or = [{ name: regex }, { email: regex }, { phone: regex }];
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;
    const sort = { [sortBy]: sortOrder === "desc" ? -1 : 1 };

    const [students, total] = await Promise.all([
      User.find(query)
        .select("-password -refreshToken -passwordResetOTP -passwordResetOTPExpires")
        .sort(sort)
        .skip(skip)
        .limit(limitNum),
      User.countDocuments(query),
    ]);

    return {
      students,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum) || 1,
      },
    };
  } catch (error) {
    throw new ApiError(500, "Failed to fetch students", error.message);
  }
};

const updateById = async (userId, updateData) => {
  try {
    return await User.findByIdAndUpdate(userId, updateData, { new: true });
  } catch (err) {
    throw new ApiError(500, err.message || "Failed to update user");
  }
};

const save = async (student) => {
  try {
    return await student.save();
  } catch (error) {
    throw new ApiError(500, "Failed to save student", error.message);
  }
};

export default {
  create,
  findOne,
  findById,
  findAll,
  updateById,
  save,
};
