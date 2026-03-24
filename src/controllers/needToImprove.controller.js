import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import needToImproveService from "../services/needToImprove.service.js";

/**
 * GET /user/need-to-improve
 * Returns cached suggestions (refreshes if > 6 hours old).
 */
export const getNeedToImprove = asyncHandler(async (req, res) => {
  const studentId = req.user._id;
  const data = await needToImproveService.getNeedToImprove(studentId);

  return res
    .status(200)
    .json(
      ApiResponse.success(data, "Need to improve data fetched successfully")
    );
});

/**
 * POST /user/need-to-improve/refresh
 * Force-recomputes and saves fresh suggestions.
 */
export const refreshNeedToImprove = asyncHandler(async (req, res) => {
  const studentId = req.user._id;
  const data = await needToImproveService.computeNeedToImprove(studentId);

  return res
    .status(200)
    .json(
      ApiResponse.success(data, "Need to improve data refreshed successfully")
    );
});

export default {
  getNeedToImprove,
  refreshNeedToImprove,
};
