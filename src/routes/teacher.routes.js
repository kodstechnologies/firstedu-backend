import { Router } from "express";
import {
  login,
  logout,
  requestForgotPasswordOTP,
  verifyForgotPasswordOTP,
  resetPassword,
  changePassword,
} from "../controllers/teacherAuth.controller.js";
import {
  getProfile,
  updateProfile,
  toggleAvailability,
  getPendingRequests,
  acceptCallRequest,
  rejectCallRequest,
  startCall,
  endCall,
  getSessionHistory,
  getEarnings,
} from "../controllers/teacherConnect.controller.js";
import { verifyJWT } from "../middleware/auth.middleware.js";
import { uploadImage } from "../utils/multerConfig.js";
import { submitSupport } from "../controllers/contactSupport.controller.js";

const router = Router();

// Teacher Authentication Routes (no signup – teachers are created by admin)
router.post("/login", login);
router.post("/logout", verifyJWT, logout);
router.post("/forgot-password/request", requestForgotPasswordOTP);
router.post("/forgot-password/verify", verifyForgotPasswordOTP);
router.post("/forgot-password/reset", resetPassword);
router.put("/change-password", verifyJWT, changePassword);

// ==================== SUPPORT ====================

// Simple Support Message (no JWT required)
router.post("/contact-support",verifyJWT, submitSupport);

// ==================== TEACHER CONNECT MODULE ====================

// Profile Management (teacher can update only: name, email, gender, about, profileImage)
router.get("/profile", verifyJWT, getProfile);
router.put("/profile", verifyJWT, uploadImage.single("profileImage"), updateProfile);
router.put("/availability", verifyJWT, toggleAvailability);

// Call Requests
router.get("/pending-requests", verifyJWT, getPendingRequests);
router.post("/sessions/:sessionId/accept", verifyJWT, acceptCallRequest);
router.post("/sessions/:sessionId/reject", verifyJWT, rejectCallRequest);

// Call Management
router.post("/sessions/:sessionId/start", verifyJWT, startCall);
router.post("/sessions/:sessionId/end", verifyJWT, endCall);

// Session History & Earnings
router.get("/sessions", verifyJWT, getSessionHistory);
router.get("/earnings", verifyJWT, getEarnings);

export default router;

