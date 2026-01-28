import { ApiError } from "../utils/ApiError.js";
import teacherRepository from "../repository/teacher.repository.js";
import teacherSessionRepository from "../repository/teacherSession.repository.js";
import walletService from "./wallet.service.js";

/**
 * Get available teachers by subject
 */
export const getAvailableTeachers = async (subject, page = 1, limit = 10) => {
  const filter = {
    status: "approved",
    isLive: true,
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

  const result = await teacherRepository.findAll(filter, options);

  // Add live status indicator
  const teachers = result.teachers.map((teacher) => ({
    ...teacher.toObject(),
    isOnline: teacher.isLive,
  }));

  return {
    teachers,
    pagination: result.pagination,
  };
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

export default {
  getAvailableTeachers,
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
};

