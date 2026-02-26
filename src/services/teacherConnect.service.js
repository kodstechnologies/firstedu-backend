import { ApiError } from "../utils/ApiError.js";
import teacherRepository from "../repository/teacher.repository.js";
import teacherSessionRepository from "../repository/teacherSession.repository.js";
import teacherRatingRepository from "../repository/teacherRating.repository.js";
import walletService from "./wallet.service.js";
import Teacher from "../models/Teacher.js";

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
export const getAvailableTeachers = async (subject, page = 1, limit = 10) => {
  const filter = {
    status: "approved",
  };

  if (subject) {
    filter.skills = { $in: [new RegExp(subject, "i")] };
  }

  const options = {
    page,
    limit,
    sortBy: "perMinuteRate",
    sortOrder: "asc",
  };

  const [result, totalOnline] = await Promise.all([
    teacherRepository.findAll(filter, options),
    Teacher.countDocuments({ ...filter, isLive: true }),
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
 * Initiate a call request to a teacher
 */
export const initiateCallRequest = async (studentId, teacherId, subject) => {
  // Check if teacher exists and is approved
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

  // Check if there's already an ongoing session
  const ongoingSession = await teacherSessionRepository.findOngoingSession(
    studentId,
    teacherId
  );
  if (ongoingSession) {
    throw new ApiError(400, "You already have an ongoing session with this teacher");
  }

  // Check wallet balance (estimate for 1 minute minimum)
  const wallet = await walletService.getWalletBalance(studentId, "User");
  if (wallet.monetaryBalance < teacher.perMinuteRate) {
    throw new ApiError(400, "Insufficient wallet balance");
  }

  // Create session request
  const session = await teacherSessionRepository.create({
    student: studentId,
    teacher: teacherId,
    subject: subject || teacher.skills[0] || "General",
    perMinuteRate: teacher.perMinuteRate,
    status: "pending",
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

  if (session.teacher._id.toString() !== teacherId.toString()) {
    throw new ApiError(403, "Unauthorized to accept this session");
  }

  if (session.status !== "pending") {
    throw new ApiError(400, `Session is already ${session.status}`);
  }

  // Update session status
  const updatedSession = await teacherSessionRepository.updateById(sessionId, {
    status: "accepted",
    acceptedAt: new Date(),
  });

  // TODO: Integrate Twilio here to initiate the call
  // For now, we'll just mark it as accepted
  // When Twilio is integrated, you'll:
  // 1. Create a Twilio call
  // 2. Store twilioCallSid
  // 3. Set status to "ongoing"
  // 4. Set callStartTime

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

  const updatedSession = await teacherSessionRepository.updateById(sessionId, {
    status: "rejected",
    rejectedAt: new Date(),
    rejectionReason: reason || "Teacher declined the call",
  });

  return updatedSession;
};

/**
 * Start call (when Twilio call is connected)
 */
export const startCall = async (sessionId, twilioCallSid) => {
  const session = await teacherSessionRepository.findById(sessionId);

  if (!session) {
    throw new ApiError(404, "Session not found");
  }

  if (session.status !== "accepted") {
    throw new ApiError(400, "Session must be accepted before starting");
  }

  const updatedSession = await teacherSessionRepository.updateById(sessionId, {
    status: "ongoing",
    twilioCallSid,
    callStartTime: new Date(),
  });

  return updatedSession;
};

/**
 * End call and process billing
 */
export const endCall = async (sessionId, durationMinutes, recordingUrl = null, recordingSid = null) => {
  const session = await teacherSessionRepository.findById(sessionId);

  if (!session) {
    throw new ApiError(404, "Session not found");
  }

  if (session.status !== "ongoing") {
    throw new ApiError(400, "Session is not ongoing");
  }

  // Calculate total amount
  const totalAmount = Math.ceil(durationMinutes * session.perMinuteRate);

  // Deduct from student wallet
  if (!session.amountDeducted) {
    await walletService.deductMonetaryBalance(
      session.student._id,
      totalAmount,
      "User"
    );
  }

  // Update session
  const updatedSession = await teacherSessionRepository.updateById(sessionId, {
    status: "completed",
    callEndTime: new Date(),
    durationMinutes: Math.ceil(durationMinutes),
    totalAmount,
    amountDeducted: true,
    recordingUrl,
    recordingSid,
  });

  return updatedSession;
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
 */
export const getTeacherSessionHistory = async (teacherId, page = 1, limit = 10, status = null) => {
  return await teacherSessionRepository.findTeacherSessions(teacherId, {
    page,
    limit,
    status,
  });
};

/**
 * Get teacher's earnings
 */
export const getTeacherEarnings = async (teacherId, startDate = null, endDate = null) => {
  return await teacherSessionRepository.calculateTeacherEarnings(teacherId, startDate, endDate);
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
  cancelCallRequest,
  getStudentCallHistory,
  getStudentRecordings,
  getTeacherPendingRequests,
  getTeacherSessionHistory,
  getTeacherEarnings,
  rateTeacher,
};

