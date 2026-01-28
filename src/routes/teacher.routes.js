import { Router } from "express";
import {
  signup,
  login,
  logout,
  requestForgotPasswordOTP,
  verifyForgotPasswordOTP,
  resetPassword,
  changePassword,
} from "../controllers/teacherAuth.controller.js";
import {
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
import { uploadPDF } from "../utils/multerConfig.js";

const router = Router();

// Teacher Authentication Routes
router.post("/signup", uploadPDF.single("resume"), signup);
router.post("/login", login);
router.post("/logout", verifyJWT, logout);
router.post("/forgot-password/request", requestForgotPasswordOTP);
router.post("/forgot-password/verify", verifyForgotPasswordOTP);
router.post("/forgot-password/reset", resetPassword);
router.put("/change-password", verifyJWT, changePassword);

// ==================== TEACHER CONNECT MODULE ====================

// Profile Management
router.put("/profile", verifyJWT, updateProfile);
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

