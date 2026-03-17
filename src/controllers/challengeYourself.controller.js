import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import challengeYourselfService from "../services/challengeYourself.service.js";

/**
 * GET /challenge-yourself
 * Returns 6 stages (Bronze, Silver, Gold, Platinum, Diamond, Heroic) with levels and tests.
 * Tests are free and only shown here. Bronze uses everyday-challenge pool (easy); rest use challenge-yourself pool by difficulty.
 */
export const getChallengeYourself = asyncHandler(async (req, res) => {
  const result = await challengeYourselfService.getChallengeYourself(req.user._id);
  return res.status(200).json(
    ApiResponse.success(result, "Challenge yourself fetched successfully")
  );
});

export default {
  getChallengeYourself,
};
