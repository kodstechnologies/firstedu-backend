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

/**
 * GET /admin/revenue-history
 * Returns paginated revenue history with source-level breakdown.
 */
export const getRevenueHistory = asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 20,
    type,
    from,
    to,
    search,
  } = req.query;

  const data = await adminDashboardService.getRevenueHistory({
    page,
    limit,
    type,
    from,
    to,
    search,
  });

  return res.status(200).json(
    ApiResponse.success(data, "Revenue history fetched successfully")
  );
});

export default {
  getDashboardData,
  getRevenueHistory,
};
