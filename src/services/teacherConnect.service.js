import { ApiError } from "../utils/ApiError.js";
import teacherRepository from "../repository/teacher.repository.js";
import teacherSessionRepository from "../repository/teacherSession.repository.js";
import teacherRatingRepository from "../repository/teacherRating.repository.js";
import walletService from "./wallet.service.js";
import * as teacherWalletLedger from "./teacherWalletLedger.service.js";
import Teacher from "../models/Teacher.js";
import { rejectChatSession, chatConstants } from "./teacherChat.service.js";

const { INSUFFICIENT_REQUEST_MSG, TEACHER_BUSY_MSG } = chatConstants;
const roundMoney = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
const roundDurationMinutes = (value) =>
  Math.round((Number(value) + Number.EPSILON) * 10000) / 10000;

/** Strip phone and email from teacher object for student-facing responses */
const omitContactFromTeacher = (teacher) => {
  const obj = teacher.toObject ? teacher.toObject() : { ...teacher };
  delete obj.phone;
  delete obj.email;
  return obj;
};

/**
 * Get available teachers by subject.
 * Returns all approved teachers (live or not). Each teacher includes isOnline and averageRating.
 * Phone and email are excluded from response.
 */
export const getAvailableTeachers = async (
  subject,
  page = 1,
  limit = 10,
  search,
  presence
) => {
  const baseFilter = {
    status: "approved",
  };

  if (subject) {
    baseFilter.skills = { $in: [new RegExp(subject, "i")] };
  }

  if (search) {
    baseFilter.name = { $regex: search, $options: "i" };
  }

  const filter = { ...baseFilter };
  const p = (presence || "").toString().trim().toLowerCase();
  if (p === "online") {
    filter.isLive = true;
  } else if (p === "offline") {
    filter.isLive = false;
  }

  const options = {
    page,
    limit,
    sortBy: "perMinuteRate",
    sortOrder: "asc",
  };

  const [result, totalOnline] = await Promise.all([
    teacherRepository.findAll(filter, options),
    Teacher.countDocuments({ ...baseFilter, isLive: true }),
  ]);

  const teachers = result.teachers.map((teacher) => ({
    ...omitContactFromTeacher(teacher),
    isOnline: teacher.isLive,
    averageRating: teacher.averageRating ?? 0,
    ratingCount: teacher.ratingCount ?? 0,
  }));

  return {
    teachers,
    pagination: result.pagination,
    totalTeachers: result.pagination.total,
    totalOnline,
  };
};

/**
 * Get a single teacher's details by ID (for students). Only approved teachers. Phone and email excluded.
 */
export const getTeacherById = async (teacherId) => {
  const teacher = await teacherRepository.findById(teacherId);
  if (!teacher) {
    throw new ApiError(404, "Teacher not found");
  }
  if (teacher.status !== "approved") {
    throw new ApiError(404, "Teacher not found");
  }
  const result = {
    ...omitContactFromTeacher(teacher),
    isOnline: teacher.isLive,
    averageRating: teacher.averageRating ?? 0,
    ratingCount: teacher.ratingCount ?? 0,
  };
  return result;
};

/**
 * Initiate a call request (used by socket; same rules as chat request).
 */
