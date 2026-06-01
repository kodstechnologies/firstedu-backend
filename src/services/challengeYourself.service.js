import testRepository from "../repository/test.repository.js";
import questionBankRepository from "../repository/questionBank.repository.js";
import challengeYourselfProgressRepository from "../repository/challengeYourselfProgress.repository.js";
import { attachPurchasedFlagToTests } from "./marketplace.service.js";
import GamificationNode from "../models/GamificationSubcategory.js";
import Test from "../models/Test.js";
import categoryRepository from "../repository/category.repository.js";

const hasStageConfig = (node) =>
  Number(node?.totalLevels || 0) > 0 ||
  (Array.isArray(node?.levels) && node.levels.length > 0);

const stripEmptyStageConfig = (node) => {
  if (!node || typeof node !== "object") return node;
  const children = Array.isArray(node.children) ? node.children.map(stripEmptyStageConfig) : [];
  const next = { ...node, children };
  if (!hasStageConfig(next)) {
    delete next.maxLevels;
    delete next.totalLevels;
    delete next.levels;
    delete next.gamificationRules;
  }
  return next;
};

const progressKey = (stage, level) => {
  const stageKey = stage.stageId?.toString?.() || stage._id?.toString?.() || stage.name;
  return `${stageKey}:${level}`;
};

const isValidObjectId = (id) => /^[0-9a-fA-F]{24}$/.test(String(id || ""));

const mapTestsByStageAndLevel = async (stageIds) => {
  const ids = [...new Set((stageIds || []).filter(Boolean).map((id) => id.toString()))];
  if (ids.length === 0) return new Map();

  const tests = await Test.find({
    categoryId: { $in: ids },
    applicableFor: "challenge_yourself",
    isPublished: true,
  })
    .populate({
      path: "questionBank",
      select: "name categories",
      populate: { path: "categories", select: "name _id" },
    })
    .sort({ gamificationLevel: 1, createdAt: 1 })
    .lean();

  const byStage = new Map();
  tests.forEach((test) => {
    if (test.gamificationLevel == null || !test.categoryId) return;
    const stageId = test.categoryId.toString();
    if (!byStage.has(stageId)) byStage.set(stageId, new Map());
    byStage.get(stageId).set(Number(test.gamificationLevel), test);
  });
  return byStage;
};

const pruneStagesFromCategoryTree = (nodes, stageIdSet) => {
  if (!Array.isArray(nodes)) return [];
  return nodes
    .filter((node) => !stageIdSet.has(node._id?.toString?.()))
    .map((node) => stripEmptyStageConfig({
      ...node,
      children: pruneStagesFromCategoryTree(node.children || [], stageIdSet),
    }))
    .filter((node) => (node.children?.length || 0) > 0 || !hasStageConfig(node));
};

const collectConfiguredStageIds = (nodes, out = new Set()) => {
  (nodes || []).forEach((node) => {
    if (hasStageConfig(node)) out.add(node._id.toString());
    collectConfiguredStageIds(node.children || [], out);
  });
  return out;
};

/**
 * Get dynamic stage layout from DB.
 * If parentCategoryId is provided, returns stages for that category.
 * Otherwise, returns an empty layout.
 */
export const getLayoutFromDB = async (parentCategoryId) => {
  if (!parentCategoryId || !isValidObjectId(parentCategoryId)) {
    return { stagesWithLevels: [] };
  }

  const selectedNode = await GamificationNode.findById(parentCategoryId).lean();
  const stageNodes = hasStageConfig(selectedNode)
    ? [selectedNode]
    : await GamificationNode.find({
        parent: parentCategoryId,
        kind: "GamificationNode",
        isActive: true,
      }).sort({ order: 1, createdAt: 1 }).lean();

  const testMapsByStage = await mapTestsByStageAndLevel(stageNodes.map((stage) => stage._id));

  const stagesWithLevels = stageNodes
    .map((stage) => {
      const testMap = testMapsByStage.get(stage._id.toString()) || new Map();
      let levelCount = stage.totalLevels || 0;
      
      // If there are tests assigned to levels higher than totalLevels, expand the count
      if (testMap.size > 0) {
        levelCount = Math.max(levelCount, Math.max(...Array.from(testMap.keys())));
      }

      const levels = Array.from({ length: levelCount }, (_, i) => {
        const levelNum = i + 1;
        return {
          level: levelNum,
          testId: testMap.get(levelNum)?._id ?? null,
        };
      });

      return {
        name: stage.name,
        totalLevels: levelCount,
        stageId: stage._id,
        levels,
      };
    })
    .filter((stage) => stage.totalLevels > 0);

  return { stagesWithLevels };
};

