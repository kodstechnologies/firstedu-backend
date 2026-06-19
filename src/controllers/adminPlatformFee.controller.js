import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import {
  getPlatformFeeSummary,
  getPlatformFeeTeachers,
  updateTeacherPlatformFee,
} from "../services/platformFee.service.js";

export const getPlatformFees = asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 10,
    search,
    status,
    sortBy = "createdAt",
    sortOrder = "desc",
    from,
    to,
  } = req.query;

  const result = await getPlatformFeeTeachers({
    page,
    limit,
    search,
    status,
    sortBy,
    sortOrder,
    from,
    to,
  });

  return res.status(200).json(
    ApiResponse.success(
      {
        teachers: result.teachers,
        summary: result.summary,
      },
      "Platform fee details fetched successfully",
      result.pagination
    )
  );
});

export const getPlatformFeesSummary = asyncHandler(async (req, res) => {
  const { from, to } = req.query;
  const summary = await getPlatformFeeSummary({ from, to });

  return res
    .status(200)
    .json(ApiResponse.success(summary, "Platform fee summary fetched successfully"));
});

export const updatePlatformFee = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { platformFeePercent } = req.body;
  const teacher = await updateTeacherPlatformFee(id, platformFeePercent);

  return res
    .status(200)
    .json(ApiResponse.success(teacher, "Platform fee updated successfully"));
});

export default {
  getPlatformFees,
  getPlatformFeesSummary,
  updatePlatformFee,
};
