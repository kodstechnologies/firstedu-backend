import TeacherSession from "../models/TeacherSession.js";
import User from "../models/Student.js";
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
      search,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = options;

    const match = { teacher: teacherId };
    if (status) {
      match.status = status;
    }

    const searchTrim = typeof search === "string" ? search.trim() : "";
    let finalQuery = match;
    if (searchTrim) {
      const esc = searchTrim.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const rx = new RegExp(esc, "i");
      const matchingStudents = await User.find({
        $or: [{ name: rx }, { email: rx }],
      })
        .select("_id")
        .lean();
      const studentIds = matchingStudents.map((s) => s._id);
      const orConditions = [
        { subject: rx },
        { status: rx },
        { sessionKind: rx },
      ];
      if (studentIds.length > 0) {
        orConditions.push({ student: { $in: studentIds } });
      }
      finalQuery = { $and: [match, { $or: orConditions }] };
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;
    const sort = { [sortBy]: sortOrder === "desc" ? -1 : 1 };

    const [sessions, total] = await Promise.all([
      TeacherSession.find(finalQuery)
        .populate("student", "name email")
        .sort(sort)
        .skip(skip)
        .limit(limitNum),
      TeacherSession.countDocuments(finalQuery),
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

const deleteById = async (sessionId) => {
  try {
    return await TeacherSession.findByIdAndDelete(sessionId);
  } catch (error) {
    throw new ApiError(500, "Failed to delete session", error.message);
  }
};

/** Teacher is in an active chat session (billing / messaging). */
const findTeacherActiveChatSession = async (teacherId) => {
  try {
    return await TeacherSession.findOne({
      teacher: teacherId,
      sessionKind: "chat",
      status: "ongoing",
    });
  } catch (error) {
    throw new ApiError(500, "Failed to fetch teacher chat session", error.message);
  }
};

const findStudentOngoingChatSession = async (studentId) => {
  try {
    return await TeacherSession.findOne({
      student: studentId,
      sessionKind: "chat",
      status: "ongoing",
    });
  } catch (error) {
    throw new ApiError(500, "Failed to fetch student chat session", error.message);
  }
};

const findPendingChatBetween = async (studentId, teacherId) => {
  try {
    return await TeacherSession.findOne({
      student: studentId,
      teacher: teacherId,
      sessionKind: "chat",
      status: "pending",
    });
  } catch (error) {
    throw new ApiError(500, "Failed to fetch pending chat", error.message);
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
  deleteById,
  findStudentSessions,
  findTeacherSessions,
  findPendingRequests,
  findOngoingSession,
  findTeacherActiveChatSession,
  findStudentOngoingChatSession,
  findPendingChatBetween,
  calculateTeacherEarnings,
};

