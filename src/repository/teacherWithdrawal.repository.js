import TeacherWithdrawalRequest from "../models/TeacherWithdrawalRequest.js";
import { ApiError } from "../utils/ApiError.js";

const create = async (data) => {
  try {
    return await TeacherWithdrawalRequest.create(data);
  } catch (error) {
    if (error.code === 11000) {
      throw new ApiError(400, "You already have a pending withdrawal request");
    }
    throw new ApiError(500, "Failed to create withdrawal request", error.message);
  }
};

const findById = async (id) => {
  try {
    return await TeacherWithdrawalRequest.findById(id);
  } catch (error) {
    throw new ApiError(500, "Failed to fetch withdrawal request", error.message);
  }
};

const findByIdPopulated = async (id) => {
  try {
    return await TeacherWithdrawalRequest.findById(id).populate({
      path: "teacher",
      select:
        "-password -refreshToken -passwordResetOTP -passwordResetOTPExpires",
    });
  } catch (error) {
    throw new ApiError(500, "Failed to fetch withdrawal request", error.message);
  }
};

const findByTeacherId = async (teacherId) => {
  try {
    return await TeacherWithdrawalRequest.findOne({ teacher: teacherId });
  } catch (error) {
    throw new ApiError(500, "Failed to fetch withdrawal request", error.message);
  }
};

const findAllPending = async ({ page = 1, limit = 20 } = {}) => {
  try {
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const [requests, total] = await Promise.all([
      TeacherWithdrawalRequest.find()
        .populate({
          path: "teacher",
          select:
            "name email phone gender profileImage bankDetails perMinuteRate status averageRating createdAt",
        })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum),
      TeacherWithdrawalRequest.countDocuments(),
    ]);

    return {
      requests,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum) || 1,
      },
    };
  } catch (error) {
    throw new ApiError(500, "Failed to list withdrawal requests", error.message);
  }
};

const deleteById = async (id) => {
  try {
    return await TeacherWithdrawalRequest.findByIdAndDelete(id);
  } catch (error) {
    throw new ApiError(500, "Failed to delete withdrawal request", error.message);
  }
};

export default {
  create,
  findById,
  findByIdPopulated,
  findByTeacherId,
  findAllPending,
  deleteById,
};
