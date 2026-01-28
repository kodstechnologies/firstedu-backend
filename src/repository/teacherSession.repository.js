import TeacherSession from "../models/TeacherSession.js";
import { ApiError } from "../utils/ApiError.js";

const create = async (sessionData) => {
  try {
    const session = await TeacherSession.create(sessionData);
    return await TeacherSession.findById(session._id)
      .populate("student", "name email")
      .populate("teacher", "name email skills perMinuteRate");
  } catch (error) {
    throw new ApiError(500, "Failed to create teacher session", error.message);
  }
};

const findById = async (sessionId) => {
  try {
    return await TeacherSession.findById(sessionId)
      .populate("student", "name email")
      .populate("teacher", "name email skills perMinuteRate");
  } catch (error) {
    throw new ApiError(500, "Failed to fetch session", error.message);
  }
};

const findOne = async (filter) => {
  try {
    return await TeacherSession.findOne(filter)
      .populate("student", "name email")
      .populate("teacher", "name email skills perMinuteRate");
  } catch (error) {
    throw new ApiError(500, "Failed to fetch session", error.message);
  }
};

const updateById = async (sessionId, updateData) => {
  try {
    return await TeacherSession.findByIdAndUpdate(
      sessionId,
      { $set: updateData },
      { new: true, runValidators: true }
    )
      .populate("student", "name email")
      .populate("teacher", "name email skills perMinuteRate");
  } catch (error) {
    throw new ApiError(500, "Failed to update session", error.message);
  }
};

const findStudentSessions = async (studentId, options = {}) => {
  try {
    const {
      page = 1,
      limit = 10,
      status,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = options;

    const query = { student: studentId };
    if (status) {
      query.status = status;
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;
    const sort = { [sortBy]: sortOrder === "desc" ? -1 : 1 };

    const [sessions, total] = await Promise.all([
      TeacherSession.find(query)
        .populate("teacher", "name email skills perMinuteRate")
        .sort(sort)
        .skip(skip)
        .limit(limitNum),
      TeacherSession.countDocuments(query),
    ]);

    return {
      sessions,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum) || 1,
      },
    };
  } catch (error) {
    throw new ApiError(500, "Failed to fetch student sessions", error.message);
  }
};

const findTeacherSessions = async (teacherId, options = {}) => {
  try {
    const {
      page = 1,
      limit = 10,
      status,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = options;

    const query = { teacher: teacherId };
    if (status) {
      query.status = status;
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;
    const sort = { [sortBy]: sortOrder === "desc" ? -1 : 1 };

    const [sessions, total] = await Promise.all([
      TeacherSession.find(query)
        .populate("student", "name email")
        .sort(sort)
        .skip(skip)
        .limit(limitNum),
      TeacherSession.countDocuments(query),
    ]);

    return {
      sessions,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum) || 1,
      },
    };
  } catch (error) {
    throw new ApiError(500, "Failed to fetch teacher sessions", error.message);
  }
};

const findPendingRequests = async (teacherId) => {
  try {
    return await TeacherSession.find({
      teacher: teacherId,
      status: "pending",
    })
      .populate("student", "name email")
      .sort({ createdAt: -1 });
  } catch (error) {
    throw new ApiError(500, "Failed to fetch pending requests", error.message);
  }
};

const findOngoingSession = async (studentId, teacherId) => {
  try {
    return await TeacherSession.findOne({
      student: studentId,
      teacher: teacherId,
      status: "ongoing",
    });
  } catch (error) {
    throw new ApiError(500, "Failed to fetch ongoing session", error.message);
  }
};

const calculateTeacherEarnings = async (teacherId, startDate, endDate) => {
  try {
    const query = {
      teacher: teacherId,
      status: "completed",
      amountDeducted: true,
    };

    if (startDate || endDate) {
      query.callEndTime = {};
      if (startDate) query.callEndTime.$gte = new Date(startDate);
      if (endDate) query.callEndTime.$lte = new Date(endDate);
    }

    const sessions = await TeacherSession.find(query);
    const totalEarnings = sessions.reduce((sum, session) => sum + session.totalAmount, 0);
    const totalSessions = sessions.length;
    const totalMinutes = sessions.reduce((sum, session) => sum + session.durationMinutes, 0);

    return {
      totalEarnings,
      totalSessions,
      totalMinutes,
      averageEarningPerSession: totalSessions > 0 ? totalEarnings / totalSessions : 0,
    };
  } catch (error) {
    throw new ApiError(500, "Failed to calculate earnings", error.message);
  }
};

export default {
  create,
  findById,
  findOne,
  updateById,
  findStudentSessions,
  findTeacherSessions,
  findPendingRequests,
  findOngoingSession,
  calculateTeacherEarnings,
};

