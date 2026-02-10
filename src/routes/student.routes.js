import { Router } from "express";
import {
  signup,
  login,
  logout,
  requestForgotPasswordOTP,
  verifyForgotPasswordOTP,
  resetPassword,
  updateProfile,
  changePassword,convertPoints,
} from "../controllers/studentAuth.controller.js";
import {
  getCourses,
  getCourseById,
  createCourseOrder,
  purchaseCourse,
  getMyCourses,
  getCourseFollowUpTests,
  getTests,
  getTestById,
  createTestOrder,
  purchaseTest,
  getTestBundles,
  createTestBundleOrder,
  purchaseTestBundle,
  getMyTests,
} from "../controllers/marketplace.controller.js";
import {
  getDetailedAnalysis,
  calculateAnalysis,
} from "../controllers/examAnalysis.controller.js";
import {
  getPublishedOlympiads,
  getOlympiadDetails,
  registerForOlympiad,
  initiateOlympiadPayment,
  getOlympiadLobby,
} from "../controllers/olympiad.controller.js";
import {
  getPublishedTournaments,
  getTournamentDetails,
  registerForTournament,
  initiateTournamentPayment,
} from "../controllers/tournament.controller.js";
import {
  getPublishedWorkshops,
  getWorkshopDetails,
  registerForWorkshop,
  initiateWorkshopPayment,
} from "../controllers/workshop.controller.js";
import {
  createChallenge,
  getChallenges,
  getChallengeById,
  joinChallenge,
  inviteFriendsToChallenge,
} from "../controllers/challenge.controller.js";
import {
  createForum,
  getForums,
  getForumById,
  updateForum,
  deleteForum,
  createForumThread,
  addPostToThread,
  replyToPost,
  likePost,
} from "../controllers/forum.controller.js";
import {
  getHallOfFame,
} from "../controllers/hallOfFame.controller.js";
import { getMyEventsDashboard } from "../controllers/eventRegistration.controller.js";
import { getAllEvents } from "../controllers/events.controller.js";
import { contactUs } from "../controllers/contact.controller.js";
import {
  startExam,
  getExamSession,
  saveAnswer,
  markForReview,
  skipQuestion,
  logProctoringEvent,
  submitExam,
  getExamResults,
  getQuestionPalette,
} from "../controllers/examSession.controller.js";
import {
  getWallet,
  rechargeWallet,
  getPointsHistory,
} from "../controllers/wallet.controller.js";
import {
  getMerchandiseItems,
  getMerchandiseById,
  claimMerchandise,
  getMyClaims,
} from "../controllers/merchandise.controller.js";
import {
  getMyOrders,
} from "../controllers/order.controller.js";
import {
  getAvailableTeachers,
  initiateCallRequest,
  getCallHistory,
  getCallRecordings,
  cancelCallRequest,
  checkWalletBalance,
} from "../controllers/studentTeacherConnect.controller.js";
import {
  createTicket,
  getMyTickets,
  getTicketById,
  getTicketMessages,
  sendMessage,
} from "../controllers/studentSupport.controller.js";
import {
  registerFCMToken,
  getMyNotifications,
  getUnreadCount,
  markNotificationAsRead,
  markAllNotificationsAsRead,
} from "../controllers/notification.controller.js";
import { verifyJWT } from "../middleware/auth.middleware.js";
import { uploadImage } from "../utils/multerConfig.js";

const router = Router();

// Student Authentication Routes
router.post("/signup", uploadImage.single("profileImage"), signup);
router.post("/login", login);

// Contact Us (no JWT)
router.post("/contact-us", contactUs);
router.post("/logout", verifyJWT, logout);
router.post("/forgot-password/request", requestForgotPasswordOTP);
router.post("/forgot-password/verify", verifyForgotPasswordOTP);
router.post("/forgot-password/reset", resetPassword);
router.put("/update-profile", verifyJWT, updateProfile);
router.put("/change-password", verifyJWT, changePassword);

