import { ApiError } from "../utils/ApiError.js";
import challengeRepository from "../repository/challenge.repository.js";
import testRepository from "../repository/test.repository.js";
import examSessionRepository from "../repository/examSession.repository.js";
import examSessionService, { checkStudentAccessForPaidTest } from "./examSession.service.js";
import orderRepository from "../repository/order.repository.js";
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

export const syncChallengeCompletionById = async (challengeId) => {
  const challenge = await challengeRepository.findById(challengeId);
  return await syncChallengeCompletion(challenge);
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

  // Paid tests: only allow room creation if the creator purchased.
  if (test.price > 0) {
    const access = await checkStudentAccessForPaidTest(testId, userId);
    if (!access.hasAccess) {
      throw new ApiError(403, "Please purchase this test from the Resource Store, then you can create/start a challenge room.");
    }
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

  // Validate if the test is paid and the user has purchased it before joining
  // (Purchase check for friends has been removed so they can join freely)

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

  // Paid tests: prevent partial starts by ensuring all participants purchased.
  // (Purchase check for participants has been removed so they can start freely)

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

export const getChallengeYourFriendsTests = async (userId = null, options = {}) => {
  const { page = 1, limit = 10, search = "", categoryIds = [] } = options;
  if (!userId) return { tests: [], pagination: { total: 0, page: 1, limit: 10, pages: 1 } };
  
  const purchases = await orderRepository.findTestPurchasesForExamHall(userId);

  const testsMap = new Map();
  purchases.forEach((p) => {
    if (p.test) {
      testsMap.set(p.test._id.toString(), { test: p.test, purchased: true });
    }
    if (p.testBundle && p.testBundle.tests?.length) {
      p.testBundle.tests.forEach((t) => {
        if (t && t._id) testsMap.set(t._id.toString(), { test: t, purchased: true });
      });
    }
  });

  // Also include all tests added to Gamification -> "Challenge Your Friend"
  const gamificationTestsResult = await testRepository.findAllTests(
    { applicableFor: "challenge_your_friend", isPublished: true },
    { limit: 1000 }
  );

  if (gamificationTestsResult && gamificationTestsResult.tests) {
    gamificationTestsResult.tests.forEach((t) => {
      const idStr = t._id.toString();
      if (!testsMap.has(idStr)) {
        testsMap.set(idStr, { test: t, purchased: false });
      }
    });
  }

  let tests = Array.from(testsMap.values()).map(item => {
    const t = item.test?.toObject ? item.test.toObject() : { ...item.test };
    t._isPurchasedByStudent = item.purchased; // Temporarily store purchase status
    return t;
  });

  // Fetch full details (applicableFor and categoryId) for all these tests
  const testIds = tests.map(t => t._id);
  const fullTestsData = await (await import("../models/Test.js")).default.find({ _id: { $in: testIds } })
    .select("applicableFor categoryId")
    .populate("categoryId", "rootType name gamificationType")
    .lean();

  const fullTestsMap = new Map(fullTestsData.map(t => [t._id.toString(), t]));

  // Filter out tests that shouldn't appear in "Challenge Your Friend"
  tests = tests.filter(t => {
    const fullTest = fullTestsMap.get(t._id.toString());
    if (!fullTest) return true;

    // 1. Exclude Gamification -> Challenge Yourself (by applicableFor, gamificationType, or name)
    if (fullTest.applicableFor === "challenge_yourself") return false;
    if (fullTest.categoryId && typeof fullTest.categoryId === 'object') {
      if (fullTest.categoryId.gamificationType === "challenge_yourself") return false;
      if (fullTest.categoryId.name === "Challenge Yourself") return false;
    }

    // 2. Exclude Olympiads
    if (fullTest.applicableFor === "Olympiads") return false;

    // 3. Exclude if the test belongs to an Olympiad category or subcategory
    if (fullTest.categoryId && typeof fullTest.categoryId === 'object' && fullTest.categoryId.rootType === "Olympiads") return false;
    
    return true;
  });

  if (search) {
    const s = search.toLowerCase();
    tests = tests.filter(t => t.title?.toLowerCase().includes(s) || t.description?.toLowerCase().includes(s));
  }

  if (categoryIds && categoryIds.length > 0) {
    const activeCats = Array.isArray(categoryIds) ? categoryIds : [categoryIds];
    tests = tests.filter(t => {
      const testCatIds = [
        ...(Array.isArray(t.questionBank?.categories) ? t.questionBank.categories : []),
        t.categoryId,
        t.category,
      ].filter(Boolean).map(c => typeof c === 'object' ? String(c._id ?? c.id ?? c) : String(c));
      return testCatIds.some(id => activeCats.includes(id));
    });
  }

  const total = tests.length;
  const pageNum = parseInt(page, 10) || 1;
  const limitNum = parseInt(limit, 10) || 10;
  const skip = (pageNum - 1) * limitNum;

  const pagedTests = tests.slice(skip, skip + limitNum);

  const addPurchaseMeta = (test) => {
    const purchased = test._isPurchasedByStudent;
    delete test._isPurchasedByStudent;
    
    const price = Number(test?.price) || 0;
    const requiresPurchase = price > 0 && !purchased;
    return {
      ...test,
      purchased: !!purchased,
      requiresPurchase,
      purchaseMessage: requiresPurchase
        ? "Please purchase this test from the Resource Store, then you can create/start a challenge room."
        : null,
    };
  };

  return {
    tests: pagedTests.map((test) => addPurchaseMeta(test)),
    pagination: {
      total,
      page: pageNum,
      limit: limitNum,
      pages: Math.ceil(total / limitNum) || 1,
    }
  };
};

export const getCompletedChallenges = async (userId, options = {}) => {
  const { page = 1, limit = 10 } = options;
  const pageNum = parseInt(page, 10) || 1;
  const limitNum = parseInt(limit, 10) || 10;
  const skip = (pageNum - 1) * limitNum;

  const challenges = await challengeRepository.find(
    {
      $or: [{ createdBy: userId }, { "participants.student": userId }],
      isActive: true,
    },
    {
      populate: [
        { path: "test", select: "title durationMinutes" },
        { path: "participants.student", select: "name email" },
        { path: "createdBy", select: "name email" },
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
    
    const creatorId = updated.createdBy?._id ?? updated.createdBy;
    const isCreator = creatorId?.toString() === userId.toString();

    completed.push({
      challengeId: updated._id,
      challengeName: updated.title,
      roomCode: updated.roomCode,
      test: updated.test,
      completedAt: updated.completedAt,
      isCreator,
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
  const isParticipant = challenge.participants.some(
    (p) => p.student?._id?.toString() === userId.toString() || p.student?.toString() === userId.toString()
  );

  if (creatorId?.toString() !== userId.toString() && !isParticipant) {
    throw new ApiError(404, "Completed challenge not found");
  }

  const updated = await syncChallengeCompletion(challenge);
  
  if (updated.roomStatus === "waiting") {
    throw new ApiError(404, "Challenge has not started yet");
  }

  const stats = await getParticipantStats(updated, userId);

  const c = updated.toObject ? updated.toObject() : updated;
  const isCreator = creatorId?.toString() === userId.toString();

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
    isCreator,
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
  syncChallengeCompletionById,
};

