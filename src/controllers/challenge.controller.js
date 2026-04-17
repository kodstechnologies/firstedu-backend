import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import challengeService from "../services/challenge.service.js";
import challengeValidator from "../validation/challenge.validator.js";

export const createChallenge = asyncHandler(async (req, res) => {
  const { error, value } = challengeValidator.createChallenge.validate(req.body);

  if (error) {
    throw new ApiError(
      400,
      "Validation Error",
      error.details.map((x) => x.message)
    );
  }

  const challenge = await challengeService.createChallenge(value, req.user._id);
  return res.status(201).json(
    ApiResponse.success(challenge, "Challenge created successfully")
  );
});

export const getChallenges = asyncHandler(async (req, res) => {
  const { page, limit, search } = req.query;
  const result = await challengeService.getChallenges({
    page,
    limit,
    search,
  }, req.user._id);

  return res.status(200).json(
    ApiResponse.success(result.challenges, "Challenges fetched successfully", result.pagination)
  );
});

export const joinChallengeByCode = asyncHandler(async (req, res) => {
  const { error, value } = challengeValidator.joinChallengeByCode.validate(req.body);
  if (error) {
    throw new ApiError(
      400,
      "Validation Error",
      error.details.map((x) => x.message)
    );
  }

  const challenge = await challengeService.joinChallengeByCode(value.roomCode, req.user._id);
  return res.status(200).json(
    ApiResponse.success(challenge, "Successfully joined challenge room")
  );
});

export const startChallenge = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const result = await challengeService.startChallenge(id, req.user._id);
  return res.status(200).json(
    ApiResponse.success(result, "Challenge started successfully")
  );
});

export const deleteChallenge = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const result = await challengeService.deleteChallenge(id, req.user._id);
  return res.status(200).json(
    ApiResponse.success(result, "Challenge deleted successfully")
  );
});

export const getChallengeYourFriendsTests = asyncHandler(async (req, res) => {
  const tests = await challengeService.getChallengeYourFriendsTests(req.user?._id || null);
  return res.status(200).json(
    ApiResponse.success(tests, "Challenge-yourfriends tests fetched successfully")
  );
});

export const getCompletedChallenges = asyncHandler(async (req, res) => {
  const { page, limit } = req.query;
  const result = await challengeService.getCompletedChallenges(req.user._id, { page, limit });
  return res.status(200).json(
    ApiResponse.success(
      result.challenges,
      "Completed challenges fetched successfully",
      result.pagination
    )
  );
});

export const getCompletedChallengeById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const detail = await challengeService.getCompletedChallengeById(id, req.user._id);
  return res.status(200).json(
    ApiResponse.success(detail, "Completed challenge details fetched successfully")
  );
});

export default {
  createChallenge,
  getChallenges,
  joinChallengeByCode,
  startChallenge,
  deleteChallenge,
  getChallengeYourFriendsTests,
  getCompletedChallenges,
  getCompletedChallengeById,
};

