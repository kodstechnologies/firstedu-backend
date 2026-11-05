import jwt from "jsonwebtoken";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import Admin from "../models/Admin.js";
import User from "../models/Student.js";
import Teacher from "../models/Teacher.js";
import studentSessionRepository from "../repository/studentSession.repository.js";

import { normalizeSocketAuthToken } from "../socket/socketAuth.util.js";

export const verifyJWT = asyncHandler(async (req, _, next) => {
  if (req.user) {
    return next();
  }

  // Prefer the Bearer token from this app. The shared API cookie is the last
  // login on this browser (often a student) and must not replace admin/teacher tokens.
  const headerToken = normalizeSocketAuthToken(
    req.header("Authorization") ||
      req.header("authorization") ||
      req.headers?.authorization ||
      "",
  );
  const cookieToken = normalizeSocketAuthToken(req.cookies?.accessToken || "");
  const token = headerToken || cookieToken;

  if (!token) {
    // If no token is present, throw an unauthorized error.
    throw new ApiError(401, "Unauthorized request. please login to continue.");
    //  return next();
  }

  try {
    // Check if ACCESS_TOKEN_SECRET is set
    if (!process.env.ACCESS_TOKEN_SECRET) {
      throw new ApiError(
        500,
        "Server configuration error: ACCESS_TOKEN_SECRET is not set",
      );
    }

    const decodedToken = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);

    let user =
      (await User.findById(decodedToken?._id).select("-password")) ||
      (await Admin.findById(decodedToken?._id).select("-password")) ||
      (await Teacher.findById(decodedToken?._id).select("-password"));

    if (!user) {
      throw new ApiError(401, "Invalid Access Token");
    }

    if (user.status === "banned") {
      await studentSessionRepository.deleteByStudentId(user._id);
      throw new ApiError(403, "You are banned by the admin");
    }

    const tokenUserType = String(decodedToken.userType || "").toLowerCase();
    const isStaffToken =
      tokenUserType === "teacher" ||
      tokenUserType === "admin" ||
      decodedToken.role === "teacher" ||
      decodedToken.role === "admin" ||
      decodedToken.role === "subadmin" ||
      decodedToken.role === "superadmin";

    // Single-device session checks apply to student tokens only.
    if (decodedToken.sessionId && !isStaffToken) {
      const session = await studentSessionRepository.findById(
        decodedToken.sessionId,
      );
      if (!session || session.student.toString() !== user._id.toString()) {
        throw new ApiError(401, "Session invalidated. Please login again.");
      }
      req.user = user;
      req.user.sessionId = decodedToken.sessionId;
      return next();
    }
    req.user = user;
    next();
  } catch (error) {
    // Handle specific JWT errors
    if (error.name === "JsonWebTokenError") {
      if (error.message === "invalid signature") {
        throw new ApiError(401, "Invalid token signature. Please login again.");
      }
      throw new ApiError(401, "Invalid token format");
    }
    if (error.name === "TokenExpiredError") {
      throw new ApiError(401, "Token has expired. Please login again.");
    }
    // If it's already an ApiError, re-throw it
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(401, error?.message || "Invalid access token");
  }
});
