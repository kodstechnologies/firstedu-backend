import { ApiError } from "../utils/ApiError.js";
import ExamSession from "../models/ExamSession.js";
import TestPurchase from "../models/TestPurchase.js";
import Test from "../models/Test.js";
import Course from "../models/Course.js";
import Teacher from "../models/Teacher.js";
import NeedToImprove from "../models/NeedToImprove.js";

const LOW_SCORE_THRESHOLD = 50; // < 50% = weak
const MAX_PRACTICE_TESTS = 10;
const MAX_VIDEOS = 10;
const MAX_STUDY_MATERIALS = 4;

/**
 * Always recomputes fresh NeedToImprove data for a student.
 * @param {string} studentId
 */
export const getNeedToImprove = async (studentId) => {
  return await computeNeedToImprove(studentId);
};

/**
 * Always recomputes and saves the NeedToImprove document.
 */
export const computeNeedToImprove = async (studentId) => {
  // 1. Find all completed exam sessions for this student
  //    Populate: test → questionBank → categories
  const sessions = await ExamSession.find({
    student: studentId,
    status: "completed",
    score: { $ne: null },
    maxScore: { $ne: null, $gt: 0 },
  }).populate({
    path: "test",
    select: "title questionBank",
    populate: {
      path: "questionBank",
      select: "categories",
      populate: {
        path: "categories",
        select: "name",
      },
    },
  });

  // 2. Group sessions by category, track scores
  //    categoryMap: { categoryId => { name, totalScore, totalMax, sessionIds[] } }
  const categoryMap = new Map();

  for (const session of sessions) {
    const categories = session?.test?.questionBank?.categories || [];
    if (!categories.length) continue;

    const scorePercent =
      session.maxScore > 0
        ? (session.score / session.maxScore) * 100
        : 0;

    for (const cat of categories) {
      const catId = cat._id.toString();
      if (!categoryMap.has(catId)) {
        categoryMap.set(catId, {
          categoryId: cat._id,
          categoryName: cat.name,
          totalScore: 0,
          totalMax: 0,
          sessionIds: [],
        });
      }
      const entry = categoryMap.get(catId);
      entry.totalScore += session.score;
      entry.totalMax += session.maxScore;
      entry.sessionIds.push(session._id);
    }
  }

  // 3. Filter weak categories (avg < 50%)
  const weakCategories = [];
  for (const [, data] of categoryMap) {
    const avgPercent =
      data.totalMax > 0 ? (data.totalScore / data.totalMax) * 100 : 0;
    if (avgPercent < LOW_SCORE_THRESHOLD) {
      weakCategories.push({ ...data, percentageScore: Math.round(avgPercent) });
    }
  }

  // Sort weakest first
  weakCategories.sort((a, b) => a.percentageScore - b.percentageScore);

  // 4. Get all test IDs purchased by this student (for isPurchased flag)
  const testPurchases = await TestPurchase.find({
    student: studentId,
    paymentStatus: "completed",
  }).select("test");
  const purchasedTestIds = new Set(
    testPurchases
      .map((p) => p.test?.toString())
      .filter(Boolean)
  );

  // 5. For each weak category, fetch suggestions
  const builtCategories = await Promise.all(
    weakCategories.map(async (weakCat) => {
      const { categoryId, categoryName, percentageScore } = weakCat;

      // a) Practice Tests — all published tests whose questionBank includes this category
      //    (not just purchased, so we can mark isPurchased flag)
      const questionBanks = await import("../models/QuestionBank.js").then(
        (m) => m.default.find({ categories: categoryId }).select("_id")
      );
      const qbIds = questionBanks.map((qb) => qb._id);

      const allTests = await Test.find({
        questionBank: { $in: qbIds },
        isPublished: true,
        applicableFor: { $in: ["test", "testBundle"] },
      })
        .select("title price")
        .limit(MAX_PRACTICE_TESTS);

      const practiceTests = allTests.map((t) => ({
        testId: t._id,
        title: t.title,
        price: t.price || 0,
        isPurchased: purchasedTestIds.has(t._id.toString()),
      }));

      // b) Suggested Videos — published courses with video content in this category
      const videosRaw = await Course.find({
        categoryIds: categoryId,
        "contents.type": "video",
        isPublished: true,
      })
        .select("title contents")
        .limit(MAX_VIDEOS);

      const videos = videosRaw.map((c) => ({
        courseId: c._id,
        title: c.title,
        contentType: c.contents?.[0]?.type || "video",
      }));

      // c) Study Materials — published PDF courses with this category
      const materialsRaw = await Course.find({
        categoryIds: categoryId,
        "contents.type": "pdf",
        isPublished: true,
      })
        .select("title contents")
        .limit(MAX_STUDY_MATERIALS);

      const studyMaterials = materialsRaw.map((c) => ({
        courseId: c._id,
        title: c.title,
        contentType: c.contents?.[0]?.type || "pdf",
      }));

      // d) Teachers — approved teachers whose skills match category name
      return {
        categoryId,
        categoryName,
        percentageScore,
        suggestions: {
          practiceTests,
          videos,
          studyMaterials,
        },
      };
    })
  );

  // 6. Upsert NeedToImprove document
  const doc = await NeedToImprove.findOneAndUpdate(
    { student: studentId },
    {
      $set: {
        student: studentId,
        lastComputedAt: new Date(),
        weakCategories: builtCategories,
      },
    },
    { upsert: true, new: true }
  );

  return doc;
};

export default {
  getNeedToImprove,
  computeNeedToImprove,
};
