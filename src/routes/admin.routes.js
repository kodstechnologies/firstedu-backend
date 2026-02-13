import { Router } from "express";

import {
  adminLogin,
  adminLogout,
  requestForgotPasswordOTP,
  verifyForgotPasswordOTP,
  resetPassword,
  changePassword,
} from "../controllers/adminAuth.controller.js";
import {
  createQuestion,
  getAllQuestions,
  getQuestionById,
  updateQuestion,
  deleteQuestion,
  addChildQuestion,
  removeChildQuestion,
  getQuestionAnalytics,
  calculateAnalytics,
  getBulkAnalytics,
} from "../controllers/question.controller.js";
import {
  createTest,
  getTests,
  getTestById,
  updateTest,
  deleteTest,
  createBundle,
  getBundles,
  getBundleById,
  updateBundle,
  deleteBundle,
} from "../controllers/test.controller.js";
import {
  createCourse,
  getCourses,
  getCourseById,
  updateCourse,
  deleteCourse,
} from "../controllers/course.controller.js";
import {
  getStudents,
  getStudentById,
  getStudentTestHistory,
  getProctorLogs,
  updateStudentStatus,
} from "../controllers/adminUser.controller.js";
import {
  getTeachers,
  getTeacherById,
  getTeacherResume,
  approveTeacher,
  rejectTeacher,
  updatePerMinuteRate,
  updateTeacher,
  deleteTeacher,
} from "../controllers/teacher.controller.js";
import {
  createCourseTestLink,
  getCourseTestLinks,
  updateCourseTestLink,
  deleteCourseTestLink,
} from "../controllers/courseTestLink.controller.js";
import {
  createOlympiad,
  getOlympiads,
  getOlympiadById,
  updateOlympiad,
  deleteOlympiad,
  getOlympiadLeaderboard,
  declareOlympiadWinners,
} from "../controllers/olympiad.controller.js";
import {
  createTournament,
  getTournaments,
  getTournamentById,
  updateTournament,
  deleteTournament,
  getTournamentLeaderboard,
  declareTournamentWinners,
} from "../controllers/tournament.controller.js";
import {
  createWorkshop,
  getWorkshops,
  getWorkshopById,
  updateWorkshop,
  deleteWorkshop,
} from "../controllers/workshop.controller.js";
import {
  getForumsAdmin,
  deletePostAdmin,
  deleteReplyAdmin,
  deleteThreadAdmin,
  deleteForumAdmin,
} from "../controllers/forum.controller.js";
import {
  createCoupon,
  getCoupons,
  getCouponById,
  updateCoupon,
  deleteCoupon,
} from "../controllers/coupon.controller.js";
import {
 
  getAllOrders,
  getOrderById,
} from "../controllers/order.controller.js";
import {
  createOffer,
  getOffers,
  getOfferById,
  updateOffer,
  deleteOffer,
} from "../controllers/offer.controller.js";
import {
  createMerchandise,
  updateMerchandise,
  deleteMerchandise,
  getMerchandiseRequests,
  updateClaimStatus,
} from "../controllers/adminMerchandise.controller.js";
import {
  getAllTickets,
  getTicketById,
  assignTicket,
  updateTicketStatus,
  addInternalNote,
  getTicketMessages,
  sendMessage,
} from "../controllers/adminSupport.controller.js";
import {
  sendNotificationToStudent,
  sendNotificationToMultipleStudents,
  sendNotificationToAllStudents,
} from "../controllers/notification.controller.js";
import {
  createCategory as createTaxonomyCategory,
  createCategoryWithSubcategories as createTaxonomyCategoryWithSubcategories,
  getCategories as getTaxonomyCategories,
  getCategoryTree as getTaxonomyCategoryTree,
  getCategoryById as getTaxonomyCategoryById,
  getCategoryChildren as getTaxonomyCategoryChildren,
  updateCategory as updateTaxonomyCategory,
  deleteCategory as deleteTaxonomyCategory,
} from "../controllers/category.controller.js";
import {
  createQuestionBank,
  createQuestionBankWithQuestions,
  getQuestionBanks,
  getQuestionBankById,
  getQuestionsByBankId,
  updateQuestionBank,
  deleteQuestionBank,
} from "../controllers/questionBank.controller.js";
import { verifyJWT } from "../middleware/auth.middleware.js";
import { uploadPDF } from "../utils/multerConfig.js";

const router = Router();

// Admin Authentication Routes
router.post("/login", adminLogin);
router.post("/logout", verifyJWT, adminLogout);
router.post("/forgot-password/request", requestForgotPasswordOTP);
router.post("/forgot-password/verify", verifyForgotPasswordOTP);
router.post("/forgot-password/reset", resetPassword);
router.put("/change-password", verifyJWT, changePassword);

