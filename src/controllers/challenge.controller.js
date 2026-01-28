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
  const { page, limit, search, isActive, isFriendGroup } = req.query;
  const result = await challengeService.getChallenges({
    page,
    limit,
    search,
    isActive,
    isFriendGroup,
  });

  return res.status(200).json(
    ApiResponse.success(result.challenges, "Challenges fetched successfully", result.pagination)
  );
});

export const getChallengeById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const challenge = await challengeService.getChallengeById(id);

  // Check if user is participant
  const isParticipant = challenge.participants.some(
    (p) => p.student._id.toString() === req.user._id.toString()
  );

  return res.status(200).json(
    ApiResponse.success(
      {
        ...challenge.toObject(),
        isParticipant,
      },
      "Challenge fetched successfully"
    )
  );
});

export const joinChallenge = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const challenge = await challengeService.joinChallenge(id, req.user._id);

  return res.status(200).json(
    ApiResponse.success(challenge, "Successfully joined challenge")
  );
});

export const inviteFriendsToChallenge = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { error, value } = challengeValidator.inviteFriendsToChallenge.validate(req.body);

  if (error) {
    throw new ApiError(
      400,
      "Validation Error",
      error.details.map((x) => x.message)
    );
  }

  const challenge = await challengeService.inviteFriendsToChallenge(
    id,
    value.friendIds,
    req.user._id
  );

  return res.status(200).json(
    ApiResponse.success(challenge, "Friends invited successfully")
  );
});

export default {
  createChallenge,
  getChallenges,
  getChallengeById,
  joinChallenge,
  inviteFriendsToChallenge,
};

