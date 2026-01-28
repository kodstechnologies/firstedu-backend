import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import hallOfFameService from "../services/hallOfFame.service.js";

// ==================== STUDENT CONTROLLERS ====================

// Get Hall of Fame (only for Olympiads and Tournaments)
export const getHallOfFame = asyncHandler(async (req, res) => {
  const { page, limit, eventType } = req.query;
  const result = await hallOfFameService.getHallOfFameEntries({
    page,
    limit,
    eventType,
  });

  return res.status(200).json(
    ApiResponse.success(result.entries, "Hall of Fame fetched successfully", result.pagination)
  );
});

export default {
  getHallOfFame,
};