// Marketplace - Courses
router.get("/courses", verifyJWT, getCourses);
router.get("/courses/:id", verifyJWT, getCourseById);
router.post("/courses/:id/create-order", verifyJWT, createCourseOrder);
router.post("/courses/:id/purchase", verifyJWT, purchaseCourse);
router.get("/my-courses", verifyJWT, getMyCourses);
router.get("/courses/:id/follow-up-tests", verifyJWT, getCourseFollowUpTests);

// Marketplace - Tests
router.get("/tests", verifyJWT, getTests);
router.get("/tests/:id", verifyJWT, getTestById);
router.post("/tests/:id/create-order", verifyJWT, createTestOrder);
router.post("/tests/:id/purchase", verifyJWT, purchaseTest);

// Marketplace - Test Bundles
router.get("/test-bundles", getTestBundles);
router.post("/test-bundles/:id/create-order", verifyJWT, createTestBundleOrder);
router.post("/test-bundles/:id/purchase", verifyJWT, purchaseTestBundle);

// My Purchases
router.get("/my-tests", verifyJWT, getMyTests);

// Exam Performance Analysis
router.get(
  "/exam-sessions/:sessionId/analysis",
  verifyJWT,
  getDetailedAnalysis
);
router.post(
  "/exam-sessions/:sessionId/calculate-analysis",
  verifyJWT,
  calculateAnalysis
);

// Community & Competitions - Olympiads
router.get("/olympiads", verifyJWT, getPublishedOlympiads);
router.get("/olympiads/:id", verifyJWT, getOlympiadDetails);
router.post("/olympiads/:id/initiate-payment", verifyJWT, initiateOlympiadPayment);
router.post("/olympiads/:id/register", verifyJWT, registerForOlympiad);
router.get("/olympiads/:id/lobby", verifyJWT, getOlympiadLobby);

// Community & Competitions - Tournaments
router.get("/tournaments", verifyJWT, getPublishedTournaments);
router.get("/tournaments/:id", verifyJWT, getTournamentDetails);
router.post("/tournaments/:id/initiate-payment", verifyJWT, initiateTournamentPayment);
router.post("/tournaments/:id/register", verifyJWT, registerForTournament);

// Community & Competitions - Workshops
router.get("/workshops", verifyJWT, getPublishedWorkshops);
router.get("/workshops/:id", verifyJWT, getWorkshopDetails);
router.post("/workshops/:id/initiate-payment", verifyJWT, initiateWorkshopPayment);
router.post("/workshops/:id/register", verifyJWT, registerForWorkshop);

// Community & Competitions - Challenges
router.post("/challenges", verifyJWT, createChallenge);
router.get("/challenges", verifyJWT, getChallenges);
router.get("/challenges/:id", verifyJWT, getChallengeById);
router.post("/challenges/:id/join", verifyJWT, joinChallenge);
router.post("/challenges/:id/invite", verifyJWT, inviteFriendsToChallenge);

// Community & Competitions - Forums
router.post("/forums", verifyJWT, createForum);
router.get("/forums", verifyJWT, getForums);
router.get("/forums/:id", verifyJWT, getForumById);
router.put("/forums/:id", verifyJWT, updateForum);
router.delete("/forums/:id", verifyJWT, deleteForum);
router.post("/forums/:forumId/threads", verifyJWT, createForumThread);
router.post("/forums/:forumId/threads/:threadId/posts", verifyJWT, addPostToThread);
router.post("/forums/:forumId/threads/:threadId/posts/:postId/replies", verifyJWT, replyToPost);
router.post("/forums/:forumId/threads/:threadId/posts/:postId/like", verifyJWT, likePost);
router.post("/forums/:forumId/threads/:threadId/posts/:postId/replies/:replyId/like", verifyJWT, likePost);

