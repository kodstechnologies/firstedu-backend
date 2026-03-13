import { Router } from "express";

import {
  adminLogin,
  adminLogout,
  requestForgotPasswordOTP,
  verifyForgotPasswordOTP,
  resetPassword,
  changePassword,
  getAdminProfile,
} from "../controllers/adminAuth.controller.js";
import { getDashboardData } from "../controllers/adminDashboard.controller.js";
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
  createTeacher,
  getTeachers,
  getTeacherById,
  approveTeacher,
  rejectTeacher,
  updatePerMinuteRate,
  updateTeacher,
  deleteTeacher,
  sendLoginCredentials,
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
  deleteCommentAdmin,
  deleteReplyAdmin,
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
  getMerchandise,
  getMerchandiseById,
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
  getTicketCategories,
} from "../controllers/adminSupport.controller.js";
import {
  uploadCertificate,
  getCertificates,
  getCertificateById,
} from "../controllers/certificate.controller.js";
import {
  sendNotificationToStudent,
  sendNotificationToMultipleStudents,
  sendNotificationToAllStudents,
  sendNotificationToPurchasers,
} from "../controllers/notification.controller.js";
import {
  createCategory as createTaxonomyCategory,
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

import {
  getAllSupport,
  replyToSupport,
} from '../controllers/contactSupport.controller.js';


import {
  getAllBlogRequests,
  getBlogRequestById,
  updateBlogRequestStatus,
} from '../controllers/blogRequest.controller.js';
import { createBlog, updateBlog, deleteBlog } from '../controllers/blog.controller.js';


import {
  addSuccessStory,
  getAllStoriesAdmin,
  getStoryByIdAdmin,
  updateSuccessStory,
  updateStoryStatus,
  deleteSuccessStory,
} from '../controllers/successStory.controller.js';


import {
  generateQuestions,
  saveGeneratedQuestions,
} from '../controllers/aiQuestion.controller.js';
import {
  createCompetition,
  getCompetitions,
  getCompetitionByIdOrSlug,
  updateCompetition,
  deleteCompetition,
} from '../controllers/competition.controller.js';
import {
  createQnA,
  getAllQnAAdmin,
  getQnAByIdAdmin,
  updateQnA,
  deleteQnA,
  getAllQnARequests,
  getQnARequestById,
} from '../controllers/qna.controller.js';
import {
  createPressAnnouncement,
  getAllPressAnnouncementsAdmin,
  getPressAnnouncementByIdAdmin,
  updatePressAnnouncement,
  deletePressAnnouncement,
} from '../controllers/pressAnnouncement.controller.js';
import {
  createApplyJob,
  getAllApplyJobsAdmin,
  getApplyJobByIdAdmin,
  updateApplyJob,
  deleteApplyJob,
  getAllApplicationsAdmin,
  getInterviewTakenAdmin,
  getApplicationByIdAdmin,
  scheduleInterview,
  approveApplication,
  rejectApplication,
} from '../controllers/teacherConnectApply.controller.js';
import {
  getCategories,
  getTemplates,
  getTemplateById,
  createTemplate,
  updateTemplate,
  deleteTemplate,
} from "../controllers/emailTemplate.controller.js";
import { verifyJWT } from "../middleware/auth.middleware.js";
import { uploadCourseMaterial, uploadImage, uploadPDF, uploadSuccessStory } from '../utils/multerConfig.js';

const router = Router();

// Admin Authentication Routes
router.post("/login", adminLogin);
router.post("/logout", verifyJWT, adminLogout);
router.get("/profile", verifyJWT, getAdminProfile);
router.get("/dashboard", verifyJWT, getDashboardData);
router.post("/forgot-password/request", requestForgotPasswordOTP);
router.post("/forgot-password/verify", verifyForgotPasswordOTP);
router.post("/forgot-password/reset", resetPassword);
router.put("/change-password", verifyJWT, changePassword);

// Categories (hierarchical, unlimited nesting: School -> Classes -> Class 1 -> Subjects -> Math -> Geometry)
router.post("/categories", verifyJWT, createTaxonomyCategory);
router.get("/categories", verifyJWT, getTaxonomyCategories);
router.get("/categories/tree", verifyJWT, getTaxonomyCategoryTree);
router.get("/categories/:id", verifyJWT, getTaxonomyCategoryById);
router.get("/categories/:id/children", verifyJWT, getTaxonomyCategoryChildren);
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

// Tests (Test Builder) - optional image = cover/thumbnail
router.post("/tests", verifyJWT, uploadImage.single("image"), createTest);
router.get("/tests", verifyJWT, getTests);
router.get("/tests/:id", verifyJWT, getTestById);
router.put("/tests/:id", verifyJWT, uploadImage.single("image"), updateTest);
router.delete("/tests/:id", verifyJWT, deleteTest);

// Test Bundles (Test Series) - optional image = cover/thumbnail
router.post("/test-bundles", verifyJWT, uploadImage.single("image"), createBundle);
router.get("/test-bundles", verifyJWT, getBundles);
router.get("/test-bundles/:id", verifyJWT, getBundleById);
router.put("/test-bundles/:id", verifyJWT, uploadImage.single("image"), updateBundle);
router.delete("/test-bundles/:id", verifyJWT, deleteBundle);

// Courses
router.post("/courses", verifyJWT, uploadCourseMaterial, createCourse);
router.get("/courses", verifyJWT, getCourses);
router.get("/courses/:id", verifyJWT, getCourseById);
router.put("/courses/:id", verifyJWT, uploadCourseMaterial, updateCourse);
router.delete("/courses/:id", verifyJWT, deleteCourse);

// Teacher Management (admin creates/updates teachers; teachers can only login and update limited profile)
router.post("/teachers", verifyJWT, uploadImage.single("profileImage"), createTeacher);
router.get("/teachers", verifyJWT, getTeachers);
router.get("/teachers/:id", verifyJWT, getTeacherById);
router.post("/teachers/:id/approve", verifyJWT, approveTeacher);
router.post("/teachers/:id/reject", verifyJWT, rejectTeacher);
router.post("/teachers/:id/send-credentials", verifyJWT, sendLoginCredentials);
router.put("/teachers/:id/rate", verifyJWT, updatePerMinuteRate);
router.put("/teachers/:id", verifyJWT, uploadImage.single("profileImage"), updateTeacher);
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
router.post("/olympiads", verifyJWT, uploadImage.single("image"), createOlympiad);
router.get("/olympiads", verifyJWT, getOlympiads);
router.get("/olympiads/:id", verifyJWT, getOlympiadById);
router.put("/olympiads/:id", verifyJWT, uploadImage.single("image"), updateOlympiad);
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
router.post("/workshops", verifyJWT, uploadImage.single("image"), createWorkshop);
router.get("/workshops", verifyJWT, getWorkshops);
router.get("/workshops/:id", verifyJWT, getWorkshopById);
router.put("/workshops/:id", verifyJWT, uploadImage.single("image"), updateWorkshop);
router.delete("/workshops/:id", verifyJWT, deleteWorkshop);

// ==================== COMPETITION MANAGEMENT ====================
router.post("/competitions", createCompetition);
router.get("/competitions", getCompetitions);
router.get("/competitions/:idOrSlug", getCompetitionByIdOrSlug);
router.put("/competitions/:id",  updateCompetition);
router.delete("/competitions/:id",  deleteCompetition);

// Forum Moderation (Admin)
router.get("/forums", verifyJWT, getForumsAdmin);
router.delete("/forums/:forumId", verifyJWT, deleteForumAdmin);
router.delete("/forums/:forumId/comments/:commentId", verifyJWT, deleteCommentAdmin);
router.delete("/forums/:forumId/comments/:commentId/replies/:replyId", verifyJWT, deleteReplyAdmin);

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
router.get("/merchandise", verifyJWT, getMerchandise);
router.get("/merchandise/:id", verifyJWT, getMerchandiseById);
router.post("/merchandise", verifyJWT, uploadImage.single("image"), createMerchandise);
router.put("/merchandise/:id", verifyJWT, uploadImage.single("image"), updateMerchandise);
router.delete("/merchandise/:id", verifyJWT, deleteMerchandise);

// Merchandise Requests (Claims)
router.get("/merchandise-requests", verifyJWT, getMerchandiseRequests);
router.put("/merchandise-requests/:id/status", verifyJWT, updateClaimStatus);

// ==================== SUPPORT DESK ====================



// Simple Support Messages
router.get('/contact-support', verifyJWT, getAllSupport);
router.patch('/contact-support/:id', verifyJWT, replyToSupport);

// Blog Requests
router.get('/blog-request', verifyJWT, getAllBlogRequests);
router.get('/blog-request/:id', verifyJWT, getBlogRequestById);
router.patch('/blog-request/:id', verifyJWT, updateBlogRequestStatus);

// Admin-added blogs (create, update, delete - admin-created or approved)
router.post('/blogs', verifyJWT, uploadImage.single('image'), createBlog);
router.put('/blogs/:id', verifyJWT, uploadImage.single('image'), updateBlog);
router.delete('/blogs/:id', verifyJWT, deleteBlog);

// Ticket Management
router.get("/support/tickets", verifyJWT, getAllTickets);
router.get("/support/tickets/categories", verifyJWT, getTicketCategories);
router.get("/support/tickets/:ticketId", verifyJWT, getTicketById);
router.post("/support/tickets/:ticketId/assign", verifyJWT, assignTicket);
router.put("/support/tickets/:ticketId/status", verifyJWT, updateTicketStatus);
router.post("/support/tickets/:ticketId/internal-notes", verifyJWT, addInternalNote);

// Chat Management
router.get("/support/tickets/:ticketId/messages", verifyJWT, getTicketMessages);
router.post("/support/tickets/:ticketId/messages", verifyJWT, sendMessage);

// ==================== CERTIFICATES ====================

// Upload certificate PDF for student (admin sends PDF from frontend)
router.post("/certificates/upload", verifyJWT, uploadPDF.single("pdf"), uploadCertificate);

// List and view issued certificates
router.get("/certificates", verifyJWT, getCertificates);
router.get("/certificates/:certificateId", verifyJWT, getCertificateById);

// ==================== NOTIFICATIONS ====================

// Send notification to a single student
router.post("/notifications/send", verifyJWT, sendNotificationToStudent);

// Send notification to multiple students
router.post("/notifications/send-multiple", verifyJWT, sendNotificationToMultipleStudents);

// Send notification to all students
router.post("/notifications/send-all", verifyJWT, sendNotificationToAllStudents);

// Send notification to students who purchased a specific product (course, test, bundle, olympiad, tournament, workshop)
router.post("/notifications/send-to-purchasers", verifyJWT, sendNotificationToPurchasers);




// ==================== SUCCESS STORIES ====================

// Success Stories Management
router.post(
  '/success-stories',
  verifyJWT,
  uploadSuccessStory.fields([
    { name: 'media', maxCount: 1 },
    { name: 'thumbnail', maxCount: 1 },
  ]),
  addSuccessStory,
);
router.get('/success-stories', verifyJWT, getAllStoriesAdmin);
router.get('/success-stories/:id', verifyJWT, getStoryByIdAdmin);
router.put(
  '/success-stories/:id',
  verifyJWT,
  uploadSuccessStory.fields([
    { name: 'media', maxCount: 1 },
    { name: 'thumbnail', maxCount: 1 },
  ]),
  updateSuccessStory,
);
router.patch('/success-stories/:id/status', verifyJWT, updateStoryStatus);
router.delete('/success-stories/:id', verifyJWT, deleteSuccessStory);


/* ==================== AI QUESTION GENERATION ==================== */

// Generate questions using Gemini 2.5 Flash
router.post(
  '/ai/generate-questions',
  verifyJWT,
  generateQuestions
);

// Save generated questions to Question Bank
router.post(
  '/ai/save-generated-questions',
  verifyJWT,
  saveGeneratedQuestions
);

// ==================== Q&A ====================
// Admin-created Q&A (question, answer, subject)
router.post('/qna', verifyJWT, createQnA);
router.get('/qna', verifyJWT, getAllQnAAdmin);
router.get('/qna/:id', verifyJWT, getQnAByIdAdmin);
router.put('/qna/:id', verifyJWT, updateQnA);
router.delete('/qna/:id', verifyJWT, deleteQnA);
// User Q&A requests (admin can view)
router.get('/qna-requests', verifyJWT, getAllQnARequests);
router.get('/qna-requests/:id', verifyJWT, getQnARequestById);

// ==================== PRESS ANNOUNCEMENTS ====================
router.post('/press-announcements', verifyJWT, uploadImage.single('image'), createPressAnnouncement);
router.get('/press-announcements', verifyJWT, getAllPressAnnouncementsAdmin);
router.get('/press-announcements/:id', verifyJWT, getPressAnnouncementByIdAdmin);
router.put('/press-announcements/:id', verifyJWT, uploadImage.single('image'), updatePressAnnouncement);
router.delete('/press-announcements/:id', verifyJWT, deletePressAnnouncement);

// ==================== TEACHER CONNECT – APPLY JOB ====================
router.post('/teacher-connect/jobs', verifyJWT, createApplyJob);
router.get('/teacher-connect/jobs', verifyJWT, getAllApplyJobsAdmin);
router.get('/teacher-connect/jobs/:id', verifyJWT, getApplyJobByIdAdmin);
router.put('/teacher-connect/jobs/:id', verifyJWT, updateApplyJob);
router.delete('/teacher-connect/jobs/:id', verifyJWT, deleteApplyJob);
router.get('/teacher-connect/applications', verifyJWT, getAllApplicationsAdmin);
router.get('/teacher-connect/interview-taken', verifyJWT, getInterviewTakenAdmin);
router.get('/teacher-connect/applications/:id', verifyJWT, getApplicationByIdAdmin);
router.post('/teacher-connect/applications/:id/schedule-interview', verifyJWT, scheduleInterview);
router.post('/teacher-connect/applications/:id/approve', verifyJWT, approveApplication);
router.post('/teacher-connect/applications/:id/reject', verifyJWT, rejectApplication);

// ==================== EMAIL TEMPLATES ====================
router.get("/email-templates/categories", verifyJWT, getCategories);
router.get("/email-templates", verifyJWT, getTemplates);
router.get("/email-templates/:id", verifyJWT, getTemplateById);
router.post("/email-templates", verifyJWT, createTemplate);
router.put("/email-templates/:id", verifyJWT, updateTemplate);
router.delete("/email-templates/:id", verifyJWT, deleteTemplate);

export default router;
