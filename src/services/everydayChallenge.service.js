import testRepository from "../repository/test.repository.js";
import everydayChallengeCompletionRepository from "../repository/everydayChallengeCompletion.repository.js";
import walletService from "./wallet.service.js";
import questionBankRepository from "../repository/questionBank.repository.js";

const STREAK_DAYS_CYCLE = 7;
const POINTS_PER_DAY = 10;

/**
 * Build the 7-day streak cycle for UI: each day has points and whether it's completed in current streak.
 */
const buildStreakCycle = (streakDays) => {
  return Array.from({ length: STREAK_DAYS_CYCLE }, (_, i) => {
    const day = i + 1;
    return {
      day,
      points: day * POINTS_PER_DAY,
      completed: day <= streakDays,
    };
  });
};

/**
 * Get start of day in UTC for a given date (for consistent "today" across the app)
 */
export const getStartOfDayUTC = (date = new Date()) => {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
};

/**
 * Simple string hash for deterministic daily challenge selection
 */
const hashDateString = (dateStr) => {
  let hash = 0;
  for (let i = 0; i < dateStr.length; i++) {
    const char = dateStr.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
};

/**
 * Get today's challenge (one random test from everyday challenge pool, same for all users for the day)
 * and student's streak info.
 */
export const getTodaysChallenge = async (studentId) => {
  const testIds = await testRepository.findEverydayChallengeTestIds();
  if (!testIds || testIds.length === 0) {
    return {
      challenge: null,
      streakDays: 0,
      completedToday: false,
      nextPoints: POINTS_PER_DAY,
      nextStreakDay: 1,
      streakCycle: buildStreakCycle(0),
    };
  }

  const today = getStartOfDayUTC();
  const dateStr = today.toISOString().slice(0, 10);
  const index = hashDateString(dateStr) % testIds.length;
  const selectedTestId = testIds[index];

  const test = await testRepository.findTestById(selectedTestId, {
    questionBank: "name categories",
  });
  if (!test) {
    return {
      challenge: null,
      streakDays: 0,
      completedToday: false,
      nextPoints: POINTS_PER_DAY,
      nextStreakDay: 1,
      streakCycle: buildStreakCycle(0),
    };
  }

  const completions = await everydayChallengeCompletionRepository.findLatestByStudent(
    studentId,
    8
  );
  const todayStr = dateStr;
  const completedTodayRecord = completions.find(
    (c) => getStartOfDayUTC(c.date).toISOString().slice(0, 10) === todayStr
  );
  const completedToday = !!completedTodayRecord;

  let streakDays = 0;
  let nextStreakDay = 1;
  if (completions.length > 0) {
    const mostRecent = completions[0];
    const mostRecentDayStr = getStartOfDayUTC(mostRecent.date).toISOString().slice(0, 10);
    const yesterday = new Date(today);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    const yesterdayStr = yesterday.toISOString().slice(0, 10);

    if (mostRecentDayStr === todayStr) {
      streakDays = mostRecent.streakDay;
      nextStreakDay = mostRecent.streakDay === 7 ? 1 : mostRecent.streakDay + 1;
    } else if (mostRecentDayStr === yesterdayStr) {
      streakDays = mostRecent.streakDay;
      nextStreakDay = mostRecent.streakDay === 7 ? 1 : mostRecent.streakDay + 1;
    }
  }

  const nextPoints = nextStreakDay * POINTS_PER_DAY;

  if (test.questionBank?._id) {
    const statsMap = await questionBankRepository.getBanksStatsBatch([
      test.questionBank._id.toString(),
    ]);
    const key = test.questionBank._id.toString();
    const stats = statsMap.get(key) || { totalQuestions: 0, totalMarks: 0 };
    test.questionBank.totalQuestions = stats.totalQuestions;
    test.questionBank.totalMarks = stats.totalMarks;
  }

  const challenge = test.toObject ? test.toObject() : { ...test };
  delete challenge.createdBy;

  return {
    challenge,
    streakDays,
    completedToday,
    nextPoints,
    nextStreakDay,
    streakCycle: buildStreakCycle(streakDays),
  };
};

/**
 * Compute next streak day and points for a completion. Used when recording completion.
 */
const getNextStreakState = (lastCompletion, today) => {
  const todayStr = getStartOfDayUTC(today).toISOString().slice(0, 10);
  const yesterday = new Date(today);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const yesterdayStr = yesterday.toISOString().slice(0, 10);

  if (!lastCompletion) {
    return { streakDay: 1, points: POINTS_PER_DAY };
  }

  const lastDayStr = getStartOfDayUTC(lastCompletion.date).toISOString().slice(0, 10);
  if (lastDayStr === todayStr) {
    return null;
  }
  if (lastDayStr === yesterdayStr) {
    const nextDay = lastCompletion.streakDay === 7 ? 1 : lastCompletion.streakDay + 1;
    return { streakDay: nextDay, points: nextDay * POINTS_PER_DAY };
  }
  return { streakDay: 1, points: POINTS_PER_DAY };
};

/**
 * Record everyday challenge completion after a student submits an everyday challenge test.
 * Awards streak-based points (10, 20, ..., 70) and resets streak if a day was missed.
 */
export const recordCompletion = async (studentId, session) => {
  const testId = session.test?._id || session.test;
  const test = await testRepository.findTestById(testId);
  if (!test || test.applicableFor !== "everyday_challenge") {
    return null;
  }

  const today = getStartOfDayUTC();
  const existing = await everydayChallengeCompletionRepository.findOne({
    student: studentId,
    date: today,
  });
  if (existing) {
    return null;
  }

  const completions = await everydayChallengeCompletionRepository.findLatestByStudent(
    studentId,
    1
  );
  const last = completions[0] || null;
  const state = getNextStreakState(last, new Date());
  if (!state) {
    return null;
  }

  const completion = await everydayChallengeCompletionRepository.create({
    student: studentId,
    date: today,
    test: testId,
    examSession: session._id,
    pointsEarned: state.points,
    streakDay: state.streakDay,
  });

  await walletService.addRewardPoints(
    studentId,
    state.points,
    "everyday_challenge",
    `Everyday challenge completed (Day ${state.streakDay} streak)`,
    completion._id,
    "EverydayChallenge"
  );

  return { completion, pointsEarned: state.points, streakDay: state.streakDay };
};

export default {
  getStartOfDayUTC,
  getTodaysChallenge,
  recordCompletion,
  STREAK_DAYS_CYCLE,
  POINTS_PER_DAY,
};