// Community & Competitions - Hall of Fame
router.get("/hall-of-fame", verifyJWT, getHallOfFame);

// All Events (Olympiads, Tournaments, Workshops) - catalog, no registration filter
router.get("/events", getAllEvents);

// My Events Dashboard
router.get("/my-events", verifyJWT, getMyEventsDashboard);

// ==================== EXAM HALL (Examination System) ====================

// Start Exam Session
router.post("/tests/:testId/start-exam", verifyJWT, startExam);

// Get Exam Session (with questions, timer, palette)
router.get("/exam-sessions/:sessionId", verifyJWT, getExamSession);

// Save Answer
router.put("/exam-sessions/:sessionId/questions/:questionId/answer", verifyJWT, saveAnswer);

// Mark for Review
router.post("/exam-sessions/:sessionId/questions/:questionId/mark-review", verifyJWT, markForReview);

// Skip Question
router.post("/exam-sessions/:sessionId/questions/:questionId/skip", verifyJWT, skipQuestion);

// Log Proctoring Event (window blur, tab switch, etc.)
router.post("/exam-sessions/:sessionId/proctoring", verifyJWT, logProctoringEvent);

// Submit Exam
router.post("/exam-sessions/:sessionId/submit", verifyJWT, submitExam);

// Get Exam Results (Instant Results with explanations)
router.get("/exam-sessions/:sessionId/results", verifyJWT, getExamResults);

// Get Question Palette (Navigation Grid)
router.get("/exam-sessions/:sessionId/palette", verifyJWT, getQuestionPalette);

// ==================== GAMIFICATION & WALLET ====================

// Wallet Routes
router.get("/wallet", verifyJWT, getWallet);
router.post("/wallet/recharge", verifyJWT, rechargeWallet);
router.get("/wallet/points-history", verifyJWT, getPointsHistory);
router.post("/wallet/convert-points", verifyJWT, convertPoints);

// Merchandise Store Routes
router.get("/merchandise", verifyJWT, getMerchandiseItems);
router.get("/merchandise/:id", verifyJWT, getMerchandiseById);
router.post("/merchandise/:id/claim", verifyJWT, claimMerchandise);
router.get("/merchandise/my-claims", verifyJWT, getMyClaims);

// Order History
router.get("/orders", verifyJWT, getMyOrders);

// ==================== TEACHER CONNECT ====================

// Teacher Listing & Availability
router.get("/teachers", verifyJWT, getAvailableTeachers);
router.get("/teachers/:teacherId/check-balance", verifyJWT, checkWalletBalance);

// Call Management
router.post("/teachers/:teacherId/request-call", verifyJWT, initiateCallRequest);
router.get("/teacher-sessions", verifyJWT, getCallHistory);
router.get("/teacher-sessions/recordings", verifyJWT, getCallRecordings);
router.post("/teacher-sessions/:sessionId/cancel", verifyJWT, cancelCallRequest);

// ==================== SUPPORT DESK ====================

// Ticket Management
router.post("/support/tickets", verifyJWT, createTicket);
router.get("/support/tickets", verifyJWT, getMyTickets);
router.get("/support/tickets/:ticketId", verifyJWT, getTicketById);
router.get("/support/tickets/:ticketId/messages", verifyJWT, getTicketMessages);
router.post("/support/tickets/:ticketId/messages", verifyJWT, sendMessage);

// ==================== NOTIFICATIONS ====================

// Register/Update FCM token
router.post("/notifications/register-token", verifyJWT, registerFCMToken);

// Get all notifications
router.get("/notifications", verifyJWT, getMyNotifications);

// Get unread notification count
router.get("/notifications/unread-count", verifyJWT, getUnreadCount);

// Mark notification as read
router.put("/notifications/:notificationId/read", verifyJWT, markNotificationAsRead);

// Mark all notifications as read
router.put("/notifications/read-all", verifyJWT, markAllNotificationsAsRead);

export default router;
