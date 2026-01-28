import { ApiError } from "../utils/ApiError.js";
import olympiadRepository from "../repository/olympiad.repository.js";
import testRepository from "../repository/test.repository.js";

export const createOlympiad = async (data, adminId) => {
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

  return await olympiadRepository.create({
    title,
    description,
    subject,
    startTime,
    endTime,
    rules,
    test: testId,
    registrationStartTime,
    registrationEndTime,
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
        { path: "test", select: "title durationMinutes totalMarks" },
        { path: "createdBy", select: "name email" },
      ],
      sort: { createdAt: -1 },
      skip,
      limit: limitNum,
    }),
    olympiadRepository.count(query),
  ]);

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
    { path: "test", select: isAdmin ? "title durationMinutes totalMarks questions" : "title durationMinutes totalMarks" },
    { path: "createdBy", select: "name email" },
  ];

  const olympiad = await olympiadRepository.findById(id, populateFields);
  if (!olympiad) {
    throw new ApiError(404, "Olympiad not found");
  }
  return olympiad;
};

export const updateOlympiad = async (id, updateData) => {
  const olympiad = await olympiadRepository.findById(id);
  if (!olympiad) {
    throw new ApiError(404, "Olympiad not found");
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
  return await olympiadRepository.deleteById(id);
};

export default {
  createOlympiad,
  getOlympiads,
  getOlympiadById,
  updateOlympiad,
  deleteOlympiad,
};

