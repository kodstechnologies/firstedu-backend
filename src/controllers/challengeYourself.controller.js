import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import challengeYourselfService from "../services/challengeYourself.service.js";

/**
 * GET /challenge-yourself
 * Returns 6 stages (Bronze, Silver, Gold, Platinum, Diamond, Heroic) with levels and tests.
 * Each level includes isPurchased (direct test purchase completed). Stages use challenge_yourself tests by difficulty mix.
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
