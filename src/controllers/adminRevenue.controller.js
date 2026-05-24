import adminRevenueService from "../services/adminRevenue.service.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";

/**
 * Get revenue history with pagination, filters, and search using the dedicated model.
 * Route: GET /api/v1/admin/revenue-transactions
 */
export const getRevenueTransactions = asyncHandler(async (req, res) => {
  const result = await adminRevenueService.getRevenueHistory(req.query);
  res.status(200).json(
    ApiResponse.success(result, "Dedicated revenue history fetched successfully")
  );
});

/**
 * Returns the list of distinct subcategory names that have ≥1 revenue transaction.
 * Route: GET /api/v1/admin/revenue-active-subcategories?pillar=School
 */
export const getActiveSubcategoryNames = asyncHandler(async (req, res) => {
  const result = await adminRevenueService.getActiveSubcategoryNames(req.query.pillar);
  res.status(200).json(
    ApiResponse.success(result, "Active revenue categories fetched")
  );
});