// Categories (hierarchical: School -> Classes -> Class 1-12, Subjects -> Physics, Chem, Math)
router.get("/categories/tree", verifyJWT, getTaxonomyCategoryTree);
router.post("/categories", verifyJWT, createTaxonomyCategory);
router.post("/categories/with-subcategories", verifyJWT, createTaxonomyCategoryWithSubcategories);
router.get("/categories", verifyJWT, getTaxonomyCategories);
router.get("/categories/:id/children", verifyJWT, getTaxonomyCategoryChildren);
router.get("/categories/:id", verifyJWT, getTaxonomyCategoryById);
router.put("/categories/:id", verifyJWT, updateTaxonomyCategory);
router.delete("/categories/:id", verifyJWT, deleteTaxonomyCategory);

// Question Banks (create bank, create bank with questions, list, update name, delete)
router.post("/question-banks", verifyJWT, createQuestionBank);
router.post("/question-banks/with-questions", verifyJWT, createQuestionBankWithQuestions);
router.get("/question-banks", verifyJWT, getQuestionBanks);
router.get("/question-banks/:id", verifyJWT, getQuestionBankById);
router.get("/question-banks/:id/questions", verifyJWT, getQuestionsByBankId);
router.put("/question-banks/:id", verifyJWT, updateQuestionBank);
router.delete("/question-banks/:id", verifyJWT, deleteQuestionBank);

// Question Bank Management Routes (individual questions - create, list all, get, update, delete)
router.post("/questions", verifyJWT, createQuestion);
router.get("/questions", verifyJWT, getAllQuestions);
router.get("/questions/:id", verifyJWT, getQuestionById);
router.put("/questions/:id", verifyJWT, updateQuestion);
router.delete("/questions/:id", verifyJWT, deleteQuestion);

// Connected Questions Routes
router.post("/questions/:id/child-questions", verifyJWT, addChildQuestion);
router.delete("/questions/:id/child-questions/:childId", verifyJWT, removeChildQuestion);

// Analytics Routes
router.get("/questions/:id/analytics", verifyJWT, getQuestionAnalytics);
router.post("/questions/:id/analytics/calculate", verifyJWT, calculateAnalytics);
router.post("/questions/analytics/bulk", verifyJWT, getBulkAnalytics);

// Tests (Test Builder)
router.post("/tests", verifyJWT, createTest);
router.get("/tests", verifyJWT, getTests);
router.get("/tests/:id", verifyJWT, getTestById);
router.put("/tests/:id", verifyJWT, updateTest);
router.delete("/tests/:id", verifyJWT, deleteTest);

// Test Bundles (Test Series)
router.post("/test-bundles", verifyJWT, createBundle);
router.get("/test-bundles", verifyJWT, getBundles);
router.get("/test-bundles/:id", verifyJWT, getBundleById);
router.put("/test-bundles/:id", verifyJWT, updateBundle);
router.delete("/test-bundles/:id", verifyJWT, deleteBundle);

// Courses
router.post("/courses", verifyJWT, uploadPDF.single("pdf"), createCourse);
router.get("/courses", verifyJWT, getCourses);
router.get("/courses/:id", verifyJWT, getCourseById);
router.put("/courses/:id", verifyJWT, uploadPDF.single("pdf"), updateCourse);
router.delete("/courses/:id", verifyJWT, deleteCourse);

// Teacher Management
router.get("/teachers", verifyJWT, getTeachers);
router.get("/teachers/:id", verifyJWT, getTeacherById);
router.get("/teachers/:id/resume", verifyJWT, getTeacherResume);
router.post("/teachers/:id/approve", verifyJWT, approveTeacher);
router.post("/teachers/:id/reject", verifyJWT, rejectTeacher);
router.put("/teachers/:id/rate", verifyJWT, updatePerMinuteRate);
router.put("/teachers/:id", verifyJWT, updateTeacher);
router.delete("/teachers/:id", verifyJWT, deleteTeacher);

// Student Management & Proctoring
router.get("/students", verifyJWT, getStudents);
router.get("/students/:id", verifyJWT, getStudentById);
router.put("/students/:id/status", verifyJWT, updateStudentStatus);
router.get("/students/:id/test-history", verifyJWT, getStudentTestHistory);
router.get("/exam-sessions/:sessionId/proctor-logs", verifyJWT, getProctorLogs);

