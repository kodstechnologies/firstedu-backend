import { ApiError } from "../utils/ApiError.js";
import teacherRepository from "../repository/teacher.repository.js";
import teacherSessionRepository from "../repository/teacherSession.repository.js";
import walletService from "./wallet.service.js";
import * as teacherWalletLedger from "./teacherWalletLedger.service.js";
import studentSessionRepository from "../repository/studentSession.repository.js";
import { sendNotificationToDevice } from "./fcm.service.js";
import * as notificationService from "./notification.service.js";
import {
  buildSessionRateSnapshot,
  perSecondFromPerMinute,
  roundDurationMinutes,
  roundMoney,
} from "./platformFee.service.js";

const INSUFFICIENT_REQUEST_MSG =
  "Insufficient wallet balance to start a chat. Please recharge your wallet.";
const TEACHER_BUSY_MSG =
  "This teacher is already in a chat. Please try again later.";

export async function getStudentFcmToken(studentId) {
  const session = await studentSessionRepository.findByStudentId(studentId);
  return session?.fcmToken?.trim() || null;
}

export async function notifyStudentDevices(studentId, title, body, data = {}) {
  const token = await getStudentFcmToken(studentId);
  if (!token) return;
  try {
    await sendNotificationToDevice(token, title, body, {
      ...data,
      audience: "student",
    });
  } catch (err) {
    console.error("FCM student notify failed:", err.message);
  }
}

export async function notifyTeacherDevice(teacherDoc, title, body, data = {}) {
  if (teacherDoc?._id) {
    try {
      await notificationService.sendNotificationToTeacher(
        teacherDoc._id,
        title,
        body,
        { ...data },
        null
      );
    } catch (err) {
      console.error("Send teacher notification failed:", err.message);
    }
  }
}

/**
 * Student initiates a chat request (socket will deliver to online teacher).
 */
export async function initiateChatRequest(studentId, teacherId, subject) {
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

  const teacherBusy = await teacherSessionRepository.findTeacherActiveChatSession(teacherId);
  if (teacherBusy) {
    throw new ApiError(409, TEACHER_BUSY_MSG);
  }

  const studentBusy = await teacherSessionRepository.findStudentOngoingChatSession(studentId);
  if (studentBusy) {
    throw new ApiError(400, "You already have an active chat session");
  }

  const existingPending = await teacherSessionRepository.findPendingChatBetween(
    studentId,
    teacherId
  );
  if (existingPending) {
    throw new ApiError(400, "You already have a pending chat request with this teacher");
  }

  const ongoingCall = await teacherSessionRepository.findOngoingSession(studentId, teacherId);
  if (ongoingCall) {
    throw new ApiError(400, "You already have an ongoing session with this teacher");
  }

  const rateSnapshot = buildSessionRateSnapshot(teacher);
  const wallet = await walletService.getWalletBalance(studentId, "User");
  if (wallet.monetaryBalance < rateSnapshot.studentPerMinuteRate) {
    throw new ApiError(400, INSUFFICIENT_REQUEST_MSG);
  }

  const session = await teacherSessionRepository.create({
    student: studentId,
    teacher: teacherId,
    subject: subject || teacher.skills?.[0] || "General",
    sessionKind: "chat",
    ...rateSnapshot,
    status: "pending",
    initiatedBy: "student",
  });

  return session;
}

/**
 * Student disconnects or leaves before the teacher accepts — clear pending so a new request is allowed.
 */
export async function cancelPendingChatRequestByStudent(studentId, sessionId) {
  const session = await teacherSessionRepository.findById(sessionId);
  if (!session || session.sessionKind !== "chat") {
    return null;
  }
  if (session.student._id.toString() !== studentId.toString()) {
    throw new ApiError(403, "Unauthorized to cancel this chat request");
  }
  if (session.status !== "pending") {
    return null;
  }
  return await teacherSessionRepository.updateById(sessionId, {
    status: "cancelled",
    rejectedAt: new Date(),
    rejectionReason: "Student left before the chat started",
    callEndTime: new Date(),
    sessionEndReason: "student_withdrew_before_accept",
  });
}

export async function acceptChatSession(teacherId, sessionId) {
  const session = await teacherSessionRepository.findById(sessionId);
  if (!session) {
    throw new ApiError(404, "Session not found");
  }
  if (session.sessionKind !== "chat") {
    throw new ApiError(400, "Not a chat session");
  }
  if (session.teacher._id.toString() !== teacherId.toString()) {
    throw new ApiError(403, "Unauthorized to accept this session");
  }
  if (session.status !== "pending") {
    throw new ApiError(400, `Session is already ${session.status}`);
  }

  const teacherBusy = await teacherSessionRepository.findTeacherActiveChatSession(teacherId);
  if (teacherBusy && teacherBusy._id.toString() !== sessionId) {
    throw new ApiError(409, TEACHER_BUSY_MSG);
  }

  const wallet = await walletService.getWalletBalance(session.student._id, "User");
  const studentRate = session.studentPerMinuteRate || session.perMinuteRate;
  if (wallet.monetaryBalance < studentRate) {
    await teacherSessionRepository.updateById(sessionId, {
      status: "cancelled",
      rejectedAt: new Date(),
      rejectionReason: INSUFFICIENT_REQUEST_MSG,
      sessionEndReason: "insufficient_balance_at_accept",
      callEndTime: new Date(),
    });
    throw new ApiError(400, INSUFFICIENT_REQUEST_MSG);
  }

  const updated = await teacherSessionRepository.updateById(sessionId, {
    status: "ongoing",
    acceptedAt: new Date(),
    chatStartedAt: new Date(),
  });

  return updated;
}

