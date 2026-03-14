import { ApiError } from "../utils/ApiError.js";
import tournamentRepository from "../repository/tournament.repository.js";
import testRepository from "../repository/test.repository.js";
import questionBankRepository from "../repository/questionBank.repository.js";
import QuestionBank from "../models/QuestionBank.js";
import Test from "../models/Test.js";
import walletService from "./wallet.service.js";
import eventRegistrationRepository from "../repository/eventRegistration.repository.js";
import examSessionRepository from "../repository/examSession.repository.js";
import {
  uploadImageToCloudinary,
  deleteFileFromCloudinary,
} from "../utils/cloudinaryUpload.js";
import { attachOfferToList, attachOfferToItem } from "../utils/offerUtils.js";

const TOURNAMENTS_IMAGE_FOLDER = "tournaments";

const stagesTestWithQuestionBankPopulate = {
  path: "stages.test",
  select: "title durationMinutes questionBank",
  populate: {
    path: "questionBank",
    select: "name categories",
    populate: { path: "categories", select: "name _id" },
  },
};

const enrichTournamentStagesWithBankStats = async (tournaments) => {
  const items = Array.isArray(tournaments) ? tournaments : [tournaments];
  const bankIds = [];
  items.forEach((t) => {
    (t?.stages || []).forEach((s) => {
      if (s?.test?.questionBank?._id) {
        bankIds.push(s.test.questionBank._id.toString());
      }
    });
  });
  const uniqueIds = [...new Set(bankIds)];
  const statsMap = await questionBankRepository.getBanksStatsBatch(uniqueIds);

  items.forEach((t) => {
    (t?.stages || []).forEach((s) => {
      if (s?.test?.questionBank?._id) {
        const key = s.test.questionBank._id.toString();
        const stats = statsMap.get(key) || { totalQuestions: 0, totalMarks: 0 };
        s.test.questionBank.totalQuestions = stats.totalQuestions;
        s.test.questionBank.totalMarks = stats.totalMarks;
      }
    });
  });
};

export const createTournament = async (data, adminId, file) => {
  const {
    title,
    description,
    stages,
    registrationStartTime,
    registrationEndTime,
    price,
    firstPlacePoints,
    secondPlacePoints,
    thirdPlacePoints,
  } = data;

  let imageUrl = null;
  if (file) {
    imageUrl = await uploadImageToCloudinary(
      file.buffer,
      file.originalname,
      TOURNAMENTS_IMAGE_FOLDER,
      file.mimetype
    );
  }

  if (!title || !stages || !Array.isArray(stages) || stages.length === 0) {
    throw new ApiError(400, "Missing required fields: title and stages");
  }

  if (!registrationStartTime || !registrationEndTime) {
    throw new ApiError(400, "Registration times are required");
  }

  // Validate stages
  for (let i = 0; i < stages.length; i++) {
    const stage = stages[i];
    if (!stage.name || !stage.test || !stage.startTime || !stage.endTime) {
      throw new ApiError(400, `Stage ${i + 1} is missing required fields`);
    }

    // Validate test exists
    const test = await testRepository.findTestById(stage.test);
    if (!test) {
      throw new ApiError(404, `Test not found for stage ${i + 1}`);
    }
    if ((test.applicableFor ?? "test") !== "tournament") {
      throw new ApiError(400, `Stage ${i + 1}: selected test is not configured for tournaments`);
    }

    // Validate time ranges
    if (new Date(stage.startTime) >= new Date(stage.endTime)) {
      throw new ApiError(400, `Stage ${i + 1}: End time must be after start time`);
    }

    // Set order
    stage.order = i + 1;
  }

  // Validate stage sequence
  for (let i = 0; i < stages.length - 1; i++) {
    if (new Date(stages[i].endTime) > new Date(stages[i + 1].startTime)) {
      throw new ApiError(400, "Stages must be sequential");
    }
  }

  return await tournamentRepository.create({
    title,
    description,
    imageUrl,
    stages,
    registrationStartTime,
    registrationEndTime,
    price: price ?? 0,
    firstPlacePoints: firstPlacePoints ?? 0,
    secondPlacePoints: secondPlacePoints ?? 0,
    thirdPlacePoints: thirdPlacePoints ?? 0,
    isPublished: data.isPublished === true || data.isPublished === "true",
    createdBy: adminId,
  });
};