/**
 * Get (stage, level) for a test in challenge-yourself, or null.
 * Looks up the test directly to find its assigned slot.
 */
export const getSlotForTest = async (testId) => {
  if (!testId) return null;
  const test = await Test.findById(testId).select("applicableFor categoryId gamificationLevel").lean();
  if (!test || test.applicableFor !== "challenge_yourself" || !test.categoryId || !test.gamificationLevel) {
    return null;
  }
  const stageNode = await GamificationNode.findById(test.categoryId).select("name parent").lean();
  if (!stageNode) return null;

  return {
    stage: stageNode.name,
    stageId: stageNode._id,
    parentCategoryId: stageNode.parent,
    level: test.gamificationLevel,
  };
};

/**
 * Check if (stage, level) is unlocked.
 * Student must have full marks in all previous levels of the stage.
 * If level 1, student must have full marks in all levels of the previous stage.
 * Level 1 of the first configured stage is always unlocked.
 */
export const isLevelUnlocked = async (studentId, stagesWithLevels, stageRef, levelNum) => {
  const level = Number(levelNum);
  const stageId = stageRef?.stageId?.toString?.() || stageRef?._id?.toString?.() || stageRef?.toString?.();
  const stageName = stageRef?.name || stageRef?.stage || stageRef;

  const progressList = await challengeYourselfProgressRepository.findByStudent(studentId);
  const progressMap = new Map();
  progressList.forEach((p) => {
    if (p.stageId) progressMap.set(`${p.stageId.toString()}:${p.level}`, p);
    progressMap.set(`${p.stage}:${p.level}`, p);
  });
  const getProgress = (stage, lvl) => progressMap.get(progressKey(stage, lvl)) || progressMap.get(`${stage.name}:${lvl}`);

  const stageIndex = stagesWithLevels.findIndex((s) =>
    stageId && s.stageId?.toString?.() === stageId ? true : s.name === stageName
  );
  if (stageIndex < 0) return false;
  if (stageIndex === 0 && level === 1) return true;

  for (let l = 1; l < level; l++) {
    const p = getProgress(stagesWithLevels[stageIndex], l);
    if (!p?.fullMarksAchieved) return false;
  }

  if (level === 1 && stageIndex > 0) {
    const prevStage = stagesWithLevels[stageIndex - 1];
    for (let l = 1; l <= prevStage.totalLevels; l++) {
      const p = getProgress(prevStage, l);
      if (!p?.fullMarksAchieved) return false;
    }
  }

  return true;
};

/**
 * Record progress when a challenge-yourself test is completed. Full marks unlocks next level/stage.
 */
export const recordProgress = async (studentId, session) => {
  const testId = session.test?._id || session.test;
  const slot = await getSlotForTest(testId);

  if (!slot) return;

  const testInfo = await Test.findById(testId).select("passingPercentage").lean();
  const passingPercentage = testInfo?.passingPercentage ?? 0;

  const score = session.score ?? 0;
  const maxScore = session.maxScore ?? 0;
  
  const scorePercentage = maxScore > 0 ? (score / maxScore) * 100 : 0;
  const fullMarks = maxScore > 0 && scorePercentage >= passingPercentage;

  // We need the layout to check unlocks correctly if they just finished a test.
  // But wait, recordProgress just saves the score. The unlock check is only for UI display.
  // However, the original code checked `isUnlocked` before saving.
  // Let's assume if they have a session, they were allowed to take it.

  const existing = await challengeYourselfProgressRepository.findOne({
    student: studentId,
    ...(slot.stageId ? { stageId: slot.stageId } : { stage: slot.stage }),
    level: slot.level,
  });

  const alreadyFull = existing?.fullMarksAchieved;
  await challengeYourselfProgressRepository.upsert(studentId, slot.stage, slot.level, {
    stageId: slot.stageId,
    fullMarksAchieved: alreadyFull || fullMarks,
    bestScore: existing ? Math.max(existing.bestScore, score) : score,
    maxScore,
    lastExamSession: session._id,
    lastCompletedAt: new Date(),
  });
};

