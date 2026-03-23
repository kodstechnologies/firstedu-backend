import { ApiError } from "../utils/ApiError.js";
import challengeRepository from "../repository/challenge.repository.js";
import testRepository from "../repository/test.repository.js";
import examSessionRepository from "../repository/examSession.repository.js";
import examSessionService from "./examSession.service.js";
import { getIO } from "../socket/socketGateway.js";

const ROOM_CODE_LENGTH = 6;
const ROOM_CODE_MAX_TRIES = 10;

const generateNumericCode = () =>
  Math.floor(10 ** (ROOM_CODE_LENGTH - 1) + Math.random() * 9 * 10 ** (ROOM_CODE_LENGTH - 1)).toString();

const createUniqueRoomCode = async () => {
  for (let i = 0; i < ROOM_CODE_MAX_TRIES; i += 1) {
    const roomCode = generateNumericCode();
    const existing = await challengeRepository.findOne({ roomCode });
    if (!existing) return roomCode;
  }
  throw new ApiError(500, "Failed to generate unique room code");
};

const getParticipantStats = async (challenge, currentUserId) => {
  const participantIds = challenge.participants.map((p) => p.student?._id ?? p.student).filter(Boolean);
  const rankings = await examSessionRepository.getRankedByChallenge(
    challenge._id,
    participantIds,
    participantIds.length || 100
  );

  const rankByStudentId = new Map();
  rankings.forEach((entry, index) => {
    rankByStudentId.set(entry.student?.toString(), { ...entry, rank: index + 1 });
  });

  const participants = challenge.participants.map((p) => {
    const student = p.student?._id ? p.student : { _id: p.student };
    const ranking = rankByStudentId.get(student._id?.toString());
    return {
      studentId: student._id,
      name: student.name || ranking?.name || null,
      email: student.email || ranking?.email || null,
      score: ranking?.score ?? null,
      rank: ranking?.rank ?? null,
      joinedAt: p.joinedAt,
    };
  });

  const myStats = participants.find(
    (p) => p.studentId?.toString?.() === currentUserId?.toString?.()
  ) || { score: null, rank: null };

  const highestScore = rankings.length ? rankings[0].score : null;
  return {
    myScore: myStats.score ?? null,
    myRank: myStats.rank ?? null,
    highestScore,
    totalParticipants: participants.length,
    participants,
  };
};

const syncChallengeCompletion = async (challenge) => {
  if (!challenge || challenge.roomStatus !== "started") return challenge;
  const participantIds = challenge.participants.map((p) => p.student?._id ?? p.student).filter(Boolean);
  if (!participantIds.length) return challenge;

  const completedCount = await examSessionRepository.countDocuments({
    challenge: challenge._id,
    student: { $in: participantIds },
    status: "completed",
  });

  if (completedCount >= participantIds.length) {
    challenge.roomStatus = "completed";
    challenge.completedAt = challenge.completedAt || new Date();
    await challengeRepository.save(challenge);
  }
  return challenge;
};

export const createChallenge = async (data, userId) => {
  const { title, description, testId } = data;

  if (!title || !testId) {
    throw new ApiError(400, "Missing required fields");
  }

  // Validate test exists
  const test = await testRepository.findTestById(testId);
  if (!test) {
    throw new ApiError(404, "Test not found");
  }
  if (test.applicableFor !== "challenge_yourfriends") {
    throw new ApiError(400, "Selected test is not applicable for challenge-yourfriends");
  }

  const challenge = await challengeRepository.create({
    title,
    description,
    test: testId,
    createdBy: userId,
    creatorType: "student",
    roomCode: await createUniqueRoomCode(),
    roomStatus: "waiting",
  });

  // Add creator as participant
  challenge.participants.push({
    student: userId,
    joinedAt: new Date(),
  });
  await challengeRepository.save(challenge);

  return challenge;
};

