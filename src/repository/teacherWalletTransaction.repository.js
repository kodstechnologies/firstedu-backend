import TeacherWalletTransaction from "../models/TeacherWalletTransaction.js";
import { ApiError } from "../utils/ApiError.js";

const create = async (data) => {
  try {
    return await TeacherWalletTransaction.create(data);
  } catch (error) {
    throw new ApiError(500, "Failed to record wallet transaction", error.message);
  }
};

const findByTeacher = async (teacherId, { page = 1, limit = 20 } = {}) => {
  try {
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const [items, total] = await Promise.all([
      TeacherWalletTransaction.find({ teacher: teacherId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      TeacherWalletTransaction.countDocuments({ teacher: teacherId }),
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
    throw new ApiError(500, "Failed to fetch wallet transactions", error.message);
  }
};

export default {
  create,
  findByTeacher,
};
