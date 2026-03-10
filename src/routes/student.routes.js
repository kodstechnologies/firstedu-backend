import { Router } from "express";
import {
  signup,
  login,
  logout,
  requestForgotPasswordOTP,
  verifyForgotPasswordOTP,
  resetPassword,
  getProfile,
  updateProfile,
  changePassword, convertPoints,
} from "../controllers/studentAuth.controller.js";
import {
  getCourses,
  getCourseById,
  createCourseOrder,
  purchaseCourse,
  getMyCourses,
  getCourseFollowUpTests,
  getTests,
  getTestsAndBundles,
  getTestById,
  initiateTestPayment,
  purchaseTest,
  getTestBundles,
  initiateTestBundlePayment,
  purchaseTestBundle,
  getMyTests,
  getExamHall,
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
  addComment,
  replyToComment,
  likeForum,
  likeComment,
  likeReply,
  deleteComment,
  deleteReply,
} from "../controllers/forum.controller.js";
import {
  getHallOfFame,
} from "../controllers/hallOfFame.controller.js";
import { getMyEventsDashboard } from "../controllers/eventRegistration.controller.js";
import { getAllEvents } from "../controllers/events.controller.js";
import { contactUs } from "../controllers/contact.controller.js";
import {
  startExam,
  pauseExam,
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
  getTeacherById,
  initiateCallRequest,
  getCallHistory,
  getCallRecordings,
  cancelCallRequest,
  checkWalletBalance,
  rateTeacher,
} from "../controllers/studentTeacherConnect.controller.js";
import {
  createTicket,
  getMyTickets,
  getTicketById,
  getTicketMessages,
  sendMessage,
} from "../controllers/studentSupport.controller.js";
import {
  submitSupport,
} from "../controllers/contactSupport.controller.js";
import {
  submitBlogRequest,
} from "../controllers/blogRequest.controller.js";
import {
  getAllBlogs,
  getBlogById,
} from "../controllers/blog.controller.js";
import {
  getAllQnAUser,
  getQnAByIdUser,
  submitQnARequest,
  getMyQnARequests,
} from "../controllers/qna.controller.js";
import {
  getAllPressAnnouncementsUser,
  getPressAnnouncementByIdUser,
} from "../controllers/pressAnnouncement.controller.js";
import {
  getAllApplyJobsUser,
  getApplyJobByIdUser,
  applyForJob,
} from "../controllers/teacherConnectApply.controller.js";
import {
  registerFCMToken,
  getMyNotifications,
  getUnreadCount,
  markNotificationAsRead,
  markAllNotificationsAsRead,
} from "../controllers/notification.controller.js";
import {
  getFeaturedStories,
  getAllStoriesStudent,
  getStoryDetailStudent,
} from "../controllers/successStory.controller.js";
import { getCategoriesForStudent } from "../controllers/category.controller.js";
import { verifyJWT } from "../middleware/auth.middleware.js";
import { uploadImage, uploadPDF } from "../utils/multerConfig.js";
import {

  getCompetitions,
  getCompetitionByIdOrSlug,

} from '../controllers/competition.controller.js';

const router = Router();

// Student Authentication Routes
router.post("/signup", uploadImage.single("profileImage"), signup);
router.post("/login", login);

// Contact Us (no JWT)
router.post("/contact-us", contactUs);
router.post("/logout", verifyJWT, logout);
router.get("/profile", verifyJWT, getProfile);
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
router.get("/tests-and-bundles", verifyJWT, getTestsAndBundles);
router.get("/tests/:id", verifyJWT, getTestById);
router.post("/tests/:id/initiate-payment", verifyJWT, initiateTestPayment);
router.post("/tests/:id/purchase", verifyJWT, purchaseTest);

// Marketplace - Test Bundles
router.get("/test-bundles", getTestBundles);
router.post("/test-bundles/:id/initiate-payment", verifyJWT, initiateTestBundlePayment);
router.post("/test-bundles/:id/purchase", verifyJWT, purchaseTestBundle);

// Categories (taxonomy for filtering tests/question banks)
router.get("/categories", verifyJWT, getCategoriesForStudent);

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

