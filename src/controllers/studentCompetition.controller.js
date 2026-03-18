import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import studentCompetitionService from "../services/studentCompetition.service.js";

// ==================== STUDENT COMPETITION SECTORS ====================

export const getStudentCompetitionSectors = asyncHandler(async (req, res) => {
  const sectors = await studentCompetitionService.getStudentCompetitionSectors();
  return res
    .status(200)
    .json(ApiResponse.success(sectors, "Competition Sectors fetched successfully"));
});

export default {
    getStudentCompetitionSectors
};
