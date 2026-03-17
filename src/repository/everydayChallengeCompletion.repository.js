import EverydayChallengeCompletion from "../models/EverydayChallengeCompletion.js";
import { ApiError } from "../utils/ApiError.js";

const create = async (data) => {
  try {
    return await EverydayChallengeCompletion.create(data);
  } catch (error) {
    throw new ApiError(500, "Failed to create everyday challenge completion", error.message);
  }
};

const findOne = async (filter) => {
  try {
    return await EverydayChallengeCompletion.findOne(filter);
  } catch (error) {
    throw new ApiError(500, "Failed to find everyday challenge completion", error.message);
  }
};

const findLatestByStudent = async (studentId, limit = 10) => {
  try {
    return await EverydayChallengeCompletion.find({ student: studentId })
      .sort({ date: -1 })
      .limit(limit)
      .lean();
  } catch (error) {
    throw new ApiError(500, "Failed to find completions", error.message);
  }
};

export default {
  create,
  findOne,
  findLatestByStudent,
};
