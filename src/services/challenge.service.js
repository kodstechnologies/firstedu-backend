import { ApiError } from "../utils/ApiError.js";
import challengeRepository from "../repository/challenge.repository.js";
import testRepository from "../repository/test.repository.js";

export const createChallenge = async (data, userId) => {
  const {
    title,
    description,
    testId,
    isFriendGroup,
    invitedFriends,
    startTime,
    endTime,
  } = data;

  if (!title || !testId || !startTime || !endTime) {
    throw new ApiError(400, "Missing required fields");
  }

  // Validate test exists
  const test = await testRepository.findTestById(testId);
  if (!test) {
    throw new ApiError(404, "Test not found");
  }

  // Validate time ranges
  if (new Date(startTime) >= new Date(endTime)) {
    throw new ApiError(400, "End time must be after start time");
  }

  const challenge = await challengeRepository.create({
    title,
    description,
    test: testId,
    createdBy: userId,
    creatorType: "student",
    isFriendGroup: isFriendGroup || false,
    invitedFriends: invitedFriends || [],
    startTime,
    endTime,
  });

  // Add creator as participant
  challenge.participants.push({
    student: userId,
    joinedAt: new Date(),
  });
  await challengeRepository.save(challenge);

  return challenge;
};

export const getChallenges = async (options = {}) => {
  const { page = 1, limit = 10, search, isActive, isFriendGroup } = options;

  const query = {};
  if (search) {
    query.$or = [
      { title: { $regex: search, $options: "i" } },
      { description: { $regex: search, $options: "i" } },
    ];
  }
  if (isActive !== undefined) {
    query.isActive = isActive === "true" || isActive === true;
  }
  if (isFriendGroup !== undefined) {
    query.isFriendGroup = isFriendGroup === "true" || isFriendGroup === true;
  }

  const pageNum = parseInt(page);
  const limitNum = parseInt(limit);
  const skip = (pageNum - 1) * limitNum;

  const [challenges, total] = await Promise.all([
    challengeRepository.find(query, {
      populate: [
        { path: "test", select: "title durationMinutes totalMarks" },
        { path: "createdBy", select: "name email" },
        { path: "invitedFriends", select: "name email" },
        { path: "participants.student", select: "name email" },
      ],
      sort: { createdAt: -1 },
      skip,
      limit: limitNum,
    }),
    challengeRepository.count(query),
  ]);

  return {
    challenges,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      pages: Math.ceil(total / limitNum) || 1,
    },
  };
};

export const getChallengeById = async (id) => {
  const challenge = await challengeRepository.findById(id, [
    { path: "test", select: "title durationMinutes totalMarks questions" },
    { path: "createdBy", select: "name email" },
    { path: "invitedFriends", select: "name email" },
    { path: "participants.student", select: "name email" },
  ]);

  if (!challenge) {
    throw new ApiError(404, "Challenge not found");
  }
  return challenge;
};

export const joinChallenge = async (id, userId) => {
  const challenge = await challengeRepository.findById(id);
  if (!challenge || !challenge.isActive) {
    throw new ApiError(404, "Challenge not found or inactive");
  }

  // Check if already participant
  const isParticipant = challenge.participants.some(
    (p) => p.student.toString() === userId.toString()
  );

  if (isParticipant) {
    throw new ApiError(400, "Already participating in this challenge");
  }

  // Check if friend group and user is invited
  if (challenge.isFriendGroup) {
    const isInvited = challenge.invitedFriends.some(
      (friendId) => friendId.toString() === userId.toString()
    );
    if (!isInvited) {
      throw new ApiError(403, "You are not invited to this friend group challenge");
    }
  }

  challenge.participants.push({
    student: userId,
    joinedAt: new Date(),
  });
  await challenge.save();

  return challenge;
};

export const inviteFriendsToChallenge = async (id, friendIds, userId) => {
  if (!friendIds || !Array.isArray(friendIds) || friendIds.length === 0) {
    throw new ApiError(400, "Friend IDs array is required");
  }

  const challenge = await challengeRepository.findById(id);
  if (!challenge) {
    throw new ApiError(404, "Challenge not found");
  }

  // Check if user is the creator
  if (challenge.createdBy.toString() !== userId.toString()) {
    throw new ApiError(403, "Only the creator can invite friends");
  }

  // Add friends to invited list (avoid duplicates)
  const existingInvited = challenge.invitedFriends.map((id) => id.toString());
  const newInvites = friendIds.filter((id) => !existingInvited.includes(id.toString()));

  challenge.invitedFriends.push(...newInvites);
  challenge.isFriendGroup = true;
  await challenge.save();

  return challenge;
};

export default {
  createChallenge,
  getChallenges,
  getChallengeById,
  joinChallenge,
  inviteFriendsToChallenge,
};

