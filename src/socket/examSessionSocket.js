import jwt from "jsonwebtoken";
import examSessionService from "../services/examSession.service.js";
import examSessionRepository from "../repository/examSession.repository.js";

/**
 * Authenticate socket connection using JWT
 */
const authenticateSocket = (token) => {
  try {
    const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
    return decoded;
  } catch (error) {
    return null;
  }
};

/**
 * Setup exam session socket handlers
 * 
 * HYBRID APPROACH - WebSocket for Real-Time Proctoring
 * 
 * This socket namespace handles:
 * - Real-time proctoring event monitoring
 * - Instant auto-submission on proctoring violations (via WebSocket)
 * - Timer synchronization and updates
 * - Session heartbeat monitoring
 * 
 * Note: Time-based auto-submission is handled by cron job (see server.js)
 * This WebSocket handles proctoring-based instant auto-submission
 */
export const setupExamSessionSocket = (io) => {
  // Namespace for exam sessions
  const examNamespace = io.of("/exam");

  examNamespace.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.replace("Bearer ", "");

    if (!token) {
      return next(new Error("Authentication error: No token provided"));
    }

    const user = authenticateSocket(token);
    if (!user) {
      return next(new Error("Authentication error: Invalid token"));
    }

    // Only students can connect to exam socket
    if (user.userType !== "Student") {
      return next(new Error("Authentication error: Only students can access exam sessions"));
    }

    socket.user = user;
    next();
  });

  examNamespace.on("connection", (socket) => {
    const studentId = socket.user._id;
    const studentName = socket.user.name || socket.user.email || "Student";

    console.log(`Student ${studentId} (${studentName}) connected to exam socket`);

    // Join exam session room
    socket.on("join_exam_session", async (sessionId) => {
      try {
        // Verify student has access to this session
        const session = await examSessionRepository.findOne({
          _id: sessionId,
          student: studentId,
        });

        if (!session) {
          socket.emit("error", { message: "Exam session not found or access denied" });
          return;
        }

        if (session.status !== "in_progress") {
          socket.emit("error", { message: `Exam session is ${session.status}` });
          return;
        }

        // Check if session has expired
        const now = new Date();
        if (new Date(session.endTime) < now) {
          // Auto-submit expired session
          try {
            await examSessionService.autoSubmitExpiredSessions();
            socket.emit("exam_auto_submitted", {
              sessionId,
              reason: "time_expired",
              message: "Exam was auto-submitted due to time expiration",
            });
            return;
          } catch (error) {
            console.error("Error auto-submitting expired session:", error);
          }
        }

        // Join the session room
        socket.join(`session:${sessionId}`);
        socket.currentSessionId = sessionId;

        // Send session info
        socket.emit("joined_exam_session", {
          sessionId,
          endTime: session.endTime,
          remainingTime: Math.max(0, new Date(session.endTime).getTime() - now.getTime()),
        });

        console.log(`Student ${studentId} joined exam session ${sessionId}`);
      } catch (error) {
        socket.emit("error", { message: error.message });
      }
    });

    // Leave exam session room
    socket.on("leave_exam_session", (sessionId) => {
      socket.leave(`session:${sessionId}`);
      socket.currentSessionId = null;
      socket.emit("left_exam_session", { sessionId });
      console.log(`Student ${studentId} left exam session ${sessionId}`);
    });

    /**
     * 🚨 PROCTORING EVENT HANDLER - Instant auto-submission on violations
     * This is the primary method for proctoring-based auto-submission
     */
    socket.on("proctoring_event", async (data) => {
      try {
        const { sessionId, eventType, metadata } = data;

        if (!sessionId || !eventType) {
          socket.emit("error", { message: "Session ID and event type are required" });
          return;
        }

        // Verify session belongs to this student
        const session = await examSessionRepository.findOne({
          _id: sessionId,
          student: studentId,
          status: "in_progress",
        });

        if (!session) {
          socket.emit("error", { message: "Exam session not found or already completed" });
          return;
        }

        // Validate event type
        const validEventTypes = ["window_blur", "tab_switch", "fullscreen_exit", "visibility_change"];
        if (!validEventTypes.includes(eventType)) {
          socket.emit("error", { message: "Invalid proctoring event type" });
          return;
        }

        // Log proctoring event (this will check for violations and auto-submit if needed)
        // The service function handles: adding event, checking threshold, and auto-submitting
        const result = await examSessionService.logProctoringEvent(
          sessionId,
          eventType,
          metadata,
          studentId
        );

        // If auto-submitted, notify client immediately via WebSocket
        if (result.autoSubmitted) {
          // Get updated session to get accurate violation count
          const updatedSession = await examSessionRepository.findOne({
            _id: sessionId,
            student: studentId,
          });

          examNamespace.to(`session:${sessionId}`).emit("exam_auto_submitted", {
            sessionId,
            reason: "proctoring_violation",
            violationCount: updatedSession?.proctoringEvents?.length || 0,
            message: "Exam was auto-submitted due to proctoring violations",
            timestamp: new Date(),
          });

          // Remove student from session room
          socket.leave(`session:${sessionId}`);
          socket.currentSessionId = null;

          console.log(`🚨 Exam ${sessionId} auto-submitted via WebSocket due to proctoring violations`);
        } else {
          // Get updated session for accurate violation count
          const updatedSession = await examSessionRepository.findOne({
            _id: sessionId,
            student: studentId,
          });

          // Just acknowledge the event
          socket.emit("proctoring_event_logged", {
            sessionId,
            eventType,
            violationCount: updatedSession?.proctoringEvents?.length || 0,
            message: "Proctoring event logged",
          });
        }
      } catch (error) {
        console.error("Error handling proctoring event:", error);
        socket.emit("error", { message: error.message });
      }
    });

    /**
     * Timer sync - Server sends remaining time updates
     */
    socket.on("request_timer_update", async (sessionId) => {
      try {
        const session = await examSessionRepository.findOne({
          _id: sessionId,
          student: studentId,
          status: "in_progress",
        });

        if (!session) {
          socket.emit("error", { message: "Exam session not found" });
          return;
        }

        const now = new Date();
        const remainingTime = Math.max(0, new Date(session.endTime).getTime() - now.getTime());

        socket.emit("timer_update", {
          sessionId,
          remainingTime,
          endTime: session.endTime,
        });

        // If time expired, auto-submit
        if (remainingTime === 0) {
          try {
            await examSessionService.autoSubmitExpiredSessions();
            socket.emit("exam_auto_submitted", {
              sessionId,
              reason: "time_expired",
              message: "Exam was auto-submitted due to time expiration",
            });
          } catch (error) {
            console.error("Error auto-submitting expired session:", error);
          }
        }
      } catch (error) {
        socket.emit("error", { message: error.message });
      }
    });

    /**
     * Heartbeat - Keep connection alive and verify session is still valid
     */
    socket.on("heartbeat", async (sessionId) => {
      try {
        if (!sessionId) {
          return;
        }

        const session = await examSessionRepository.findOne({
          _id: sessionId,
          student: studentId,
          status: "in_progress",
        });

        if (!session) {
          socket.emit("session_expired", { sessionId });
          return;
        }

        const now = new Date();
        const remainingTime = Math.max(0, new Date(session.endTime).getTime() - now.getTime());

        socket.emit("heartbeat_ack", {
          sessionId,
          remainingTime,
          isValid: true,
        });
      } catch (error) {
        socket.emit("error", { message: error.message });
      }
    });

    // Handle disconnection
    socket.on("disconnect", () => {
      if (socket.currentSessionId) {
        console.log(`Student ${studentId} disconnected from exam session ${socket.currentSessionId}`);
      } else {
        console.log(`Student ${studentId} disconnected from exam socket`);
      }
    });
  });

  return examNamespace;
};

