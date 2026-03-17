import testRepository from "../repository/test.repository.js";
import questionBankRepository from "../repository/questionBank.repository.js";
import challengeYourselfProgressRepository from "../repository/challengeYourselfProgress.repository.js";

/**
 * 6 stages: Bronze (1), Silver (5), Gold (10), Platinum (15), Diamond (20), Heroic (25) levels.
 * Bronze uses everyday challenge pool (easy). Rest use challenge-yourself pool by difficulty mix.
 */
const STAGES = [
  { name: "Bronze", levels: 1, useEverydayPool: true, easy: 1, medium: 0, hard: 0 },
  { name: "Silver", levels: 5, useEverydayPool: false, easy: 3, medium: 2, hard: 0 },
  { name: "Gold", levels: 10, useEverydayPool: false, easy: 4, medium: 4, hard: 2 },
  { name: "Platinum", levels: 15, useEverydayPool: false, easy: 5, medium: 5, hard: 5 },
  { name: "Diamond", levels: 20, useEverydayPool: false, easy: 6, medium: 7, hard: 7 },
  { name: "Heroic", levels: 25, useEverydayPool: false, easy: 8, medium: 8, hard: 9 },
];

/**
 * Simple string hash for deterministic selection
 */
const hashString = (str) => {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h << 5) - h + str.charCodeAt(i);
    h = h & h;
  }
  return Math.abs(h);
};

/**
 * Deterministic sample: pick `count` items from `arr` using seed.
 * Without replacement when count <= arr.length; with repetition when count > arr.length.
 */
const deterministicSample = (arr, count, seed) => {
  if (!arr || arr.length === 0) return [];
  if (count <= 0) return [];
  const result = [];
  if (count > arr.length) {
    for (let i = 0; i < count; i++) {
      result.push(arr[hashString(seed + String(i)) % arr.length]);
    }
    return result;
  }
  const indices = [...Array(arr.length).keys()];
  for (let i = 0; i < count; i++) {
    const j = i + (hashString(seed + String(i)) % (indices.length - i));
    [indices[i], indices[j]] = [indices[j], indices[i]];
    result.push(arr[indices[i]]);
  }
  return result;
};

/**
 * Get date seed (YYYY-MM-DD UTC) for deterministic daily challenge layout
 */
const getDateSeed = () => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
};

/**
 * Build levels for one stage: each level has a test ID (or null if pool empty).
 */
const buildStageLevels = (stage, pools, dateSeed) => {
  const levels = [];
  const { name, levels: levelCount, useEverydayPool, easy: e, medium: m, hard: h } = stage;
  const pool = useEverydayPool ? pools.everyday : pools.challengeYourself;
  const order = [];
  for (let i = 0; i < e; i++) order.push("easy");
  for (let i = 0; i < m; i++) order.push("medium");
  for (let i = 0; i < h; i++) order.push("hard");
  const seedBase = dateSeed + name;
  for (let i = 0; i < levelCount; i++) {
    const diff = order[i] || "easy";
    const poolArr = pool[diff] || [];
    const sampled = deterministicSample(poolArr, 1, seedBase + i);
    levels.push({ level: i + 1, testId: sampled[0] || null, difficulty: diff });
  }
  return levels;
};

/**
 * Get today's layout (stage/level -> testId) and reverse map (testId -> { stage, level }).
 */
export const getLayoutForDate = async (dateSeed) => {
  const [everydayByDiff, challengeByDiff] = await Promise.all([
    testRepository.findEverydayChallengeTestsByDifficulty(),
    testRepository.findChallengeYourselfTestsByDifficulty(),
  ]);
  const pools = { everyday: everydayByDiff, challengeYourself: challengeByDiff };
  const stagesWithLevels = STAGES.map((stage) => {
    const levels = buildStageLevels(stage, pools, dateSeed);
    return { name: stage.name, totalLevels: stage.levels, levels };
  });
  const testIdToSlot = new Map();
  stagesWithLevels.forEach((s) => {
    s.levels.forEach((lev) => {
      if (lev.testId) testIdToSlot.set(lev.testId.toString(), { stage: s.name, level: lev.level });
    });
  });
  return { stagesWithLevels, testIdToSlot };
};

/**
 * Get (stage, level) for a test in today's challenge-yourself layout, or null.
 */
export const getSlotForTest = async (testId) => {
  const dateSeed = getDateSeed();
  const { testIdToSlot } = await getLayoutForDate(dateSeed);
  return testIdToSlot.get(testId?.toString?.()) || null;
};

/**
 * Check if (stage, level) is unlocked: all previous levels in stage have full marks, and previous stage is fully complete.
 */
