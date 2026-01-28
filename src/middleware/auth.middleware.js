import jwt from "jsonwebtoken";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import Admin from "../models/Admin.js";
import User from "../models/Student.js";
import Teacher from "../models/Teacher.js";

export const verifyJWT = asyncHandler(async (req, _, next) => {
  const token =
    req.cookies?.accessToken ||
    req.header("Authorization")?.replace("Bearer ", "");

  if (!token) {
    // If no token is present, throw an unauthorized error.
    throw new ApiError(401, "Unauthorized request. No token provided.");
    //  return next();
  }

  try {
    // Check if ACCESS_TOKEN_SECRET is set
    if (!process.env.ACCESS_TOKEN_SECRET) {
      throw new ApiError(500, "Server configuration error: ACCESS_TOKEN_SECRET is not set");
    }

    const decodedToken = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);

    const user =
      (await User.findById(decodedToken?._id).select("-password")) ||
      (await Admin.findById(decodedToken?._id).select("-password")) ||
      (await Teacher.findById(decodedToken?._id).select("-password"));

    if (!user) {
      throw new ApiError(401, "Invalid Access Token");
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
