import Admin from "../models/Admin.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";

/**
 * Use after verifyJWT. Ensures the authenticated user is an admin.
 */
export const verifyAdmin = asyncHandler(async (req, _, next) => {
  const admin = await Admin.findById(req.user._id).select("_id");
  if (!admin) {
    throw new ApiError(403, "Access denied. Admin only.");
  }
  next();
});