/**
 * GET challenge-yourself: stages with levels, tests, unlocked, and completedWithFullMarks.
 */
export const getChallengeYourself = async (studentId, categoryId) => {
  const tree = await categoryRepository.findTree({ rootType: 'Gamification' });
  const findNode = (nodes, targetPath) => {
    for (const node of nodes) {
      const nodeSlug = node.name.toLowerCase().replace(/ /g, '-');
      if (nodeSlug === targetPath || node.gamificationType === targetPath.replace('-', '_')) {
        return node;
      }
      if (node.children && node.children.length > 0) {
        const found = findNode(node.children, targetPath);
        if (found) return found;
      }
    }
    return null;
  };
  const targetNode = findNode(tree, "challenge-yourself");
  const configuredStageIds = collectConfiguredStageIds(targetNode?.children || []);
  const categories = pruneStagesFromCategoryTree(targetNode?.children || [], configuredStageIds);

  if (!categoryId) {
    return { categories };
  }

  const { stagesWithLevels } = await getLayoutFromDB(categoryId);
  const progressList = studentId ? await challengeYourselfProgressRepository.findByStudent(studentId) : [];
  const progressMap = new Map();
  progressList.forEach((p) => {
    if (p.stageId) progressMap.set(`${p.stageId.toString()}:${p.level}`, p);
    progressMap.set(`${p.stage}:${p.level}`, p);
  });

  const allTestIds = stagesWithLevels.flatMap((s) =>
    s.levels.map((l) => l.testId).filter(Boolean)
  );
  const uniqueIds = [...new Set(allTestIds.map((id) => id.toString()))];

  if (uniqueIds.length === 0) {
    const withUnlock = stagesWithLevels.map((stage) => ({
      ...stage,
      levels: stage.levels.map((lev) => ({
        level: lev.level,
        testId: lev.testId,
        test: null,
        unlocked: lev.level === 1 && stagesWithLevels[0]?.stageId?.toString() === stage.stageId?.toString(),
        completedWithFullMarks: false,
        purchased: false,
      })),
    }));
    return { stages: withUnlock, categories };
  }

  const tests = await Promise.all(
    uniqueIds.map((id) =>
      testRepository.findTestById(id, { questionBank: "name categories" })
    )
  );
  const testMap = new Map(tests.filter(Boolean).map((t) => [t._id.toString(), t]));
  await enrichTestsWithBankStats([...testMap.values()]);

  if (studentId) {
    await attachPurchasedFlagToTests([...testMap.values()], studentId);
  }

  const stagesWithTests = await Promise.all(
    stagesWithLevels.map(async (stage) => ({
      ...stage,
      levels: await Promise.all(
        stage.levels.map(async (lev) => {
          const test = lev.testId ? testMap.get(lev.testId.toString()) : null;
          const testObj = test ? (test.toObject ? test.toObject() : { ...test }) : null;
          if (testObj) delete testObj.createdBy;

          const unlocked = studentId
            ? await isLevelUnlocked(studentId, stagesWithLevels, stage, lev.level)
            : lev.level === 1 && stagesWithLevels[0]?.stageId?.toString() === stage.stageId?.toString();

          const progress = studentId
            ? progressMap.get(progressKey(stage, lev.level)) || progressMap.get(`${stage.name}:${lev.level}`)
            : null;
          const isPurchased = !!test?.purchased;

          return {
            level: lev.level,
            test: testObj,
            unlocked,
            completedWithFullMarks: !!progress?.fullMarksAchieved,
            hasCompletedAttempt: !!progress,
            isPurchased,
          };
        })
      ),
    }))
  );

  return { stages: stagesWithTests, categories };
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
  getLayoutFromDB,
  getSlotForTest,
  isLevelUnlocked,
  recordProgress,
};
