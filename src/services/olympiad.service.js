import { ApiError } from "../utils/ApiError.js";
import olympiadRepository from "../repository/olympiad.repository.js";
import testRepository from "../repository/test.repository.js";
import questionBankRepository from "../repository/questionBank.repository.js";
import walletService from "./wallet.service.js";
import eventRegistrationRepository from "../repository/eventRegistration.repository.js";
import examSessionRepository from "../repository/examSession.repository.js";
import {
  uploadImageToCloudinary,
  deleteFileFromCloudinary,
} from "../utils/cloudinaryUpload.js";

const OLYMPIADS_IMAGE_FOLDER = "olympiads";

const testWithQuestionBankPopulate = {
  path: "test",
  select: "title durationMinutes questionBank",
  populate: {
    path: "questionBank",
    select: "name categories",
    populate: { path: "categories", select: "name _id" },
  },
};

const enrichOlympiadTestsWithBankStats = async (olympiads) => {
  const items = Array.isArray(olympiads) ? olympiads : [olympiads];
  const bankIds = items
    .map((o) => o?.test?.questionBank?._id)
    .filter(Boolean)
    .map((id) => id.toString());
  const uniqueIds = [...new Set(bankIds)];
  const statsMap = await questionBankRepository.getBanksStatsBatch(uniqueIds);

  items.forEach((o) => {
    if (o?.test?.questionBank?._id) {
      const key = o.test.questionBank._id.toString();
      const stats = statsMap.get(key) || { totalQuestions: 0, totalMarks: 0 };
      o.test.questionBank.totalQuestions = stats.totalQuestions;
      o.test.questionBank.totalMarks = stats.totalMarks;
    }
  });
};

export const createOlympiad = async (data, adminId, file) => {
  const {
    title,
    description,
    subject,
    startTime,
    endTime,
    rules,
    testId,
    registrationStartTime,
    registrationEndTime,
    price,
    firstPlacePoints,
    secondPlacePoints,
    thirdPlacePoints,
    maxParticipants,
  } = data;

  if (!title || !startTime || !endTime || !testId || !registrationStartTime || !registrationEndTime) {
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

  if (new Date(registrationStartTime) >= new Date(registrationEndTime)) {
    throw new ApiError(400, "Registration end time must be after start time");
  }

  if (new Date(registrationEndTime) > new Date(startTime)) {
    throw new ApiError(400, "Registration must end before event starts");
  }

  let imageUrl = null;
  if (file) {
    imageUrl = await uploadImageToCloudinary(
      file.buffer,
      file.originalname,
      OLYMPIADS_IMAGE_FOLDER,
      file.mimetype
    );
  }

  return await olympiadRepository.create({
    title,
    description,
    imageUrl,
    subject,
    startTime,
    endTime,
    rules,
    test: testId,
    registrationStartTime,
    registrationEndTime,
    price: price ?? 0,
    firstPlacePoints: firstPlacePoints ?? 0,
    secondPlacePoints: secondPlacePoints ?? 0,
    thirdPlacePoints: thirdPlacePoints ?? 0,
    maxParticipants: maxParticipants || null,
    createdBy: adminId,
  });
};

export const getOlympiads = async (options = {}) => {
  const { page = 1, limit = 10, search, isPublished } = options;

  const query = {};
  if (search) {
    query.$or = [
      { title: { $regex: search, $options: "i" } },
      { description: { $regex: search, $options: "i" } },
      { subject: { $regex: search, $options: "i" } },
    ];
  }
  if (isPublished !== undefined) {
    query.isPublished = isPublished === "true" || isPublished === true;
  }

  const pageNum = parseInt(page);
  const limitNum = parseInt(limit);
  const skip = (pageNum - 1) * limitNum;

  const [olympiads, total] = await Promise.all([
    olympiadRepository.find(query, {
      populate: [
        testWithQuestionBankPopulate,
        { path: "createdBy", select: "name email" },
      ],
      sort: { createdAt: -1 },
      skip,
      limit: limitNum,
    }),
    olympiadRepository.count(query),
  ]);

  await enrichOlympiadTestsWithBankStats(olympiads);

  return {
    olympiads,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      pages: Math.ceil(total / limitNum) || 1,
    },
  };
};

export const getOlympiadById = async (id, isAdmin = false) => {
  const populateFields = [
    testWithQuestionBankPopulate,
    { path: "createdBy", select: "name email" },
  ];

  const olympiad = await olympiadRepository.findById(id, populateFields);
  if (!olympiad) {
    throw new ApiError(404, "Olympiad not found");
  }
  await enrichOlympiadTestsWithBankStats(olympiad);
  return olympiad;
};