export const getChallenges = async (options = {}, userId) => {
  const { page = 1, limit = 10, search } = options;

  const query = {
    $or: [{ createdBy: userId }, { "participants.student": userId }],
    isActive: true,
  };
  if (search) {
    query.$and = [{
      $or: [
      { title: { $regex: search, $options: "i" } },
      { description: { $regex: search, $options: "i" } },
      ],
    }];
  }
  const pageNum = parseInt(page);
  const limitNum = parseInt(limit);
  const skip = (pageNum - 1) * limitNum;

  const [challenges, total] = await Promise.all([
    challengeRepository.find(query, {
      populate: [
        { path: "test", select: "title durationMinutes questionBank" },
        { path: "createdBy", select: "name email" },
        { path: "participants.student", select: "name email" },
      ],
      sort: { createdAt: -1 },
      skip,
      limit: limitNum,
    }),
    challengeRepository.count(query),
  ]);

  for (const challenge of challenges) {
    await syncChallengeCompletion(challenge);
  }

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

export const joinChallenge = async (id, userId) => {
  const challenge = await challengeRepository.findById(id);
  if (!challenge || !challenge.isActive || challenge.roomStatus === "completed") {
    throw new ApiError(404, "Challenge not found or inactive");
  }
  if (challenge.roomStatus === "started") {
    throw new ApiError(400, "Challenge has already started");
  }

  // Check if already participant
  const isParticipant = challenge.participants.some(
    (p) => p.student.toString() === userId.toString()
  );

  if (isParticipant) {
    throw new ApiError(400, "Already participating in this challenge");
  }

  challenge.participants.push({
    student: userId,
    joinedAt: new Date(),
  });
  await challenge.save();

  return challenge;
};

export const joinChallengeByCode = async (roomCode, userId) => {
  const challenge = await challengeRepository.findOne({ roomCode });
  if (!challenge || !challenge.isActive || challenge.roomStatus === "completed") {
    throw new ApiError(404, "Challenge room not found or inactive");
  }

  return joinChallenge(challenge._id, userId);
};

export const startChallenge = async (id, userId) => {
  const challenge = await challengeRepository.findById(id);
  if (!challenge || !challenge.isActive) {
    throw new ApiError(404, "Challenge not found or inactive");
  }
  if (challenge.createdBy.toString() !== userId.toString()) {
    throw new ApiError(403, "Only creator can start challenge");
  }
  if (challenge.roomStatus === "started") {
    return challenge;
  }
  if (challenge.roomStatus === "completed") {
    throw new ApiError(400, "Challenge is already completed");
  }
  if (challenge.participants.length < 2) {
    throw new ApiError(400, "Minimum 2 participants are required to start challenge");
  }

  const participantIds = challenge.participants.map((p) => p.student);
  const sessions = [];
  for (const participantId of participantIds) {
    const session = await examSessionService.startExamSession(
      challenge.test,
      participantId,
      { challengeId: challenge._id }
    );
    sessions.push({
      studentId: participantId.toString(),
      sessionId: session._id?.toString?.(),
    });
  }

  challenge.roomStatus = "started";
  challenge.startedAt = new Date();
  await challengeRepository.save(challenge);

  const io = getIO();
  if (io) {
    const payload = {
      challengeId: challenge._id.toString(),
      roomCode: challenge.roomCode,
      testId: challenge.test.toString(),
      sessions,
      startedAt: challenge.startedAt,
    };
    io.of("/challenge").to(`challenge:${challenge.roomCode}`).emit("challenge_started", payload);
    for (const row of sessions) {
      io.of("/challenge").to(`student:${row.studentId}`).emit("challenge_started_for_you", {
        ...payload,
        sessionId: row.sessionId,
      });
    }
  }

  return {
    challenge,
    sessions,
  };
};

export const deleteChallenge = async (id, userId) => {
  const challenge = await challengeRepository.findById(id);
  if (!challenge || !challenge.isActive) {
    throw new ApiError(404, "Challenge not found or inactive");
  }

  if (challenge.createdBy.toString() !== userId.toString()) {
    throw new ApiError(403, "Only creator can delete challenge");
  }

  if (challenge.roomStatus !== "waiting") {
    throw new ApiError(400, "Started or completed challenge cannot be deleted");
  }

  await challengeRepository.updateById(id, { isActive: false });
  return { challengeId: id, deleted: true };
};

export const getChallengeYourFriendsTests = async () => {
  const result = await testRepository.findAllTests(
    {},
    {
      page: 1,
      limit: 1000,
      applicableFor: "challenge_yourfriends",
      isPublished: true,
      sortBy: "createdAt",
      sortOrder: "desc",
    }
  );
  return result.tests;
};

export const getCompletedChallenges = async (userId, options = {}) => {
  const { page = 1, limit = 10 } = options;
  const pageNum = parseInt(page, 10) || 1;
  const limitNum = parseInt(limit, 10) || 10;
  const skip = (pageNum - 1) * limitNum;

  const challenges = await challengeRepository.find(
    { createdBy: userId, isActive: true },
    {
      populate: [
        { path: "test", select: "title durationMinutes" },
        { path: "participants.student", select: "name email" },
      ],
      sort: { updatedAt: -1 },
      skip: 0,
      limit: 1000,
    }
  );

  const completed = [];
  for (const challenge of challenges) {
    const updated = await syncChallengeCompletion(challenge);
    if (updated.roomStatus !== "completed") continue;

    const stats = await getParticipantStats(updated, userId);
    completed.push({
      challengeId: updated._id,
      challengeName: updated.title,
      roomCode: updated.roomCode,
      test: updated.test,
      completedAt: updated.completedAt,
      ...stats,
    });
  }

  const paged = completed.slice(skip, skip + limitNum);
  return {
    challenges: paged,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total: completed.length,
      pages: Math.ceil(completed.length / limitNum) || 1,
    },
  };
};

export default {
  createChallenge,
  getChallenges,
  joinChallengeByCode,
  startChallenge,
  deleteChallenge,
  getChallengeYourFriendsTests,
  getCompletedChallenges,
};