/** Valid status values for server-side filtering (student list / events). */
const VALID_STATUSES = ["close", "open", "upcoming", "live", "completed"];

const buildStatusQuery = (status) => {
  const now = new Date();
  switch (status) {
    case "close":
      return { registrationStartTime: { $gt: now } };
    case "open":
      return {
        $and: [
          { registrationStartTime: { $lte: now } },
          { registrationEndTime: { $gte: now } },
        ],
      };
    case "upcoming":
      return {
        registrationEndTime: { $lt: now },
        $expr: { $gt: [{ $min: "$stages.startTime" }, now] },
      };
    case "live":
      return {
        $expr: {
          $and: [
            { $lte: [{ $min: "$stages.startTime" }, now] },
            { $gte: [{ $max: "$stages.endTime" }, now] },
          ],
        },
      };
    case "completed":
      return { $expr: { $gt: [now, { $max: "$stages.endTime" }] } };
    default:
      return null;
  }
};

export const getTournaments = async (options = {}) => {
  const { page = 1, limit = 10, search, isPublished, status, category } = options;

  const query = {};
  if (search) {
    query.$or = [
      { title: { $regex: search, $options: "i" } },
      { description: { $regex: search, $options: "i" } },
    ];
  }
  if (isPublished !== undefined) {
    query.isPublished = isPublished === "true" || isPublished === true;
  }
  const normalizedStatus =
    typeof status === "string" ? status.trim().toLowerCase() : null;
  if (normalizedStatus && VALID_STATUSES.includes(normalizedStatus)) {
    const statusQuery = buildStatusQuery(normalizedStatus);
    if (statusQuery) Object.assign(query, statusQuery);
  }

  if (category) {
    const bankIds = await QuestionBank.find({ categories: category }).distinct("_id");
    if (bankIds.length > 0) {
      const testIds = await Test.find({ questionBank: { $in: bankIds } }).distinct("_id");
      if (testIds.length > 0) {
        query["stages.test"] = { $in: testIds };
      } else {
        query["stages.test"] = { $in: [] };
      }
    } else {
      query["stages.test"] = { $in: [] };
    }
  }

  const pageNum = parseInt(page);
  const limitNum = parseInt(limit);
  const skip = (pageNum - 1) * limitNum;

  const [tournaments, total] = await Promise.all([
    tournamentRepository.find(query, {
      populate: [
        stagesTestWithQuestionBankPopulate,
        { path: "createdBy", select: "name email" },
      ],
      sort: { createdAt: -1 },
      skip,
      limit: limitNum,
    }),
    tournamentRepository.count(query),
  ]);

  await enrichTournamentStagesWithBankStats(tournaments);

  const tournamentsWithOffer = await attachOfferToList(tournaments, "Tournament", "price");

  return {
    tournaments: tournamentsWithOffer,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      pages: Math.ceil(total / limitNum) || 1,
    },
  };
};

export const getTournamentById = async (id, isAdmin = false) => {
  const populateFields = [
    stagesTestWithQuestionBankPopulate,
    { path: "createdBy", select: "name email" },
  ];

  const tournament = await tournamentRepository.findById(id, populateFields);
  if (!tournament) {
    throw new ApiError(404, "Tournament not found");
  }
  await enrichTournamentStagesWithBankStats(tournament);
  return await attachOfferToItem(tournament, "Tournament", "price");
};

export const updateTournament = async (id, updateData, file) => {
  const tournament = await tournamentRepository.findById(id);
  if (!tournament) {
    throw new ApiError(404, "Tournament not found");
  }

  if (file) {
    if (tournament.imageUrl) {
      await deleteFileFromCloudinary(tournament.imageUrl);
    }
    updateData.imageUrl = await uploadImageToCloudinary(
      file.buffer,
      file.originalname,
      TOURNAMENTS_IMAGE_FOLDER,
      file.mimetype
    );
  }

  // Validate stages if provided
  if (updateData.stages && Array.isArray(updateData.stages)) {
    for (let i = 0; i < updateData.stages.length; i++) {
      const stage = updateData.stages[i];
      if (stage.test) {
        const test = await testRepository.findTestById(stage.test);
        if (!test) {
          throw new ApiError(404, `Test not found for stage ${i + 1}`);
        }
        if ((test.applicableFor ?? "test") !== "tournament") {
          throw new ApiError(400, `Stage ${i + 1}: selected test is not configured for tournaments`);
        }
      }
      stage.order = i + 1;
    }
  }

  return await tournamentRepository.updateById(id, updateData);
};