export const updateOlympiad = async (id, updateData, file) => {
  const olympiad = await olympiadRepository.findById(id);
  if (!olympiad) {
    throw new ApiError(404, "Olympiad not found");
  }

  if (file) {
    if (olympiad.imageUrl) {
      await deleteFileFromCloudinary(olympiad.imageUrl);
    }
    updateData.imageUrl = await uploadImageToCloudinary(
      file.buffer,
      file.originalname,
      OLYMPIADS_IMAGE_FOLDER,
      file.mimetype
    );
  }

  // Validate test if provided
  if (updateData.testId) {
    const test = await testRepository.findTestById(updateData.testId);
    if (!test) {
      throw new ApiError(404, "Test not found");
    }
    updateData.test = updateData.testId;
    delete updateData.testId;
  }

  // Validate time ranges if provided
  if (updateData.startTime && updateData.endTime) {
    if (new Date(updateData.startTime) >= new Date(updateData.endTime)) {
      throw new ApiError(400, "End time must be after start time");
    }
  }

  return await olympiadRepository.updateById(id, updateData);
};

export const deleteOlympiad = async (id) => {
  const olympiad = await olympiadRepository.findById(id);
  if (!olympiad) {
    throw new ApiError(404, "Olympiad not found");
  }
  if (olympiad.imageUrl) {
    await deleteFileFromCloudinary(olympiad.imageUrl);
  }
  return await olympiadRepository.deleteById(id);
};

/**
 * Get leaderboard for an olympiad: ranked list of registered participants by their best score on the olympiad test.
 * Only students who completed the test and are registered (payment completed) are included.
 * Tie-break: higher score first; if same score, earlier completedAt first.
 */
export const getOlympiadLeaderboard = async (olympiadId, limit = 20) => {
  const olympiad = await olympiadRepository.findById(olympiadId);
  if (!olympiad) {
    throw new ApiError(404, "Olympiad not found");
  }
  const registrations = await eventRegistrationRepository.find(
    {
      eventType: "olympiad",
      eventId: olympiadId,
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
    return { leaderboard: [], olympiadTitle: olympiad.title };
  }
  const ranked = await examSessionRepository.getRankedByTest(
    olympiad.test,
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
  return { leaderboard, olympiadTitle: olympiad.title };
};

/**
 * Declare winners and credit points.
 * Body: { firstPlace?, secondPlace?, thirdPlace? } (student IDs), or { autoCalculate: true } to set 1st/2nd/3rd from leaderboard by score.
 */
export const declareOlympiadWinners = async (olympiadId, winners) => {
  const olympiad = await olympiadRepository.findById(olympiadId);
  if (!olympiad) {
    throw new ApiError(404, "Olympiad not found");
  }

  let firstPlace = winners.firstPlace;
  let secondPlace = winners.secondPlace;
  let thirdPlace = winners.thirdPlace;

  if (winners.autoCalculate) {
    const { leaderboard } = await getOlympiadLeaderboard(olympiadId, 3);
    firstPlace = leaderboard[0]?.student?.toString?.() || leaderboard[0]?.student;
    secondPlace = leaderboard[1]?.student?.toString?.() || leaderboard[1]?.student;
    thirdPlace = leaderboard[2]?.student?.toString?.() || leaderboard[2]?.student;
    if (!firstPlace && !secondPlace && !thirdPlace) {
      throw new ApiError(400, "No completed attempts found to auto-calculate winners");
    }
  }

  const results = [];
  const places = [
    { key: "firstPlace", points: olympiad.firstPlacePoints || 0, studentId: firstPlace },
    { key: "secondPlace", points: olympiad.secondPlacePoints || 0, studentId: secondPlace },
    { key: "thirdPlace", points: olympiad.thirdPlacePoints || 0, studentId: thirdPlace },
  ];

  for (const place of places) {
    const studentId = place.studentId;
    if (!studentId || place.points < 1) continue;
    try {
      await walletService.addRewardPoints(
        studentId,
        place.points,
        "olympiad_win",
        `Winner (${place.key.replace("Place", "")} place) - ${olympiad.title}`,
        olympiadId,
        "Olympiad"
      );
      results.push({ place: place.key, studentId, points: place.points });
    } catch (e) {
      throw new ApiError(400, `Failed to credit ${place.key}: ${e.message}`);
    }
  }

  return { olympiad: olympiad.title, results };
};

export default {
  createOlympiad,
  getOlympiads,
  getOlympiadById,
  updateOlympiad,
  deleteOlympiad,
  getOlympiadLeaderboard,
  declareOlympiadWinners,
};

