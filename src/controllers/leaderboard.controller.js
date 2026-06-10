import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import tournamentService from "../services/tournament.service.js";
import {
  getOlympiadLeaderboard,
  getCompletedOlympiads,
} from "../services/studentOlympiad.service.js";
import testRepository from "../repository/test.repository.js";
import examSessionRepository from "../repository/examSession.repository.js";
import orderRepository from "../repository/order.repository.js";
import Challenge from "../models/Challenge.js";
import categoryRepository from "../repository/category.repository.js";

const VALID_TYPES = ["tournament", "olympiad", "standalone_test", "challenge"];

/**
 * Student-facing: aggregated leaderboard API for olympiads and tournaments.
 *
 * Query params:
 * - type: "tournament" | "olympiad"
 * - eventId: optional; when provided, returns leaderboard only for that event
 * - page, limit: pagination over completed events when eventId is not provided
 *
 * The frontend always sends a specific type matching the active tab.
 * Olympiad tab  → type=olympiad  → returns only completed olympiads
 * Tournament tab → type=tournament → returns only completed tournaments
 */
export const getLeaderboardsForStudent = asyncHandler(async (req, res) => {
  const {
    type,
    eventId,
    year,
    category,
    page = 1,
    limit = 10,
  } = req.query;

  const normalizedType = String(type || "").toLowerCase();

  if (!VALID_TYPES.includes(normalizedType)) {
    throw new ApiError(400, "Invalid type. Use: tournament, olympiad, standalone_test, or challenge");
  }

  const studentId = req.user?._id;
  if (!studentId && (normalizedType === "standalone_test" || normalizedType === "challenge")) {
    throw new ApiError(401, "Unauthorized");
  }

  const pageNum = parseInt(page) || 1;
  const limitNum = Math.min(parseInt(limit) || 10, 50);

  // Resolve category descendant IDs once (used by all type handlers below)
  let categoryDescendantIds = null;
  if (category && category !== 'All') {
    try {
      const descendants = await categoryRepository.findDescendantIds(category);
      categoryDescendantIds = [category, ...descendants.map(id => id.toString())];
    } catch (_) {
      categoryDescendantIds = [category];
    }
  }

  // ── SINGLE EVENT MODE ────────────────────────────────────────────────────────
  // Returns one event's full leaderboard when eventId is provided.

  if (eventId) {
    if (normalizedType === "tournament") {
      const result = await tournamentService.getTournamentLeaderboard(
        eventId,
        1000
      );
      let leaderboard = result.leaderboard;
      if (year) {
        leaderboard = leaderboard.filter(r => new Date(r.completedAt).getUTCFullYear() == year);
      }
      return res.status(200).json(
        ApiResponse.success(
          {
            type: "tournament",
            eventId,
            title: result.tournamentTitle,
            stage: result.stage,
            leaderboard,
          },
          "Tournament leaderboard fetched successfully"
        )
      );
    }

    if (normalizedType === "challenge") {
      const challenge = await Challenge.findById(eventId).populate("test", "title applicableFor");
      if (!challenge) {
        throw new ApiError(404, "Challenge not found");
      }

      const ranked = await examSessionRepository.getRankedByChallenge(eventId, null, 1000, year);
      const leaderboard = ranked.map((r, index) => ({
        rank: index + 1,
        name: r.name,
        score: r.score,
        maxScore: r.maxScore,
        completedAt: r.completedAt,
      }));

      return res.status(200).json(
        ApiResponse.success(
          {
            type: "challenge",
            eventId,
            title: `${challenge.test?.title || 'Challenge'} - Room ${challenge.roomCode}`,
            stage: null,
            leaderboard,
          },
          "Challenge leaderboard fetched successfully"
        )
      );
    }

    if (normalizedType === "standalone_test") {
      const test = await testRepository.findTestById(eventId);
      if (!test) throw new ApiError(404, "Test not found");

      const ranked = await examSessionRepository.getRankedByTest(eventId, null, 1000, year);
      const leaderboard = ranked.map((r, index) => ({
        rank: index + 1,
        name: r.name,
        score: r.score,
        maxScore: r.maxScore,
        completedAt: r.completedAt,
      }));

      return res.status(200).json(
        ApiResponse.success(
          {
            type: "standalone_test",
            eventId,
            title: test.title,
            stage: null,
            leaderboard,
          },
          "Test leaderboard fetched successfully"
        )
      );
    }

    // type === "olympiad"
    const result = await getOlympiadLeaderboard(eventId, 1000);
    let leaderboard = result.leaderboard;
    if (year) {
      leaderboard = leaderboard.filter(r => new Date(r.completedAt).getUTCFullYear() == year);
    }
    return res.status(200).json(
      ApiResponse.success(
        {
          type: "olympiad",
          eventId,
          title: result.olympiadTitle,
          stage: null,
          leaderboard,
        },
        "Olympiad leaderboard fetched successfully"
      )
    );
  }

  // ── LIST MODE ────────────────────────────────────────────────────────────────
  // Returns paginated list of completed events for the requested type only.
  // Each item already contains its leaderboard so the frontend avoids a
  // second round-trip when auto-selecting the first event.

  if (normalizedType === "tournament") {
    if (!studentId) {
      return res.status(200).json(ApiResponse.success({ items: [], pagination: { page: pageNum, limit: limitNum, total: 0, pages: 1 } }, "Leaderboards fetched successfully"));
    }

    const EventRegistration = (await import("../models/EventRegistration.js")).default;
    const registrations = await EventRegistration.find({
      student: studentId,
      eventType: "tournament",
      paymentStatus: "completed"
    }).select("eventId").lean();

    const registeredTournamentIds = registrations.map(r => r.eventId?.toString()).filter(Boolean);

    if (registeredTournamentIds.length === 0) {
      return res.status(200).json(ApiResponse.success({ items: [], pagination: { page: pageNum, limit: limitNum, total: 0, pages: 1 } }, "Leaderboards fetched successfully"));
    }

    const Tournament = (await import("../models/Tournament.js")).default;
    const now = new Date();
    let tournaments = await Tournament.find({
      _id: { $in: registeredTournamentIds },
      isPublished: true,
      $expr: { $gt: [now, { $max: "$stages.endTime" }] }
    }).lean();

    if (year) {
      tournaments = tournaments.filter(t => {
        const stages = t.stages || [];
        const finalStage = stages.find((s) => s.name === "Final") || stages.slice().sort((a, b) => (b.order || 0) - (a.order || 0))[0];
        if (!finalStage || !finalStage.endTime) return false;
        return new Date(finalStage.endTime).getUTCFullYear() == year;
      });
    }

    // Category filter: keep only tournaments whose stage tests belong to the selected category
    if (categoryDescendantIds) {
      const Test = (await import("../models/Test.js")).default;
      const QuestionBank = (await import("../models/QuestionBank.js")).default;
      tournaments = (await Promise.all(tournaments.map(async (t) => {
        const stageTestIds = (t.stages || []).map(s => s.test).filter(Boolean);
        if (!stageTestIds.length) return null;
        
        const tests = await Test.find({ _id: { $in: stageTestIds } }).select("questionBank categoryId").lean();
        const testCategoryIds = tests.map(testObj => testObj.categoryId?.toString()).filter(Boolean);
        
        const bankIds = tests.map(testObj => testObj.questionBank).filter(Boolean);
        let catStrings = [...testCategoryIds];
        
        if (bankIds.length > 0) {
          const catIds = await QuestionBank.find({ _id: { $in: bankIds } }).distinct("categories");
          catStrings.push(...catIds.map(c => c.toString()));
        }
        
        return catStrings.some(c => categoryDescendantIds.includes(c)) ? t : null;
      }))).filter(Boolean);
    }

    // Fetch all leaderboards in parallel (avoids serial N+1 loop)
    const leaderboards = tournaments.length
      ? await Promise.all(
          tournaments.map((t) =>
            tournamentService.getTournamentLeaderboard(t._id, 1000)
          )
        )
      : [];

    const items = tournaments.map((t, i) => {
      let lb = leaderboards[i].leaderboard;
      if (year) lb = lb.filter(r => new Date(r.completedAt).getUTCFullYear() == year);
      return {
        type: "tournament",
        eventId: t._id,
        title: t.title,
        stage: leaderboards[i].stage,
        status: "completed",
        leaderboard: lb,
        totalParticipants: lb.length,
      };
    });

    return res.status(200).json(
      ApiResponse.success(
        {
          items,
          pagination: {
            page: pageNum,
            limit: limitNum,
            total: items.length,
            pages: 1,
          },
        },
        "Leaderboards fetched successfully"
      )
    );
  }

  if (normalizedType === "challenge") {
    const activeChallenges = await Challenge.find({
      "participants.student": studentId,
      roomStatus: "started"
    });
    if (activeChallenges.length > 0) {
      const { syncChallengeCompletionById } = await import("../services/challenge.service.js");
      for (const c of activeChallenges) {
        await syncChallengeCompletionById(c._id).catch(() => {});
      }
    }

    const matchQuery = {
      "participants.student": studentId,
      roomStatus: "completed"
    };
    if (year) {
      matchQuery.completedAt = {
        $gte: new Date(`${year}-01-01T00:00:00.000Z`),
        $lte: new Date(`${year}-12-31T23:59:59.999Z`),
      };
    }

    // Category filter for challenges
    if (categoryDescendantIds) {
      const Test = (await import("../models/Test.js")).default;
      const testQuery = {};
      const QuestionBank = (await import("../models/QuestionBank.js")).default;
      const bankIds = await QuestionBank.find({ categories: { $in: categoryDescendantIds } }).distinct("_id");
      testQuery.$or = [
        { questionBank: { $in: bankIds } },
        { categoryId: { $in: categoryDescendantIds } }
      ];
      const testIds = await Test.find(testQuery).distinct("_id");
      matchQuery.test = { $in: testIds };
    }

    const challenges = await Challenge.find(matchQuery)
      .populate("test", "title")
      .sort({ completedAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum);

    const total = await Challenge.countDocuments(matchQuery);

    const leaderboards = challenges.length
      ? await Promise.all(
          challenges.map((c) => examSessionRepository.getRankedByChallenge(c._id, null, 1000, year))
        )
      : [];

    const items = challenges.map((c, i) => {
      const ranked = leaderboards[i];
      const lb = ranked.map((r, index) => ({
        rank: index + 1,
        name: r.name,
        score: r.score,
        maxScore: r.maxScore,
        completedAt: r.completedAt,
      }));

      return {
        type: "challenge",
        eventId: c._id,
        title: `${c.test?.title || 'Challenge'} - Room ${c.roomCode}`,
        stage: null,
        status: "completed",
        leaderboard: lb,
        totalParticipants: lb.length,
      };
    });

    return res.status(200).json(
      ApiResponse.success(
        {
          items,
          pagination: {
            page: pageNum,
            limit: limitNum,
            total,
            pages: Math.ceil(total / limitNum) || 1,
          },
        },
        "Leaderboards fetched successfully"
      )
    );
  }

  if (normalizedType === "standalone_test") {
    let purchasedTestIds = [];
    const purchases = await orderRepository.findTestPurchasesForExamHall(studentId);
    purchases.forEach((p) => {
      if (p.test) purchasedTestIds.push(p.test._id.toString());
      if (p.testBundle && p.testBundle.tests) {
        p.testBundle.tests.forEach((t) => purchasedTestIds.push(t._id.toString()));
      }
    });

    purchasedTestIds = [...new Set(purchasedTestIds)];

    if (purchasedTestIds.length === 0) {
      return res.status(200).json(
        ApiResponse.success({ items: [], pagination: { page: pageNum, limit: limitNum, total: 0, pages: 1 } }, "Leaderboards fetched successfully")
      );
    }

    const query = {
      isPublished: true,
      _id: { $in: purchasedTestIds }
    };

    // Category filter: narrow down to only tests in the selected category
    if (categoryDescendantIds) {
      const QuestionBank = (await import("../models/QuestionBank.js")).default;
      const bankIds = await QuestionBank.find({ categories: { $in: categoryDescendantIds } }).distinct("_id");
      query.$or = [
        { questionBank: { $in: bankIds } },
        { categoryId: { $in: categoryDescendantIds } }
      ];
    }

    const result = await testRepository.findAllTests(query, { page: pageNum, limit: limitNum, sortBy: "createdAt", sortOrder: "desc" });

    const tests = result.tests || [];

    const leaderboards = tests.length
      ? await Promise.all(
          tests.map((t) => examSessionRepository.getRankedByTest(t._id, null, 1000, year))
        )
      : [];

    let items = tests.map((t, i) => {
      const ranked = leaderboards[i];
      const lb = ranked.map((r, index) => ({
        rank: index + 1,
        name: r.name,
        score: r.score,
        maxScore: r.maxScore,
        completedAt: r.completedAt,
      }));

      return {
        type: "standalone_test",
        eventId: t._id,
        title: t.title,
        stage: null,
        status: "completed",
        leaderboard: lb,
        totalParticipants: lb.length,
      };
    });

    if (year) {
      items = items.filter(item => item.leaderboard.length > 0);
    }

    return res.status(200).json(
      ApiResponse.success(
        {
          items,
          pagination: {
            page: pageNum,
            limit: limitNum,
            total: result.pagination.total,
            pages: result.pagination.pages,
          },
        },
        "Leaderboards fetched successfully"
      )
    );
  }

  // type === "olympiad"
  if (!studentId) {
    return res.status(200).json(ApiResponse.success({ items: [], pagination: { page: pageNum, limit: limitNum, total: 0, pages: 1 } }, "Leaderboards fetched successfully"));
  }

  const EventRegistration = (await import("../models/EventRegistration.js")).default;
  const registrations = await EventRegistration.find({
    student: studentId,
    eventType: "olympiad",
    paymentStatus: "completed"
  }).select("eventId").lean();

  const registeredOlympiadIds = registrations.map(r => r.eventId?.toString()).filter(Boolean);

  if (registeredOlympiadIds.length === 0) {
    return res.status(200).json(ApiResponse.success({ items: [], pagination: { page: pageNum, limit: limitNum, total: 0, pages: 1 } }, "Leaderboards fetched successfully"));
  }

  const OlympiadTest = (await import("../models/OlympiadTest.js")).default;
  const now = new Date();
  
  let olympiads = await OlympiadTest.find({
    _id: { $in: registeredOlympiadIds },
    endTime: { $lt: now }
  }).populate({ path: "testId", select: "title _id" }).sort({ endTime: -1 }).lean();

  if (year) {
    olympiads = olympiads.filter(o => o.endTime && new Date(o.endTime).getUTCFullYear() == year);
  }

  // Category filter: keep only olympiads whose test belongs to the selected category
  if (categoryDescendantIds) {
    const Test = (await import("../models/Test.js")).default;
    const QuestionBank = (await import("../models/QuestionBank.js")).default;
    olympiads = (await Promise.all(olympiads.map(async (o) => {
      let catStrings = [];
      
      if (o.categoryId) {
        catStrings.push(o.categoryId.toString());
      }
      
      const testId = o.testId?._id || o.testId;
      if (testId) {
        const testObj = await Test.findById(testId).select("questionBank categoryId").lean();
        if (testObj) {
          if (testObj.categoryId) {
            catStrings.push(testObj.categoryId.toString());
          }
          if (testObj.questionBank) {
            const catIds = await QuestionBank.find({ _id: testObj.questionBank }).distinct("categories");
            catStrings.push(...catIds.map(c => c.toString()));
          }
        }
      }
      
      return catStrings.some(c => categoryDescendantIds.includes(c)) ? o : null;
    }))).filter(Boolean);
  }

  // Fetch all leaderboards in parallel
  const leaderboards = olympiads.length
    ? await Promise.all(
        olympiads.map((o) => getOlympiadLeaderboard(o._id, 1000))
      )
    : [];

  const items = olympiads.map((o, i) => {
    let lb = leaderboards[i].leaderboard;
    if (year) lb = lb.filter(r => new Date(r.completedAt).getUTCFullYear() == year);
    return {
      type: "olympiad",
      eventId: o._id,
      title: o.title,
      stage: null,
      status: "completed",
      leaderboard: lb,
      totalParticipants: lb.length,
    };
  });

  return res.status(200).json(
    ApiResponse.success(
      {
        items,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: items.length,
          pages: 1,
        },
      },
      "Leaderboards fetched successfully"
    )
  );
});

export default {
  getLeaderboardsForStudent,
};
