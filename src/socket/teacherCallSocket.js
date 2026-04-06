import teacherSessionRepository from "../repository/teacherSession.repository.js";
import teacherRepository from "../repository/teacher.repository.js";
import teacherConnectService from "../services/teacherConnect.service.js";
import teacherChatService from "../services/teacherChat.service.js";
import {
  authenticateTeacherConnectSocket,
  normalizeSocketAuthToken,
} from "./socketAuth.util.js";

function assertCallParticipant(session, userId, role) {
  const studentId = session.student._id?.toString?.() ?? String(session.student);
  const teacherId = session.teacher._id?.toString?.() ?? String(session.teacher);
  const uid = userId.toString();
  if (role === "student" && uid === studentId) return;
  if (role === "teacher" && uid === teacherId) return;
  throw new Error("Not a participant in this call session");
}

function resolveDurationMinutes(session, payloadDuration) {
  if (typeof payloadDuration === "number" && payloadDuration > 0 && Number.isFinite(payloadDuration)) {
    return Math.ceil(payloadDuration);
  }
  if (session.callStartTime) {
    return Math.max(
      1,
      Math.ceil((Date.now() - new Date(session.callStartTime).getTime()) / 60000)
    );
  }
  return 1;
}

export const setupTeacherCallSocket = (io) => {
  const ns = io.of("/teacher-call");

  ns.use(async (socket, next) => {
    const token = normalizeSocketAuthToken(
      socket.handshake.auth?.token || socket.handshake.headers?.authorization || ""
    );
    if (!token) return next(new Error("Authentication error: No token provided"));

    const user = await authenticateTeacherConnectSocket(token);
    if (!user) {
      return next(new Error("Authentication error: Invalid or expired token"));
    }
    socket.data.callUser = user;
    next();
  });

  ns.on("connection", (socket) => {
    const user = socket.data.callUser;
    const userId = user._id.toString();

    if (user.role === "teacher") {
      socket.join(`teacher:${userId}`);
    } else {
      socket.join(`student:${userId}`);
    }

    socket.on("call_request", async (payload = {}) => {
      if (user.role !== "student") {
        socket.emit("call_error", { message: "Only students can request a call" });
        return;
      }
      const { teacherId, subject } = payload;
      if (!teacherId) {
        socket.emit("call_error", { message: "teacherId is required" });
        return;
      }
      try {
        const session = await teacherConnectService.initiateCallRequest(userId, teacherId, subject);
        socket.data.pendingCallSessionId = session._id.toString();
        socket.emit("call_request_sent", { session });

        await teacherChatService.notifyTeacherDevice(
          await teacherRepository.findById(teacherId),
          "New call request",
          `${user.name || "A student"} wants to start a paid voice call.`,
          {
            type: "teacher_call_request",
            sessionId: session._id.toString(),
            studentId: userId,
          }
        );

        ns.to(`teacher:${teacherId}`).emit("incoming_call_request", {
          session,
          student: { _id: user._id, name: user.name, email: user.email },
        });
      } catch (err) {
        socket.emit("call_error", {
          message: err.message || "Could not send call request",
          statusCode: err.statusCode,
        });
      }
    });

    socket.on("accept_call", async (payload = {}) => {
      if (user.role !== "teacher") {
        socket.emit("call_error", { message: "Only teachers can accept" });
        return;
      }
      const { sessionId } = payload;
      if (!sessionId) {
        socket.emit("call_error", { message: "sessionId is required" });
        return;
      }
      try {
        const pre = await teacherSessionRepository.findById(sessionId);
        if (!pre || pre.sessionKind !== "call") {
          socket.emit("call_error", { message: "Call session not found" });
          return;
        }
        await teacherConnectService.acceptCallRequest(userId, sessionId);
        const session = await teacherConnectService.startCall(sessionId);
        const sid = session._id.toString();
        const studentRef = session.student._id ?? session.student;
        const studentId = studentRef.toString();

        socket.join(`session:${sid}`);
        socket.data.callSessionId = sid;

        const acceptedPayload = {
          session,
          timestamp: new Date(),
        };

        ns.to(`student:${studentId}`).emit("call_accepted", acceptedPayload);
        socket.emit("call_accepted", acceptedPayload);

        await teacherChatService.notifyStudentDevices(
          studentId,
          "Call request accepted",
          "Your teacher accepted. You can join the call now.",
          { type: "teacher_call_accepted", sessionId: sid }
        );
      } catch (err) {
        socket.emit("call_error", {
          message: err.message || "Could not accept call",
          statusCode: err.statusCode,
        });
      }
    });

    socket.on("reject_call", async (payload = {}) => {
      if (user.role !== "teacher") {
        socket.emit("call_error", { message: "Only teachers can reject" });
        return;
      }
      const { sessionId, reason } = payload;
      if (!sessionId) {
        socket.emit("call_error", { message: "sessionId is required" });
        return;
      }
      try {
        const pre = await teacherSessionRepository.findById(sessionId);
        if (!pre || pre.sessionKind !== "call") {
          socket.emit("call_error", { message: "Call session not found" });
          return;
        }
        const sessionDoc = await teacherConnectService.rejectCallRequest(userId, sessionId, reason);
        const studentId = sessionDoc.student._id.toString();
        const endedPayload = {
          sessionId: sessionDoc._id.toString(),
          reason: sessionDoc.rejectionReason,
          timestamp: new Date(),
        };
        ns.to(`student:${studentId}`).emit("call_rejected", endedPayload);
        socket.emit("call_rejected_ack", endedPayload);

        await teacherChatService.notifyStudentDevices(
          studentId,
          "Call request declined",
          endedPayload.reason || "The teacher declined your call.",
          { type: "teacher_call_rejected", sessionId: endedPayload.sessionId }
        );
      } catch (err) {
        socket.emit("call_error", {
          message: err.message || "Could not reject call",
          statusCode: err.statusCode,
        });
      }
    });

    socket.on("join_call_session", async (payload = {}) => {
      const { sessionId } = payload;
      if (!sessionId) {
        socket.emit("call_error", { message: "sessionId is required" });
        return;
      }
      try {
        const session = await teacherSessionRepository.findById(sessionId);
        if (!session || session.sessionKind !== "call") {
          socket.emit("call_error", { message: "Call session not found" });
          return;
        }
        assertCallParticipant(session, userId, user.role);
        if (session.status !== "ongoing") {
          socket.emit("call_error", { message: "Call is not active" });
          return;
        }
        const sid = session._id.toString();
        socket.join(`session:${sid}`);
        socket.data.callSessionId = sid;
        if (user.role === "student") {
          delete socket.data.pendingCallSessionId;
        }
        socket.emit("joined_call_session", { sessionId: sid, session });
      } catch (err) {
        socket.emit("call_error", {
          message: err.message || "Cannot join session",
          statusCode: err.statusCode,
        });
      }
    });

    const endCallForSocket = async (sessionId, reason, message) => {
      const sid = sessionId.toString();
      const session = await teacherSessionRepository.findById(sessionId);
      if (!session || session.sessionKind !== "call" || session.status !== "ongoing") {
        return;
      }
      const durationMinutes = resolveDurationMinutes(session, null);
      await teacherConnectService.endCall(
        sid,
        durationMinutes,
        null,
        null
      );
      const endedPayload = {
        sessionId: sid,
        reason,
        message: message || "",
        timestamp: new Date(),
      };
      ns.to(`session:${sid}`).emit("call_session_ended", endedPayload);
      ns.to(`student:${session.student._id}`).emit("call_session_ended", endedPayload);
      ns.to(`teacher:${session.teacher._id}`).emit("call_session_ended", endedPayload);
    };

    const withdrawStudentPendingCall = async () => {
      if (user.role !== "student") return null;
      const pendingId = socket.data.pendingCallSessionId;
      if (!pendingId) return null;
      delete socket.data.pendingCallSessionId;
      try {
        const sessionDoc = await teacherConnectService.cancelPendingCallRequestByStudent(
          userId,
          pendingId
        );
        if (sessionDoc) {
          const tid = sessionDoc.teacher._id.toString();
          ns.to(`teacher:${tid}`).emit("call_request_withdrawn", {
            sessionId: sessionDoc._id.toString(),
            timestamp: new Date(),
          });
        }
        return sessionDoc;
      } catch (err) {
        console.error("Withdraw pending call error:", err);
        return null;
      }
    };

    socket.on("cancel_call_request", async (payload = {}) => {
      if (user.role !== "student") {
        socket.emit("call_error", { message: "Only students can cancel a call request" });
        return;
      }
      const requestedId = payload.sessionId || socket.data.pendingCallSessionId;
      if (!requestedId) {
        socket.emit("call_error", { message: "No pending call request to cancel" });
        return;
      }
      if (
        socket.data.pendingCallSessionId &&
        socket.data.pendingCallSessionId !== String(requestedId)
      ) {
        socket.emit("call_error", { message: "sessionId does not match your pending request" });
        return;
      }
      socket.data.pendingCallSessionId = String(requestedId);
      const withdrawn = await withdrawStudentPendingCall();
      if (withdrawn) {
        socket.emit("call_request_cancelled", { sessionId: withdrawn._id.toString() });
      } else {
        socket.emit("call_error", {
          message: "No pending call request to cancel or it was already handled",
        });
      }
    });

    socket.on("end_call", async (payload = {}) => {
      const { sessionId, durationMinutes, recordingUrl, agoraRecordingId } = payload || {};
      if (!sessionId) {
        socket.emit("call_error", { message: "sessionId is required" });
        return;
      }
      try {
        const session = await teacherSessionRepository.findById(sessionId);
        if (!session || session.sessionKind !== "call") {
          socket.emit("call_error", { message: "Call session not found" });
          return;
        }
        assertCallParticipant(session, userId, user.role);
        if (session.status !== "ongoing") {
          socket.emit("call_error", { message: "Call is not active" });
          return;
        }
        const dm = resolveDurationMinutes(session, durationMinutes);
        const updated = await teacherConnectService.endCall(
          sessionId,
          dm,
          recordingUrl || null,
          agoraRecordingId || null
        );
        const sid = updated._id.toString();
        const isTeacher = user.role === "teacher";
        const endedPayload = {
          sessionId: sid,
          reason: isTeacher ? "ended_by_teacher" : "ended_by_student",
          message: isTeacher ? "The teacher ended the call." : "The student ended the call.",
          session: updated,
          timestamp: new Date(),
        };
        ns.to(`session:${sid}`).emit("call_session_ended", endedPayload);
        ns.to(`student:${session.student._id}`).emit("call_session_ended", endedPayload);
        ns.to(`teacher:${session.teacher._id}`).emit("call_session_ended", endedPayload);
        socket.emit("call_ended_ack", { session: updated });
      } catch (err) {
        socket.emit("call_error", {
          message: err.message || "Could not end call",
          statusCode: err.statusCode,
        });
      }
    });

    socket.on("disconnect", async () => {
      try {
        await withdrawStudentPendingCall();
      } catch (err) {
        console.error("Teacher call pending withdraw on disconnect:", err);
      }
      const sid = socket.data.callSessionId;
      if (!sid) return;
      try {
        const session = await teacherSessionRepository.findById(sid);
        if (session && session.sessionKind === "call" && session.status === "ongoing") {
          const isTeacher = user.role === "teacher";
          await endCallForSocket(
            session._id,
            isTeacher ? "teacher_disconnected" : "student_disconnected",
            isTeacher
              ? "The teacher disconnected. The call has ended."
              : "The student disconnected. The call has ended."
          );
        }
      } catch (err) {
        console.error("Teacher call disconnect cleanup error:", err);
      }
    });
  });
};