export const initiateCallRequest = async (studentId, teacherId, subject) => {
  const teacher = await teacherRepository.findById(teacherId);
  if (!teacher) {
    throw new ApiError(404, "Teacher not found");
  }

  if (teacher.status !== "approved") {
    throw new ApiError(400, "Teacher is not approved");
  }

  if (!teacher.isLive) {
    throw new ApiError(400, "Teacher is not currently live");
  }

  if (teacher.perMinuteRate <= 0) {
    throw new ApiError(400, "Teacher has not set their rate");
  }

  const teacherBusyChat = await teacherSessionRepository.findTeacherActiveChatSession(teacherId);
  if (teacherBusyChat) {
    throw new ApiError(409, TEACHER_BUSY_MSG);
  }

  const teacherBusyCall = await teacherSessionRepository.findTeacherActiveCallSession(teacherId);
  if (teacherBusyCall) {
    throw new ApiError(409, TEACHER_BUSY_MSG);
  }

  const studentBusyChat = await teacherSessionRepository.findStudentOngoingChatSession(studentId);
  if (studentBusyChat) {
    throw new ApiError(400, "You already have an active chat session");
  }

  const studentBusyCall = await teacherSessionRepository.findStudentOngoingCallSession(studentId);
  if (studentBusyCall) {
    throw new ApiError(400, "You already have an active call");
  }

  const ongoingSession = await teacherSessionRepository.findOngoingSession(studentId, teacherId);
  if (ongoingSession) {
    throw new ApiError(400, "You already have an ongoing session with this teacher");
  }

  const existingPending = await teacherSessionRepository.findPendingCallBetween(
    studentId,
    teacherId
  );
  if (existingPending) {
    throw new ApiError(400, "You already have a pending call request with this teacher");
  }

  const wallet = await walletService.getWalletBalance(studentId, "User");
  if (wallet.monetaryBalance < teacher.perMinuteRate) {
    throw new ApiError(400, INSUFFICIENT_REQUEST_MSG);
  }

  const session = await teacherSessionRepository.create({
    student: studentId,
    teacher: teacherId,
    subject: subject || teacher.skills[0] || "General",
    sessionKind: "call",
    perMinuteRate: teacher.perMinuteRate,
    status: "pending",
    initiatedBy: "student",
  });

  return session;
};

/**
 * Accept call request (teacher)
 */
export const acceptCallRequest = async (teacherId, sessionId) => {
  const session = await teacherSessionRepository.findById(sessionId);

  if (!session) {
    throw new ApiError(404, "Session not found");
  }

  if (session.sessionKind === "chat") {
    throw new ApiError(400, "Chat requests must be accepted in the live chat connection");
  }

  if (session.teacher._id.toString() !== teacherId.toString()) {
    throw new ApiError(403, "Unauthorized to accept this session");
  }

  if (session.status !== "pending") {
    throw new ApiError(400, `Session is already ${session.status}`);
  }

  if (session.sessionKind === "call") {
    const teacherBusyChat = await teacherSessionRepository.findTeacherActiveChatSession(teacherId);
    if (teacherBusyChat) {
      throw new ApiError(409, TEACHER_BUSY_MSG);
    }
    const teacherBusyCall = await teacherSessionRepository.findTeacherActiveCallSession(teacherId);
    if (teacherBusyCall && teacherBusyCall._id.toString() !== sessionId.toString()) {
      throw new ApiError(409, TEACHER_BUSY_MSG);
    }

    const wallet = await walletService.getWalletBalance(session.student._id, "User");
    if (wallet.monetaryBalance < session.perMinuteRate) {
      await teacherSessionRepository.updateById(sessionId, {
        status: "cancelled",
        rejectedAt: new Date(),
        rejectionReason: INSUFFICIENT_REQUEST_MSG,
        sessionEndReason: "insufficient_balance_at_accept",
        callEndTime: new Date(),
      });
      throw new ApiError(400, INSUFFICIENT_REQUEST_MSG);
    }
  }

  const updatedSession = await teacherSessionRepository.updateById(sessionId, {
    status: "accepted",
    acceptedAt: new Date(),
  });

  return updatedSession;
};

/**
 * Reject call request (teacher)
 */
export const rejectCallRequest = async (teacherId, sessionId, reason) => {
  const session = await teacherSessionRepository.findById(sessionId);

  if (!session) {
    throw new ApiError(404, "Session not found");
  }

  if (session.teacher._id.toString() !== teacherId.toString()) {
    throw new ApiError(403, "Unauthorized to reject this session");
  }

  if (session.status !== "pending") {
    throw new ApiError(400, `Session is already ${session.status}`);
  }

  if (session.sessionKind === "chat") {
    return await rejectChatSession(teacherId, sessionId, reason);
  }

  const updatedSession = await teacherSessionRepository.updateById(sessionId, {
    status: "rejected",
    rejectedAt: new Date(),
    rejectionReason: reason || "Teacher declined the call",
  });

  return updatedSession;
};

/**
 * Start billing for an Agora RTC session (clients join via POST .../agora-token, then call this when ready).
 */
export const startCall = async (sessionId) => {
  const session = await teacherSessionRepository.findById(sessionId);

  if (!session) {
    throw new ApiError(404, "Session not found");
  }

  if (session.sessionKind === "chat") {
    throw new ApiError(400, "Chat sessions start automatically when accepted in chat");
  }

  if (session.status !== "accepted") {
    throw new ApiError(400, "Session must be accepted before starting");
  }

  const updatedSession = await teacherSessionRepository.updateById(sessionId, {
    status: "ongoing",
    callStartTime: new Date(),
  });

  return updatedSession;
};

