import teacherSessionRepository from "../repository/teacherSession.repository.js";
import teacherRepository from "../repository/teacher.repository.js";
import teacherChatService from "../services/teacherChat.service.js";
import {
  authenticateTeacherConnectSocket,
  normalizeSocketAuthToken,
} from "./socketAuth.util.js";

const chatBillingTimers = new Map();

const stopChatBilling = (sessionId) => {
  const key = sessionId.toString();
  const tid = chatBillingTimers.get(key);
  if (tid) {
    clearInterval(tid);
    chatBillingTimers.delete(key);
  }
};

const startChatBilling = (namespace, sessionId) => {
  const key = sessionId.toString();
  if (chatBillingTimers.has(key)) return;

  const tick = async () => {
    const result = await teacherChatService.billOneChatMinute(sessionId);
    if (!result.ok) {
      if (result.reason === "insufficient_balance") {
        stopChatBilling(sessionId);
        await teacherChatService.finalizeChatSession(sessionId, {
          sessionEndReason: "insufficient_balance",
        });
        const endedPayload = {
          sessionId: key,
          reason: "insufficient_balance",
          message:
            "Your wallet balance ran out. This chat session has ended. Please recharge to continue.",
          timestamp: new Date(),
        };
        namespace.to(`session:${key}`).emit("chat_session_ended", endedPayload);
        const session = await teacherSessionRepository.findById(sessionId);
        if (session) {
          const studentId = session.student._id.toString();
          const teacherId = session.teacher._id.toString();
          namespace.to(`student:${studentId}`).emit("chat_session_ended", endedPayload);
          namespace.to(`teacher:${teacherId}`).emit("chat_session_ended", endedPayload);
          await teacherChatService.notifyStudentDevices(
            studentId,
            "Chat ended — low balance",
            endedPayload.message,
            { type: "teacher_chat_insufficient_balance", sessionId: key }
          );
          const teacherDoc = await teacherRepository.findById(teacherId);
          if (teacherDoc) {
            await teacherChatService.notifyTeacherDevice(teacherDoc, "Chat session ended", "Student wallet balance ran out. The chat has closed.", {
              type: "teacher_chat_insufficient_balance",
              sessionId: key,
            });
          }
        }
      } else {
        stopChatBilling(sessionId);
      }
      return;
    }

    namespace.to(`session:${key}`).emit("chat_minute_billed", {
      sessionId: key,
      durationMinutes: result.session.durationMinutes,
      totalAmount: result.session.totalAmount,
      balanceAfter: result.balanceAfter,
      timestamp: new Date(),
    });
  };

  const intervalId = setInterval(() => {
    tick().catch((err) => console.error("Chat billing tick error:", err));
  }, 60_000);

  chatBillingTimers.set(key, intervalId);
};

