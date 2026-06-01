import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { ApiError } from "../utils/ApiError.js";
import everydayChallengeScheduleRepository from "../repository/EverydayChallengeSchedule.repository.js";

/**
 * GET /admin/everyday-challenge-schedule
 */
export const getEverydayChallengeSchedule = asyncHandler(async (req, res) => {
  const schedule = await everydayChallengeScheduleRepository.getSchedule();
  return res
    .status(200)
    .json(ApiResponse.success(schedule, "Schedule retrieved successfully"));
});

/**
 * POST /admin/everyday-challenge-schedule
 * Body: { day: 1..7, testId: "objectId" }
 */
export const upsertEverydayChallengeSchedule = asyncHandler(async (req, res) => {
  const { day, testId } = req.body;
  if (!day || day < 1 || day > 7) {
    throw new ApiError(400, "Valid day between 1 and 7 is required");
  }
  if (!testId) {
    throw new ApiError(400, "testId is required");
  }

  const updated = await everydayChallengeScheduleRepository.upsertSchedule(day, testId);
  return res
    .status(200)
    .json(ApiResponse.success(updated, `Test assigned to day ${day} successfully`));
});

export default {
  getEverydayChallengeSchedule,
  upsertEverydayChallengeSchedule,
};
