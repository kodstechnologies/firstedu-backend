import ChallengeYourselfProgress from "../models/ChallengeYourselfProgress.js";
import { ApiError } from "../utils/ApiError.js";

const findOne = async (filter) => {
  try {
    return await ChallengeYourselfProgress.findOne(filter).lean();
  } catch (error) {
    throw new ApiError(500, "Failed to find challenge-yourself progress", error.message);
  }
};

const findByStudent = async (studentId) => {
  try {
    return await ChallengeYourselfProgress.find({ student: studentId }).lean();
  } catch (error) {
    throw new ApiError(500, "Failed to find progress", error.message);
  }
};

const upsert = async (studentId, stage, level, data = {}) => {
  try {
    const filter = data.stageId
      ? { student: studentId, stageId: data.stageId, level }
      : { student: studentId, stage, level };
    return await ChallengeYourselfProgress.findOneAndUpdate(
      filter,
      { $set: { ...data, stage, level } },
      { new: true, upsert: true, runValidators: true }
    );
  } catch (error) {
    throw new ApiError(500, "Failed to save challenge-yourself progress", error.message);
  }
};

export default {
  findOne,
  findByStudent,
  upsert,
};