export async function rejectChatSession(teacherId, sessionId, reason) {
  const session = await teacherSessionRepository.findById(sessionId);
  if (!session) {
    throw new ApiError(404, "Session not found");
  }
  if (session.sessionKind !== "chat") {
    throw new ApiError(400, "Not a chat session");
  }
  if (session.teacher._id.toString() !== teacherId.toString()) {
    throw new ApiError(403, "Unauthorized to reject this session");
  }
  if (session.status !== "pending") {
    throw new ApiError(400, `Session is already ${session.status}`);
  }

  const rejectionReason = reason || "Teacher declined the chat";
  return await teacherSessionRepository.updateById(sessionId, {
    status: "rejected",
    rejectedAt: new Date(),
    rejectionReason,
    callEndTime: new Date(),
  });
}

export function assertParticipant(session, userId, role) {
  const studentId = session.student._id.toString();
  const teacherId = session.teacher._id.toString();
  const uid = userId.toString();
  if (role === "student" && uid === studentId) return;
  if (role === "teacher" && uid === teacherId) return;
  throw new ApiError(403, "Not a participant in this chat session");
}

/**
 * Bill one second: deduct per-minute rate / 60, update session.
 * Returns false if wallet insufficient (session should close).
 */
export async function billOneChatSecond(sessionId) {
  const session = await teacherSessionRepository.findById(sessionId);
  if (!session || session.sessionKind !== "chat" || session.status !== "ongoing") {
    return { ok: false, reason: "inactive" };
  }

  const studentPerMinute = session.studentPerMinuteRate || session.perMinuteRate;
  const teacherPerMinute = session.teacherPerMinuteRate || session.perMinuteRate;
  const platformFeePerMinute =
    session.platformFeePerMinute || Math.max(0, studentPerMinute - teacherPerMinute);

  const studentPerSecond = perSecondFromPerMinute(studentPerMinute);
  const teacherPerSecond = perSecondFromPerMinute(teacherPerMinute);
  const platformFeePerSecond = perSecondFromPerMinute(platformFeePerMinute);

  if (studentPerSecond <= 0) {
    return { ok: false, reason: "inactive" };
  }

  const studentId = session.student._id;
  const wallet = await walletService.getWalletBalance(studentId, "User");
  if (wallet.monetaryBalance < studentPerSecond) {
    return { ok: false, reason: "insufficient_balance", session };
  }

  try {
    await walletService.deductMonetaryBalance(studentId, studentPerSecond, "User");
  } catch {
    return { ok: false, reason: "insufficient_balance", session };
  }

  const prevMinutes = session.durationMinutes || 0;
  const prevTotal = session.totalAmount || 0;
  const durationMinutes = roundDurationMinutes(prevMinutes + 1 / 60);

  const updated = await teacherSessionRepository.updateById(sessionId, {
    durationMinutes,
    totalAmount: roundMoney(prevTotal + studentPerSecond),
    teacherAmount: roundMoney((session.teacherAmount || 0) + teacherPerSecond),
    platformFeeAmount: roundMoney(
      (session.platformFeeAmount || 0) + platformFeePerSecond
    ),
    amountDeducted: true,
  });

  const newWallet = await walletService.getWalletBalance(studentId, "User");

  return {
    ok: true,
    session: updated,
    balanceAfter: roundMoney(newWallet.monetaryBalance),
    durationSeconds: Math.round(durationMinutes * 60),
  };
}

export async function finalizeChatSession(
  sessionId,
  { sessionEndReason = null, skipIfNotOngoing = false } = {}
) {
  const session = await teacherSessionRepository.findById(sessionId);
  if (!session || session.sessionKind !== "chat") {
    return null;
  }
  if (session.status !== "ongoing") {
    if (skipIfNotOngoing) return session;
    return session;
  }

  const updated = await teacherSessionRepository.completeOngoingSession(sessionId, {
    status: "completed",
    callEndTime: new Date(),
    sessionEndReason,
  });

  if (!updated) {
    return await teacherSessionRepository.findById(sessionId);
  }

  const teacherAmount =
    updated?.teacherAmount ?? session.teacherAmount ?? session.totalAmount ?? 0;
  const teacherId = session.teacher._id || session.teacher;
  const creditAmount = Number(teacherAmount);
  if (creditAmount > 0) {
    const alreadyCredited = await teacherWalletLedger.hasSessionEarning(
      teacherId,
      updated._id
    );
    if (!alreadyCredited) {
      await walletService.addMonetaryBalance(
        teacherId,
        creditAmount,
        `chat_session_${sessionId}`,
        "Teacher"
      );
    }
    const bal = await walletService.getWalletBalance(teacherId, "Teacher");
    await teacherWalletLedger
      .recordSessionEarning({
        teacherId,
        amount: creditAmount,
        balanceAfter: bal.monetaryBalance,
        sessionId: updated._id,
        sessionKind: "chat",
      })
      .catch((e) => console.error("teacherWalletLedger recordSessionEarning:", e));
  }

  return updated;
}

export const chatConstants = {
  INSUFFICIENT_REQUEST_MSG,
  TEACHER_BUSY_MSG,
};

export default {
  initiateChatRequest,
  cancelPendingChatRequestByStudent,
  acceptChatSession,
  rejectChatSession,
  assertParticipant,
  billOneChatSecond,
  finalizeChatSession,
  notifyStudentDevices,
  notifyTeacherDevice,
  getStudentFcmToken,
  chatConstants,
};
