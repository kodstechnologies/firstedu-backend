import StudentSession from "../models/StudentSession.js";
import { ApiError } from "../utils/ApiError.js";

const create = async (data) => {
  try {
    const session = await StudentSession.create(data);
    return session;
  } catch (error) {
    throw new ApiError(500, "Failed to create session", error.message);
  }
};

const findByStudentId = async (studentId) => {
  try {
    return await StudentSession.findOne({ student: studentId });
  } catch (error) {
    throw new ApiError(500, "Failed to find session", error.message);
  }
};

const findByRefreshToken = async (refreshToken) => {
  try {
    return await StudentSession.findOne({ refreshToken });
  } catch (error) {
    throw new ApiError(500, "Failed to find session", error.message);
  }
};

/**
 * Get sessions for multiple students (e.g. for bulk FCM). Returns map of studentId -> session.
 */
const findByStudentIds = async (studentIds) => {
  try {
    const sessions = await StudentSession.find({
      student: { $in: studentIds },
    }).lean();
    const map = new Map();
    sessions.forEach((s) => map.set(s.student.toString(), s));
    return map;
  } catch (error) {
    throw new ApiError(500, "Failed to find sessions", error.message);
  }
};

const deleteByStudentId = async (studentId) => {
  try {
    const result = await StudentSession.deleteMany({ student: studentId });
    return result;
  } catch (error) {
    throw new ApiError(500, "Failed to delete session", error.message);
  }
};

const deleteById = async (sessionId) => {
  try {
    const session = await StudentSession.findByIdAndDelete(sessionId);
    return session;
  } catch (error) {
    throw new ApiError(500, "Failed to delete session", error.message);
  }
};

const updateFcmToken = async (studentId, fcmToken) => {
  try {
    const session = await StudentSession.findOneAndUpdate(
      { student: studentId },
      { $set: { fcmToken: fcmToken || null, lastActiveAt: new Date() } },
      { new: true }
    );
    if (!session) {
      throw new ApiError(404, "No active session. Please login again.");
    }
    return session;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(500, "Failed to update session FCM token", error.message);
  }
};

const updateLastActive = async (studentId) => {
  try {
    await StudentSession.findOneAndUpdate(
      { student: studentId },
      { $set: { lastActiveAt: new Date() } }
    );
  } catch (error) {
    // Non-critical
  }
};

export default {
  create,
  findByStudentId,
  findByRefreshToken,
  findByStudentIds,
  deleteByStudentId,
  deleteById,
  updateFcmToken,
  updateLastActive,
};
