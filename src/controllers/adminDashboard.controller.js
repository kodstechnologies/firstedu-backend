import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import adminDashboardService from "../services/adminDashboard.service.js";

/**
 * GET /admin/dashboard
 * Returns admin dashboard data: KPIs (with last-month comparison),
 * revenue chart (last 7 days), and needs attention (urgent support tickets only).
 */
export const getDashboardData = asyncHandler(async (req, res) => {
  const data = await adminDashboardService.getDashboardData();

  return res.status(200).json(
    ApiResponse.success(data, "Dashboard data fetched successfully")
  );
});

export default {
  getDashboardData,
};
