import dotenv from 'dotenv';
import http from 'http';
import { Server } from 'socket.io';
import cron from 'node-cron';
import connectDB from './config/db.js';
import './config/firebase.js';
import app from './app.js';
import { setupSupportSocket } from './socket/supportSocket.js';
import { setupExamSessionSocket } from './socket/examSessionSocket.js';
import { setupChallengeSocket } from './socket/challengeSocket.js';
import { setupTeacherChatSocket } from './socket/teacherChatSocket.js';
import { setupTeacherCallSocket } from './socket/teacherCallSocket.js';
import { setIO } from './socket/socketGateway.js';
import examSessionService from './services/examSession.service.js';
import tournamentNotificationsService from './services/tournamentNotifications.service.js';

dotenv.config();

const startServer = async () => {
  try {
    await connectDB();

    const server = http.createServer(app);

    // Setup Socket.io
    const io = new Server(server, {
      pingTimeout: Number(process.env.SOCKET_IO_PING_TIMEOUT_MS || 30000),
      pingInterval: Number(process.env.SOCKET_IO_PING_INTERVAL_MS || 25000),
      connectionStateRecovery: {
        maxDisconnectionDuration: Number(process.env.SOCKET_IO_RECOVERY_MS || 120000),
        skipMiddlewares: false,
      },
      cors: {
        origin: process.env.CORS_ORIGIN?.split(",").map((o) => o.trim()) || [
          "http://localhost:3000",
          "http://localhost:5173",
          "http://localhost:5174",
          "https://iscorre.com",
          "https://admin.iscorre.com"
        ],
        credentials: true,
        methods: ["GET", "POST"],
      },
    });
    setIO(io);

    // Setup support socket namespace
    setupSupportSocket(io);

    // Setup exam session socket namespace (for real-time proctoring)
    setupExamSessionSocket(io);
    setupChallengeSocket(io);
    setupTeacherChatSocket(io);
    setupTeacherCallSocket(io);

    // ==================== HYBRID AUTO-SUBMISSION APPROACH ====================
    // 
    // ⏱️ TIME-BASED: REST API + Background Job (Cron)
    //    - Cron job runs every minute to check for expired sessions
    //    - Also checks on REST API calls (getExamSession)
    //    - Emits WebSocket notifications when sessions are auto-submitted
    //
    // 🚨 PROCTORING-BASED: WebSocket (Real-time)
    //    - Instant detection and auto-submission via WebSocket
    //    - REST API endpoint still available as fallback
    //    - See examSessionSocket.js for WebSocket handlers
    //
    // ========================================================================
    
    // Setup cron job to auto-submit expired exam sessions
    // Runs every minute to check for expired sessions
    cron.schedule('* * * * *', async () => {
      try {
        const result = await examSessionService.autoSubmitExpiredSessions();
        if (result.processed > 0) {
          console.log(`⏰ Auto-submission cron: ${result.message}`);

          if (result.autoSubmittedSessions && result.autoSubmittedSessions.length > 0) {
            const examNamespace = io.of("/exam");
            result.autoSubmittedSessions.forEach(({ sessionId, studentId }) => {
              examNamespace.to(`session:${sessionId}`).emit("exam_auto_submitted", {
                sessionId,
                reason: "time_expired",
                message: "Exam was auto-submitted due to time expiration",
                timestamp: new Date(),
              });
              console.log(`📡 WebSocket notification sent for auto-submitted session ${sessionId}`);
            });
          }
        }
      } catch (error) {
        console.error('❌ Error in auto-submit cron job:', error);
      }
      try {
        await tournamentNotificationsService.runTournamentNotificationTick();
      } catch (error) {
        console.error('❌ Error in tournament notifications cron:', error);
      }
    });
    console.log('⏰ Minute cron: auto-submit + tournament notifications');

    const port = process.env.PORT || 8000;
    server.listen(port, '0.0.0.0', () => {
      console.log(`🚀!! Server running on http://0.0.0.0:${port} at ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`);
      console.log(`📡 Socket.io server initialized`);
    });
  } catch (err) {
    console.error('Server startup failed:', err);
    process.exit(1);
  }
};
startServer();