/**
 * End call and process billing
 */
export const endCall = async (sessionId, durationMinutes, recordingUrl = null, agoraRecordingId = null) => {
  const session = await teacherSessionRepository.findById(sessionId);

  if (!session) {
    throw new ApiError(404, "Session not found");
  }

  if (session.sessionKind === "chat") {
    throw new ApiError(400, "End chat sessions through the chat connection");
  }

  if (session.status !== "ongoing") {
    throw new ApiError(400, "Session is not ongoing");
  }

  const elapsedMinutes =
    typeof durationMinutes === "number" && durationMinutes > 0 && Number.isFinite(durationMinutes)
      ? durationMinutes
      : session.callStartTime
        ? Math.max(
            1 / 60,
            (Date.now() - new Date(session.callStartTime).getTime()) / 60000
          )
        : 1;
  const billableMinutes = roundDurationMinutes(elapsedMinutes);
  const totalAmount = roundMoney(billableMinutes * session.perMinuteRate);

  if (!session.amountDeducted) {
    const wallet = await walletService.getWalletBalance(session.student._id, "User");
    if (wallet.monetaryBalance < totalAmount) {
      throw new ApiError(400, "Insufficient balance");
    }
  }

  // Atomically claim completion so duplicate end/disconnect events cannot credit twice.
  const updatedSession = await teacherSessionRepository.completeOngoingSession(sessionId, {
    status: "completed",
    callEndTime: new Date(),
    durationMinutes: billableMinutes,
    totalAmount,
    amountDeducted: true,
    recordingUrl,
    agoraRecordingId,
  });

  if (!updatedSession) {
    return await teacherSessionRepository.findById(sessionId);
  }

  if (!session.amountDeducted) {
    await walletService.deductMonetaryBalance(
      session.student._id,
      totalAmount,
      "User"
    );
  }

  const teacherId = session.teacher._id || session.teacher;
  if (totalAmount > 0) {
    await walletService.addMonetaryBalance(
      teacherId,
      totalAmount,
      `agora_session_${sessionId}`,
      "Teacher"
    );
    const bal = await walletService.getWalletBalance(teacherId, "Teacher");
    await teacherWalletLedger
      .recordSessionEarning({
        teacherId,
        amount: totalAmount,
        balanceAfter: bal.monetaryBalance,
        sessionId: updatedSession._id,
        sessionKind: "agora_call",
      })
      .catch((e) => console.error("teacherWalletLedger recordSessionEarning:", e));
  }

  return updatedSession;
};

/**
 * Student disconnects before teacher accepts (same pattern as chat).
 */
export const cancelPendingCallRequestByStudent = async (studentId, sessionId) => {
  const session = await teacherSessionRepository.findById(sessionId);
  if (!session || session.sessionKind !== "call") {
    return null;
  }
  if (session.student._id.toString() !== studentId.toString()) {
    throw new ApiError(403, "Unauthorized to cancel this call request");
  }
  if (session.status !== "pending") {
    return null;
  }
  return await teacherSessionRepository.updateById(sessionId, {
    status: "cancelled",
    rejectedAt: new Date(),
    rejectionReason: "Student left before the call started",
    callEndTime: new Date(),
    sessionEndReason: "student_withdrew_before_accept",
  });
};

/**
 * Cancel call request (student)
 */
export const cancelCallRequest = async (studentId, sessionId) => {
  const session = await teacherSessionRepository.findById(sessionId);

  if (!session) {
    throw new ApiError(404, "Session not found");
  }

  if (session.student._id.toString() !== studentId.toString()) {
    throw new ApiError(403, "Unauthorized to cancel this session");
  }

  if (!["pending", "accepted"].includes(session.status)) {
    throw new ApiError(400, `Cannot cancel session with status: ${session.status}`);
  }

  const updatedSession = await teacherSessionRepository.updateById(sessionId, {
    status: "cancelled",
  });

  return updatedSession;
};

/**
 * Get student's call history
 */
export const getStudentCallHistory = async (studentId, page = 1, limit = 10, status = null) => {
  return await teacherSessionRepository.findStudentSessions(studentId, {
    page,
    limit,
    status,
  });
};

