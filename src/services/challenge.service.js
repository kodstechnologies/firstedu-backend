import { ApiError } from "../utils/ApiError.js";
import challengeRepository from "../repository/challenge.repository.js";
import testRepository from "../repository/test.repository.js";
import examSessionRepository from "../repository/examSession.repository.js";
import examSessionService from "./examSession.service.js";
import { getIO } from "../socket/socketGateway.js";
import User from "../models/Student.js";

const ROOM_CODE_LENGTH = 6;
const ROOM_CODE_MAX_TRIES = 10;

const generateNumericCode = () =>
  Math.floor(10 ** (ROOM_CODE_LENGTH - 1) + Math.random() * 9 * 10 ** (ROOM_CODE_LENGTH - 1)).toString();

const escapeRegex = (value = "") => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

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
  rankings.forEach((entry) => {
    rankByStudentId.set(entry.student?.toString(), entry);
  });

  const participants = challenge.participants.map((p) => {
    const student = p.student?._id ? p.student : { _id: p.student };
    const sid = student._id?.toString();
    const ranking = rankByStudentId.get(sid);
    return {
      studentId: student._id,
      name: student.name || ranking?.name || null,
      email: student.email || ranking?.email || null,
      score: ranking?.score ?? null,
      maxScore: ranking?.maxScore ?? null,
      completedAt: ranking?.completedAt ?? null,
      rank: null,
      joinedAt: p.joinedAt,
    };
  });

  const scoredSorted = participants
    .filter((p) => p.score != null)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const ta = new Date(a.completedAt || 0).getTime();
      const tb = new Date(b.completedAt || 0).getTime();
      return ta - tb;
    });

  for (let i = 0; i < scoredSorted.length; i++) {
    scoredSorted[i].rank =
      i > 0 && scoredSorted[i].score === scoredSorted[i - 1].score
        ? scoredSorted[i - 1].rank
        : i + 1;
  }

  const rankByStudent = new Map(scoredSorted.map((p) => [p.studentId?.toString(), p.rank]));
  participants.forEach((p) => {
    const r = rankByStudent.get(p.studentId?.toString());
    if (r != null) p.rank = r;
  });

  const myStats = participants.find(
    (p) => p.studentId?.toString?.() === currentUserId?.toString?.()
  ) || { score: null, rank: null };

  const highestScore = scoredSorted.length ? scoredSorted[0].score : null;

  return {
    myScore: myStats.score ?? null,
    myRank: myStats.rank ?? null,
    highestScore,
    totalParticipants: participants.length,
    participants,
    leaderboard: scoredSorted.map((p) => ({
      rank: p.rank,
      studentId: p.studentId,
      name: p.name,
      email: p.email,
      score: p.score,
      maxScore: p.maxScore,
      completedAt: p.completedAt,
    })),
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
    roomStatus: { $ne: "completed" },
  };
  const normalizedSearch = typeof search === "string" ? search.trim() : "";
  if (normalizedSearch) {
    const safeSearch = escapeRegex(normalizedSearch);
    query.$and = [{
      $or: [
      { title: { $regex: safeSearch, $options: "i" } },
      { description: { $regex: safeSearch, $options: "i" } },
      { roomCode: { $regex: safeSearch, $options: "i" } },
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

  // Realtime update for room members (host + joined participants watching lobby).
  const io = getIO();
  if (io) {
    const participant = await User.findById(userId).select("_id name email");
    io.of("/challenge").to(`challenge:${challenge.roomCode}`).emit("participant_joined", {
      challengeId: challenge._id.toString(),
      roomCode: challenge.roomCode,
      participant: participant
        ? {
            studentId: participant._id.toString(),
            name: participant.name || null,
            email: participant.email || null,
          }
        : {
            studentId: userId.toString(),
            name: null,
            email: null,
          },
      totalParticipants: challenge.participants.length,
      joinedAt: new Date(),
    });
  }

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
    const examPayload = await examSessionService.startExamSession(
      challenge.test,
      participantId,
      { challengeId: challenge._id }
    );
    // startExamSession returns getExamSession() shape: { session: { id }, questions, palette } — not a raw doc with _id
    const sid = examPayload?.session?.id ?? examPayload?.session?._id;
    sessions.push({
      studentId: participantId.toString(),
      sessionId: sid?.toString?.() ?? null,
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

  const mySessionId = sessions.find(
    (row) => row.studentId?.toString?.() === userId?.toString?.()
  )?.sessionId || null;

  return {
    challenge,
    sessions,
    mySessionId,
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

  const participantIds = challenge.participants
    .map((p) => p.student?.toString?.() ?? p.student)
    .filter(Boolean);
  await challengeRepository.updateById(id, { isActive: false });

  const io = getIO();
  if (io) {
    const payload = {
      challengeId: challenge._id.toString(),
      roomCode: challenge.roomCode,
      deletedBy: userId.toString(),
      timestamp: new Date(),
    };
    const namespace = io.of("/challenge");
    namespace.to(`challenge:${challenge.roomCode}`).emit("challenge_deleted", payload);
    for (const participantId of participantIds) {
      namespace.to(`student:${participantId}`).emit("challenge_deleted", payload);
    }
  }

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

/**
 * Full detail for one completed challenge (creator only; same scope as getCompletedChallenges list).
 */
export const getCompletedChallengeById = async (challengeId, userId) => {
  const challenge = await challengeRepository.findById(challengeId, [
    { path: "test", select: "title description durationMinutes applicableFor isPublished" },
    { path: "createdBy", select: "name email" },
    { path: "participants.student", select: "name email" },
  ]);

  if (!challenge || !challenge.isActive) {
    throw new ApiError(404, "Completed challenge not found");
  }
  const creatorId = challenge.createdBy?._id ?? challenge.createdBy;
  if (creatorId?.toString() !== userId.toString()) {
    throw new ApiError(404, "Completed challenge not found");
  }

  const updated = await syncChallengeCompletion(challenge);
  if (updated.roomStatus !== "completed") {
    throw new ApiError(404, "Completed challenge not found");
  }

  const stats = await getParticipantStats(updated, userId);

  const c = updated.toObject ? updated.toObject() : updated;
  return {
    challengeId: c._id,
    challengeName: c.title,
    description: c.description ?? null,
    roomCode: c.roomCode,
    roomStatus: c.roomStatus,
    startedAt: c.startedAt,
    completedAt: c.completedAt,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    test: c.test,
    createdBy: c.createdBy,
    ...stats,
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
  getCompletedChallengeById,
};