export const isLevelUnlocked = async (studentId, stageName, levelNum) => {
  const progressList = await challengeYourselfProgressRepository.findByStudent(studentId);
  const progressMap = new Map();
  progressList.forEach((p) => {
    const key = `${p.stage}:${p.level}`;
    progressMap.set(key, p);
  });
  const getProgress = (stage, level) => progressMap.get(`${stage}:${level}`);

  const stageIndex = STAGES.findIndex((s) => s.name === stageName);
  if (stageIndex < 0) return false;
  const stageConfig = STAGES[stageIndex];

  for (let l = 1; l < levelNum; l++) {
    const p = getProgress(stageName, l);
    if (!p?.fullMarksAchieved) return false;
  }
  if (levelNum === 1 && stageIndex > 0) {
    const prevStage = STAGES[stageIndex - 1];
    for (let l = 1; l <= prevStage.levels; l++) {
      const p = getProgress(prevStage.name, l);
      if (!p?.fullMarksAchieved) return false;
    }
  }
  return true;
};

/**
 * Record progress when a challenge-yourself (or Bronze everyday) test is completed. Full marks unlocks next level/stage.
 */
export const recordProgress = async (studentId, session) => {
  const testId = session.test?._id || session.test;
  const slot = await getSlotForTest(testId);
  if (!slot) return;
  const score = session.score ?? 0;
  const maxScore = session.maxScore ?? 0;
  const fullMarks = maxScore > 0 && score >= maxScore;
  const existing = await challengeYourselfProgressRepository.findOne({
    student: studentId,
    stage: slot.stage,
    level: slot.level,
  });
  const alreadyFull = existing?.fullMarksAchieved;
  await challengeYourselfProgressRepository.upsert(studentId, slot.stage, slot.level, {
    fullMarksAchieved: alreadyFull || fullMarks,
    bestScore: existing ? Math.max(existing.bestScore, score) : score,
    maxScore,
    lastExamSession: session._id,
    lastCompletedAt: new Date(),
  });
};

/**
 * GET challenge-yourself: 6 stages with levels, tests, unlocked, and completedWithFullMarks.
 */
export const getChallengeYourself = async (studentId) => {
  const dateSeed = getDateSeed();
  const { stagesWithLevels, testIdToSlot } = await getLayoutForDate(dateSeed);

  const progressList = studentId ? await challengeYourselfProgressRepository.findByStudent(studentId) : [];
  const progressMap = new Map();
  progressList.forEach((p) => progressMap.set(`${p.stage}:${p.level}`, p));

  const allTestIds = stagesWithLevels.flatMap((s) =>
    s.levels.map((l) => l.testId).filter(Boolean)
  );
  const uniqueIds = [...new Set(allTestIds.map((id) => id.toString()))];
  if (uniqueIds.length === 0) {
    const withUnlock = stagesWithLevels.map((stage) => ({
      ...stage,
      levels: stage.levels.map((lev) => ({
        level: lev.level,
        difficulty: lev.difficulty,
        testId: lev.testId,
        test: null,
        unlocked: lev.level === 1 && stage.name === "Bronze",
        completedWithFullMarks: false,
      })),
    }));
    return { stages: withUnlock };
  }

  const tests = await Promise.all(
    uniqueIds.map((id) =>
      testRepository.findTestById(id, { questionBank: "name categories" })
    )
  );
  const testMap = new Map(tests.filter(Boolean).map((t) => [t._id.toString(), t]));
  await enrichTestsWithBankStats([...testMap.values()]);

  const stagesWithTests = await Promise.all(
    stagesWithLevels.map(async (stage) => ({
      ...stage,
      levels: await Promise.all(
        stage.levels.map(async (lev) => {
          const test = lev.testId ? testMap.get(lev.testId.toString()) : null;
          const testObj = test ? (test.toObject ? test.toObject() : { ...test }) : null;
          if (testObj) delete testObj.createdBy;
          const unlocked = studentId
            ? await isLevelUnlocked(studentId, stage.name, lev.level)
            : lev.level === 1 && stage.name === "Bronze";
          const progress = studentId ? progressMap.get(`${stage.name}:${lev.level}`) : null;
          return {
            level: lev.level,
            difficulty: lev.difficulty,
            test: testObj,
            unlocked,
            completedWithFullMarks: !!progress?.fullMarksAchieved,
          };
        })
      ),
    }))
  );

  return { stages: stagesWithTests };
};

async function enrichTestsWithBankStats(testList) {
  const bankIds = testList
    .map((t) => t?.questionBank?._id)
    .filter(Boolean)
    .map((id) => id.toString());
  const uniqueIds = [...new Set(bankIds)];
  if (uniqueIds.length === 0) return;
  const statsMap = await questionBankRepository.getBanksStatsBatch(uniqueIds);
  testList.forEach((t) => {
    if (t?.questionBank?._id) {
      const key = t.questionBank._id.toString();
      const stats = statsMap.get(key) || { totalQuestions: 0, totalMarks: 0 };
      t.questionBank.totalQuestions = stats.totalQuestions;
      t.questionBank.totalMarks = stats.totalMarks;
    }
  });
}

export default {
  getChallengeYourself,
  getLayoutForDate,
  getSlotForTest,
  isLevelUnlocked,
  recordProgress,
  STAGES,
};