// Course-Test Links (Follow-up Tests)
router.post("/course-test-links", verifyJWT, createCourseTestLink);
router.get("/courses/:courseId/test-links", verifyJWT, getCourseTestLinks);
router.put("/course-test-links/:id", verifyJWT, updateCourseTestLink);
router.delete("/course-test-links/:id", verifyJWT, deleteCourseTestLink);

// Live Events Management - Olympiads
router.post("/olympiads", verifyJWT, createOlympiad);
router.get("/olympiads", verifyJWT, getOlympiads);
router.get("/olympiads/:id", verifyJWT, getOlympiadById);
router.put("/olympiads/:id", verifyJWT, updateOlympiad);
router.delete("/olympiads/:id", verifyJWT, deleteOlympiad);
router.get("/olympiads/:id/leaderboard", verifyJWT, getOlympiadLeaderboard);
router.post("/olympiads/:id/winners", verifyJWT, declareOlympiadWinners);

// Live Events Management - Tournaments
router.post("/tournaments", verifyJWT, createTournament);
router.get("/tournaments", verifyJWT, getTournaments);
router.get("/tournaments/:id", verifyJWT, getTournamentById);
router.put("/tournaments/:id", verifyJWT, updateTournament);
router.delete("/tournaments/:id", verifyJWT, deleteTournament);
router.get("/tournaments/:id/leaderboard", verifyJWT, getTournamentLeaderboard);
router.post("/tournaments/:id/winners", verifyJWT, declareTournamentWinners);

// Live Events Management - Workshops
router.post("/workshops", verifyJWT, createWorkshop);
router.get("/workshops", verifyJWT, getWorkshops);
router.get("/workshops/:id", verifyJWT, getWorkshopById);
router.put("/workshops/:id", verifyJWT, updateWorkshop);
router.delete("/workshops/:id", verifyJWT, deleteWorkshop);

// Forum Moderation (Admin Monitoring)
router.get("/forums", verifyJWT, getForumsAdmin);
router.delete("/forums/:forumId", verifyJWT, deleteForumAdmin);
router.delete("/forums/:forumId/threads/:threadId", verifyJWT, deleteThreadAdmin);
router.delete("/forums/:forumId/threads/:threadId/posts/:postId", verifyJWT, deletePostAdmin);
router.delete("/forums/:forumId/threads/:threadId/posts/:postId/replies/:replyId", verifyJWT, deleteReplyAdmin);

// ==================== E-COMMERCE & WALLET ====================

// Coupon Management
router.post("/coupons", verifyJWT, createCoupon);
router.get("/coupons", verifyJWT, getCoupons);
router.get("/coupons/:id", verifyJWT, getCouponById);
router.put("/coupons/:id", verifyJWT, updateCoupon);
router.delete("/coupons/:id", verifyJWT, deleteCoupon);

// Offer Management (Discount System)
router.post("/offers", verifyJWT, createOffer);
router.get("/offers", verifyJWT, getOffers);
router.get("/offers/:id", verifyJWT, getOfferById);
router.put("/offers/:id", verifyJWT, updateOffer);
router.delete("/offers/:id", verifyJWT, deleteOffer);

// Order History
router.get("/orders", verifyJWT, getAllOrders);
router.get("/orders/:id", verifyJWT, getOrderById);

// Merchandise Management
router.post("/merchandise", verifyJWT, createMerchandise);
router.put("/merchandise/:id", verifyJWT, updateMerchandise);
router.delete("/merchandise/:id", verifyJWT, deleteMerchandise);

// Merchandise Requests (Claims)
router.get("/merchandise-requests", verifyJWT, getMerchandiseRequests);
router.put("/merchandise-requests/:id/status", verifyJWT, updateClaimStatus);

// ==================== SUPPORT DESK ====================

// Ticket Management
router.get("/support/tickets", verifyJWT, getAllTickets);
router.get("/support/tickets/:ticketId", verifyJWT, getTicketById);
router.post("/support/tickets/:ticketId/assign", verifyJWT, assignTicket);
router.put("/support/tickets/:ticketId/status", verifyJWT, updateTicketStatus);
router.post("/support/tickets/:ticketId/internal-notes", verifyJWT, addInternalNote);

// Chat Management
router.get("/support/tickets/:ticketId/messages", verifyJWT, getTicketMessages);
router.post("/support/tickets/:ticketId/messages", verifyJWT, sendMessage);

// ==================== NOTIFICATIONS ====================

// Send notification to a single student
router.post("/notifications/send", verifyJWT, sendNotificationToStudent);

// Send notification to multiple students
router.post("/notifications/send-multiple", verifyJWT, sendNotificationToMultipleStudents);

// Send notification to all students
router.post("/notifications/send-all", verifyJWT, sendNotificationToAllStudents);

export default router;