export const deleteTournament = async (id) => {
  const tournament = await tournamentRepository.findById(id);
  if (!tournament) {
    throw new ApiError(404, "Tournament not found");
  }
  if (tournament.imageUrl) {
    await deleteFileFromCloudinary(tournament.imageUrl);
  }
  return await tournamentRepository.deleteById(id);
};

/**
 * Get leaderboard for a tournament: ranked by score in the Final stage (or last stage by order).
 * Only registered participants with payment completed are included.
 */
export const getTournamentLeaderboard = async (tournamentId, limit = 20) => {
  const tournament = await tournamentRepository.findById(tournamentId);
  if (!tournament) {
    throw new ApiError(404, "Tournament not found");
  }
  const stages = tournament.stages || [];
  const finalStage = stages.find((s) => s.name === "Final") || stages.slice().sort((a, b) => (b.order || 0) - (a.order || 0))[0];
  if (!finalStage || !finalStage.test) {
    return { leaderboard: [], tournamentTitle: tournament.title, stage: null };
  }
  const registrations = await eventRegistrationRepository.find(
    {
      eventType: "tournament",
      eventId: tournamentId,
      paymentStatus: "completed",
    },
    { limit: 5000 }
  );
  const registeredStudentIds = [
    ...new Set(
      registrations
        .map((r) => (r.student?._id ?? r.student)?.toString?.())
        .filter(Boolean)
    ),
  ];
  if (registeredStudentIds.length === 0) {
    return { leaderboard: [], tournamentTitle: tournament.title, stage: finalStage.name };
  }
  const ranked = await examSessionRepository.getRankedByTest(
    finalStage.test,
    registeredStudentIds,
    limit
  );
  const leaderboard = ranked.map((r, index) => ({
    rank: index + 1,
    student: r.student,
    name: r.name,
    email: r.email,
    score: r.score,
    maxScore: r.maxScore,
    completedAt: r.completedAt,
  }));
  return { leaderboard, tournamentTitle: tournament.title, stage: finalStage.name };
};

/**
 * Declare winners and credit points.
 * Body: { firstPlace?, secondPlace?, thirdPlace? } (student IDs), or { autoCalculate: true } to set 1st/2nd/3rd from leaderboard (Final stage score).
 */
export const declareTournamentWinners = async (tournamentId, winners) => {
  const tournament = await tournamentRepository.findById(tournamentId);
  if (!tournament) {
    throw new ApiError(404, "Tournament not found");
  }

  let firstPlace = winners.firstPlace;
  let secondPlace = winners.secondPlace;
  let thirdPlace = winners.thirdPlace;

  if (winners.autoCalculate) {
    const { leaderboard } = await getTournamentLeaderboard(tournamentId, 3);
    firstPlace = leaderboard[0]?.student?.toString?.() || leaderboard[0]?.student;
    secondPlace = leaderboard[1]?.student?.toString?.() || leaderboard[1]?.student;
    thirdPlace = leaderboard[2]?.student?.toString?.() || leaderboard[2]?.student;
    if (!firstPlace && !secondPlace && !thirdPlace) {
      throw new ApiError(400, "No completed attempts found for Final stage to auto-calculate winners");
    }
  }

  const results = [];
  const places = [
    { key: "firstPlace", points: tournament.firstPlacePoints || 0, studentId: firstPlace },
    { key: "secondPlace", points: tournament.secondPlacePoints || 0, studentId: secondPlace },
    { key: "thirdPlace", points: tournament.thirdPlacePoints || 0, studentId: thirdPlace },
  ];

  for (const place of places) {
    const studentId = place.studentId;
    if (!studentId || place.points < 1) continue;
    try {
      await walletService.addRewardPoints(
        studentId,
        place.points,
        "tournament_win",
        `Winner (${place.key.replace("Place", "")} place) - ${tournament.title}`,
        tournamentId,
        "Tournament"
      );
      results.push({ place: place.key, studentId, points: place.points });
    } catch (e) {
      throw new ApiError(400, `Failed to credit ${place.key}: ${e.message}`);
    }
  }

  return { tournament: tournament.title, results };
};

export default {
  createTournament,
  getTournaments,
  getTournamentById,
  updateTournament,
  deleteTournament,
  getTournamentLeaderboard,
  declareTournamentWinners,
};