/**
 * Get student's call recordings
 */
export const getStudentRecordings = async (studentId, page = 1, limit = 10) => {
  const result = await teacherSessionRepository.findStudentSessions(studentId, {
    page,
    limit,
    status: "completed",
  });

  // Filter only sessions with recordings
  const sessionsWithRecordings = result.sessions.filter(
    (session) => session.recordingUrl
  );

  return {
    recordings: sessionsWithRecordings,
    pagination: result.pagination,
  };
};

/**
 * Get teacher's pending requests
 */
export const getTeacherPendingRequests = async (teacherId) => {
  return await teacherSessionRepository.findPendingRequests(teacherId);
};

/**
 * Get teacher's session history
 * @param {string|null} search - optional: student name/email, subject, status text, or "chat"/"call"
 */
export const getTeacherSessionHistory = async (
  teacherId,
  page = 1,
  limit = 10,
  status = null,
  search = null
) => {
  return await teacherSessionRepository.findTeacherSessions(teacherId, {
    page,
    limit,
    status,
    search,
  });
};

/**
 * Remove a session from the teacher's history (and DB). Own sessions only.
 * Active (ongoing) sessions must be ended first.
 */
export const deleteTeacherSession = async (teacherId, sessionId) => {
  const session = await teacherSessionRepository.findById(sessionId);

  if (!session) {
    throw new ApiError(404, "Session not found");
  }

  if (session.teacher._id.toString() !== teacherId.toString()) {
    throw new ApiError(403, "Unauthorized to delete this session");
  }

  if (session.status === "ongoing") {
    throw new ApiError(
      400,
      "Cannot delete an active session. End the call or chat first."
    );
  }

  await teacherSessionRepository.deleteById(sessionId);
  return { deleted: true, sessionId: session._id.toString() };
};

/**
 * Get teacher's earnings
 */
export const getTeacherEarnings = async (teacherId, startDate = null, endDate = null) => {
  return await teacherSessionRepository.calculateTeacherEarnings(teacherId, startDate, endDate);
};

/**
 * Dashboard: income, today's talk time, completed session counts, rating, recent sessions.
 */
export const getTeacherDashboard = async (teacherId) => {
  const teacher = await teacherRepository.findById(teacherId);
  if (!teacher) {
    throw new ApiError(404, "Teacher not found");
  }

  const [stats, history] = await Promise.all([
    teacherSessionRepository.getTeacherDashboardSessionAggregates(teacherId),
    teacherSessionRepository.findTeacherSessions(teacherId, { page: 1, limit: 3 }),
  ]);

  return {
    totalIncome: stats.totalIncome,
    todayTalktimeMinutes: stats.todayTalktimeMinutes,
    totalCompletedSessions: stats.totalCompletedSessions,
    rating: {
      averageRating: teacher.averageRating ?? 0,
      ratingCount: teacher.ratingCount ?? 0,
    },
    recentSessions: history.sessions,
  };
};

/**
 * Rate a teacher (1-5). Replaces previous rating if student already rated. Auto-updates teacher's averageRating.
 */
export const rateTeacher = async (teacherId, studentId, rating) => {
  const teacher = await teacherRepository.findById(teacherId);
  if (!teacher) {
    throw new ApiError(404, "Teacher not found");
  }
  if (teacher.status !== "approved") {
    throw new ApiError(400, "Cannot rate a teacher who is not approved");
  }

  await teacherRatingRepository.upsert(teacherId, studentId, rating);
  const { averageRating, ratingCount } = await teacherRatingRepository.getAggregationForTeacher(
    teacherId
  );
  await teacherRatingRepository.updateTeacherRatingFields(teacherId, averageRating, ratingCount);

  return { averageRating, ratingCount };
};

export default {
  getAvailableTeachers,
  getTeacherById,
  initiateCallRequest,
  acceptCallRequest,
  rejectCallRequest,
  startCall,
  endCall,
  cancelPendingCallRequestByStudent,
  cancelCallRequest,
  getStudentCallHistory,
  getStudentRecordings,
  getTeacherPendingRequests,
  getTeacherSessionHistory,
  deleteTeacherSession,
  getTeacherEarnings,
  getTeacherDashboard,
  rateTeacher,
};

