import { ApiError } from "../utils/ApiError.js";
import tournamentRepository from "../repository/tournament.repository.js";
import testRepository from "../repository/test.repository.js";

export const createTournament = async (data, adminId) => {
  const {
    title,
    description,
    stages,
    registrationStartTime,
    registrationEndTime,
  } = data;

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
    stages,
    registrationStartTime,
    registrationEndTime,
    createdBy: adminId,
  });
};

export const getTournaments = async (options = {}) => {
  const { page = 1, limit = 10, search, isPublished } = options;

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

  const pageNum = parseInt(page);
  const limitNum = parseInt(limit);
  const skip = (pageNum - 1) * limitNum;

  const [tournaments, total] = await Promise.all([
    tournamentRepository.find(query, {
      populate: [
        { path: "stages.test", select: "title durationMinutes totalMarks" },
        { path: "createdBy", select: "name email" },
      ],
      sort: { createdAt: -1 },
      skip,
      limit: limitNum,
    }),
    tournamentRepository.count(query),
  ]);

  return {
    tournaments,
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
    { 
      path: "stages.test", 
      select: isAdmin ? "title durationMinutes totalMarks questions" : "title durationMinutes totalMarks subject" 
    },
    { path: "createdBy", select: "name email" },
  ];

  const tournament = await tournamentRepository.findById(id, populateFields);
  if (!tournament) {
    throw new ApiError(404, "Tournament not found");
  }
  return tournament;
};

export const updateTournament = async (id, updateData) => {
  const tournament = await tournamentRepository.findById(id);
  if (!tournament) {
    throw new ApiError(404, "Tournament not found");
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
  return await tournamentRepository.deleteById(id);
};

export default {
  createTournament,
  getTournaments,
  getTournamentById,
  updateTournament,
  deleteTournament,
};