export const setupTeacherChatSocket = (io) => {
  const ns = io.of("/teacher-chat");

  ns.use(async (socket, next) => {
    const token = normalizeSocketAuthToken(
      socket.handshake.auth?.token || socket.handshake.headers?.authorization || ""
    );
    if (!token) return next(new Error("Authentication error: No token provided"));

    const user = await authenticateTeacherConnectSocket(token);
    if (!user) {
      return next(new Error("Authentication error: Invalid or expired token"));
    }
    socket.data.chatUser = user;
    next();
  });

  ns.on("connection", (socket) => {
    const user = socket.data.chatUser;
    const userId = user._id.toString();

    if (user.role === "teacher") {
      socket.join(`teacher:${userId}`);
    } else {
      socket.join(`student:${userId}`);
    }

    socket.on("chat_request", async (payload = {}) => {
      if (user.role !== "student") {
        socket.emit("chat_error", { message: "Only students can request a chat" });
        return;
      }
      const { teacherId, subject } = payload;
      if (!teacherId) {
        socket.emit("chat_error", { message: "teacherId is required" });
        return;
      }
      try {
        const session = await teacherChatService.initiateChatRequest(userId, teacherId, subject);
        socket.data.pendingChatSessionId = session._id.toString();
        socket.emit("chat_request_sent", { session });

        await teacherChatService.notifyTeacherDevice(
          await teacherRepository.findById(teacherId),
          "New chat request",
          `${user.name || "A student"} wants to start a paid chat.`,
          { type: "teacher_chat_request", sessionId: session._id.toString(), studentId: userId }
        );

        ns.to(`teacher:${teacherId}`).emit("incoming_chat_request", {
          session,
          student: { _id: user._id, name: user.name, email: user.email },
        });
      } catch (err) {
        socket.emit("chat_error", {
          message: err.message || "Could not send chat request",
          statusCode: err.statusCode,
        });
      }
    });

    socket.on("accept_chat", async (payload = {}) => {
      if (user.role !== "teacher") {
        socket.emit("chat_error", { message: "Only teachers can accept" });
        return;
      }
      const { sessionId } = payload;
      if (!sessionId) {
        socket.emit("chat_error", { message: "sessionId is required" });
        return;
      }
      try {
        const session = await teacherChatService.acceptChatSession(userId, sessionId);
        const sid = session._id.toString();
        const studentRef = session.student._id ?? session.student;
        const studentId = studentRef.toString();

        socket.join(`session:${sid}`);
        socket.data.chatSessionId = sid;

        startChatBilling(ns, session._id);

        const acceptedPayload = {
          session,
          timestamp: new Date(),
        };

        ns.to(`student:${studentId}`).emit("chat_accepted", acceptedPayload);
        socket.emit("chat_accepted", acceptedPayload);

        await teacherChatService.notifyStudentDevices(
          studentId,
          "Chat request accepted",
          "Your teacher accepted. You can start chatting now.",
          { type: "teacher_chat_accepted", sessionId: sid }
        );
      } catch (err) {
        socket.emit("chat_error", {
          message: err.message || "Could not accept chat",
          statusCode: err.statusCode,
        });
      }
    });

    socket.on("reject_chat", async (payload = {}) => {
      if (user.role !== "teacher") {
        socket.emit("chat_error", { message: "Only teachers can reject" });
        return;
      }
      const { sessionId, reason } = payload;
      if (!sessionId) {
        socket.emit("chat_error", { message: "sessionId is required" });
        return;
      }
      try {
        const sessionDoc = await teacherChatService.rejectChatSession(userId, sessionId, reason);
        const studentId = sessionDoc.student._id.toString();
        const endedPayload = {
          sessionId: sessionDoc._id.toString(),
          reason: sessionDoc.rejectionReason,
          timestamp: new Date(),
        };
        ns.to(`student:${studentId}`).emit("chat_rejected", endedPayload);
        socket.emit("chat_rejected_ack", endedPayload);

        await teacherChatService.notifyStudentDevices(
          studentId,
          "Chat request declined",
          endedPayload.reason,
          { type: "teacher_chat_rejected", sessionId: endedPayload.sessionId }
        );
      } catch (err) {
        socket.emit("chat_error", {
          message: err.message || "Could not reject chat",
          statusCode: err.statusCode,
        });
      }
    });

    socket.on("join_chat_session", async (payload = {}) => {
      const { sessionId } = payload;
      if (!sessionId) {
        socket.emit("chat_error", { message: "sessionId is required" });
        return;
      }
      try {
        const session = await teacherSessionRepository.findById(sessionId);
        if (!session || session.sessionKind !== "chat") {
          socket.emit("chat_error", { message: "Chat session not found" });
          return;
        }
        teacherChatService.assertParticipant(session, userId, user.role);
        if (session.status !== "ongoing") {
          socket.emit("chat_error", { message: "Chat is not active" });
          return;
        }
        const sid = session._id.toString();
        socket.join(`session:${sid}`);
        socket.data.chatSessionId = sid;
        if (user.role === "student") {
          delete socket.data.pendingChatSessionId;
        }
        socket.emit("joined_chat_session", { sessionId: sid, session });
      } catch (err) {
        socket.emit("chat_error", {
          message: err.message || "Cannot join session",
          statusCode: err.statusCode,
        });
      }
    });

    socket.on("send_chat_message", async (payload = {}) => {
      const { sessionId, text, sentAt } = payload;
      if (!sessionId || !text || !String(text).trim()) {
        socket.emit("chat_error", { message: "sessionId and non-empty text are required" });
        return;
      }
      try {
        const session = await teacherSessionRepository.findById(sessionId);
        if (!session || session.sessionKind !== "chat") {
          socket.emit("chat_error", { message: "Chat session not found" });
          return;
        }
        teacherChatService.assertParticipant(session, userId, user.role);
        if (session.status !== "ongoing") {
          socket.emit("chat_error", { message: "Chat is not active" });
          return;
        }
        const sid = session._id.toString();
        const messagePayload = {
          sessionId: sid,
          text: String(text).trim(),
          from: user.role,
          senderId: userId,
          senderName: user.name || user.email || user.phone,
          sentAt: sentAt || new Date().toISOString(),
        };
        ns.to(`session:${sid}`).emit("chat_message", messagePayload);
      } catch (err) {
        socket.emit("chat_error", {
          message: err.message || "Failed to send message",
          statusCode: err.statusCode,
        });
      }
    });

    const endChatForSocket = async (sessionId, reason, message) => {
      const sid = sessionId.toString();
      stopChatBilling(sessionId);
      await teacherChatService.finalizeChatSession(sessionId, { sessionEndReason: reason });
      const endedPayload = {
        sessionId: sid,
        reason,
        message: message || "",
        timestamp: new Date(),
      };
      ns.to(`session:${sid}`).emit("chat_session_ended", endedPayload);
      const session = await teacherSessionRepository.findById(sessionId);
      if (session) {
        ns.to(`student:${session.student._id}`).emit("chat_session_ended", endedPayload);
        ns.to(`teacher:${session.teacher._id}`).emit("chat_session_ended", endedPayload);
      }
    };

    const withdrawStudentPendingChat = async () => {
      if (user.role !== "student") return null;
      const pendingId = socket.data.pendingChatSessionId;
      if (!pendingId) return null;
      delete socket.data.pendingChatSessionId;
      try {
        const sessionDoc = await teacherChatService.cancelPendingChatRequestByStudent(
          userId,
          pendingId
        );
        if (sessionDoc) {
          const tid = sessionDoc.teacher._id.toString();
          ns.to(`teacher:${tid}`).emit("chat_request_withdrawn", {
            sessionId: sessionDoc._id.toString(),
            timestamp: new Date(),
          });
        }
        return sessionDoc;
      } catch (err) {
        console.error("Withdraw pending chat error:", err);
        return null;
      }
    };

    socket.on("cancel_chat_request", async (payload = {}) => {
      if (user.role !== "student") {
        socket.emit("chat_error", { message: "Only students can cancel a chat request" });
        return;
      }
      const requestedId = payload.sessionId || socket.data.pendingChatSessionId;
      if (!requestedId) {
        socket.emit("chat_error", { message: "No pending chat request to cancel" });
        return;
      }
      if (
        socket.data.pendingChatSessionId &&
        socket.data.pendingChatSessionId !== String(requestedId)
      ) {
        socket.emit("chat_error", { message: "sessionId does not match your pending request" });
        return;
      }
      socket.data.pendingChatSessionId = String(requestedId);
      const withdrawn = await withdrawStudentPendingChat();
      if (withdrawn) {
        socket.emit("chat_request_cancelled", { sessionId: withdrawn._id.toString() });
      } else {
        socket.emit("chat_error", {
          message: "No pending chat request to cancel or it was already handled",
        });
      }
    });

    socket.on("end_chat", async (payload = {}) => {
      const { sessionId } = payload;
      if (!sessionId) {
        socket.emit("chat_error", { message: "sessionId is required" });
        return;
      }
      try {
        const session = await teacherSessionRepository.findById(sessionId);
        if (!session || session.sessionKind !== "chat") {
          socket.emit("chat_error", { message: "Chat session not found" });
          return;
        }
        teacherChatService.assertParticipant(session, userId, user.role);
        if (session.status !== "ongoing") {
          socket.emit("chat_error", { message: "Chat is not active" });
          return;
        }
        const isTeacher = user.role === "teacher";
        await endChatForSocket(
          session._id,
          isTeacher ? "ended_by_teacher" : "ended_by_student",
          isTeacher
            ? "The teacher ended the chat."
            : "The student ended the chat."
        );
      } catch (err) {
        socket.emit("chat_error", {
          message: err.message || "Could not end chat",
          statusCode: err.statusCode,
        });
      }
    });

    socket.on("disconnect", async () => {
      try {
        await withdrawStudentPendingChat();
      } catch (err) {
        console.error("Teacher chat pending withdraw on disconnect:", err);
      }
      const sid = socket.data.chatSessionId;
      if (!sid) return;
      try {
        const session = await teacherSessionRepository.findById(sid);
        if (session && session.sessionKind === "chat" && session.status === "ongoing") {
          const isTeacher = user.role === "teacher";
          await endChatForSocket(
            session._id,
            isTeacher ? "teacher_disconnected" : "student_disconnected",
            isTeacher
              ? "The teacher disconnected. The chat has ended."
              : "The student disconnected. The chat has ended."
          );
        }
      } catch (err) {
        console.error("Teacher chat disconnect cleanup error:", err);
      }
    });
  });
};