// Community - Forums (title, description, tags, topic, attachment; comments & replies)
router.post("/forums", verifyJWT, uploadImage.single("attachment"), createForum);
router.get("/forums", verifyJWT, getForums);
router.get("/forums/:id", verifyJWT, getForumById);
router.put("/forums/:id", verifyJWT, uploadImage.single("attachment"), updateForum);
router.delete("/forums/:id", verifyJWT, deleteForum);
router.post("/forums/:forumId/comments", verifyJWT, addComment);
router.post("/forums/:forumId/comments/:commentId/replies", verifyJWT, replyToComment);
router.post("/forums/:forumId/like", verifyJWT, likeForum);
router.post("/forums/:forumId/comments/:commentId/like", verifyJWT, likeComment);
router.post("/forums/:forumId/comments/:commentId/replies/:replyId/like", verifyJWT, likeReply);
router.delete("/forums/:forumId/comments/:commentId", verifyJWT, deleteComment);
router.delete("/forums/:forumId/comments/:commentId/replies/:replyId", verifyJWT, deleteReply);

// Community & Competitions - Hall of Fame
router.get("/hall-of-fame", verifyJWT, getHallOfFame);

// All Events (Olympiads, Tournaments) - catalog, no registration filter
router.get("/events", verifyJWT, getAllEvents);

// My Events Dashboard
router.get("/my-events", verifyJWT, getMyEventsDashboard);

// ==================== EXAM HALL (Examination System) ====================

// Exam Hall - all purchased tests and test series
router.get("/examhall", verifyJWT, getExamHall);

// Start Exam Session
router.post("/tests/:testId/start-exam", verifyJWT, startExam);

// Get Exam Session (with questions, timer, palette)
router.get("/exam-sessions/:sessionId", verifyJWT, getExamSession);

// Pause Exam (stops timer; call start-exam to resume)
router.post("/exam-sessions/:sessionId/pause", verifyJWT, pauseExam);

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
router.get("/teachers/:teacherId", verifyJWT, getTeacherById);
router.post("/teachers/:teacherId/rate", verifyJWT, rateTeacher);
router.get("/teachers/:teacherId/check-balance", verifyJWT, checkWalletBalance);

// Call Management
router.post("/teachers/:teacherId/request-call", verifyJWT, initiateCallRequest);
router.get("/teacher-sessions", verifyJWT, getCallHistory);
router.get("/teacher-sessions/recordings", verifyJWT, getCallRecordings);
router.post("/teacher-sessions/:sessionId/cancel", verifyJWT, cancelCallRequest);

// ==================== SUPPORT DESK ====================

// Simple Support Message (no JWT required)
router.post("/contact-support", verifyJWT, submitSupport);

// Blog Request (optional image)
router.post("/blog-request", verifyJWT, uploadImage.single("image"), submitBlogRequest);

// Approved blogs (approved by admin + admin-added blogs)
router.get("/blogs", verifyJWT, getAllBlogs);
router.get("/blogs/:id", verifyJWT, getBlogById);

// Q&A – view admin-created Q&A and submit requests
router.get("/qna", verifyJWT, getAllQnAUser);
router.get("/qna/:id", verifyJWT, getQnAByIdUser);
router.post("/qna-request", verifyJWT, submitQnARequest);
router.get("/qna-requests", verifyJWT, getMyQnARequests);

// Press announcements (read only)
router.get("/press-announcements", verifyJWT, getAllPressAnnouncementsUser);
router.get("/press-announcements/:id", verifyJWT, getPressAnnouncementByIdUser);

// Teacher Connect – Apply Job (teachers can view jobs and apply; apply is public so candidates without account can apply)
router.get("/teacher-connect/jobs", getAllApplyJobsUser);
router.get("/teacher-connect/jobs/:id", getApplyJobByIdUser);
router.post("/teacher-connect/apply", uploadPDF.single("resume"), applyForJob);

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

// ==================== SUCCESS STORIES ====================

// Success Stories (Public)
router.get("/success-stories/featured", getFeaturedStories);
router.get("/success-stories", getAllStoriesStudent);
router.get("/success-stories/:id", getStoryDetailStudent);

// ==================== COMPETITION MANAGEMENT ====================

router.get("/competitions", getCompetitions);
router.get("/competitions/:idOrSlug", getCompetitionByIdOrSlug);


export default router;
