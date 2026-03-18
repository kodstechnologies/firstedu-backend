import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import everydayChallengeService from "../services/everydayChallenge.service.js";

/**
 * GET /everyday-challenges
 * Returns today's challenge (one randomly selected test from everyday challenge pool) and student's streak info.
 * Everyday challenge tests are free and only appear here; price is ignored for these tests.
 */
export const getEverydayChallenges = asyncHandler(async (req, res) => {
  const result = await everydayChallengeService.getTodaysChallenge(req.user._id);
  return res.status(200).json(
    ApiResponse.success(result, "Everyday challenge fetched successfully")
  );
});

export default {
  getEverydayChallenges,
};
