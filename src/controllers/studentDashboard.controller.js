import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import studentDashboardService from "../services/studentDashboard.service.js";

export const getStudentDashboardStats = asyncHandler(async (req, res) => {
  const studentId = req.user._id;

  const stats = await studentDashboardService.getStudentDashboardStats(studentId);

  return res
    .status(200)
    .json(
      ApiResponse.success(
        stats,
        "Student dashboard statistics fetched successfully"
      )
    );
});

export default {
  getStudentDashboardStats,
};
