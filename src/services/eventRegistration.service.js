import { ApiError } from "../utils/ApiError.js";
import eventRegistrationRepository from "../repository/eventRegistration.repository.js";
import olympiadRepository from "../repository/olympiad.repository.js";
import tournamentRepository from "../repository/tournament.repository.js";
import workshopRepository from "../repository/workshop.repository.js";
import examSessionRepository from "../repository/examSession.repository.js";

export const registerForEvent = async (eventType, eventId, studentId, paymentStatus = "completed", paymentId = null) => {
  const eventModelMap = {
    olympiad: "Olympiad",
    tournament: "Tournament",
    workshop: "Workshop",
    challenge: "Challenge",
  };

  // Check if already registered
  const existingRegistration = await eventRegistrationRepository.findOne({
    student: studentId,
    eventType,
    eventId,
  });

  if (existingRegistration) {
    throw new ApiError(400, `Already registered for this ${eventType}`);
  }

  // Validate event exists and get event details
  let event;
  if (eventType === "olympiad") {
    event = await olympiadRepository.findById(eventId);
  } else if (eventType === "tournament") {
    event = await tournamentRepository.findById(eventId);
  } else if (eventType === "workshop") {
    event = await workshopRepository.findById(eventId);
  }

  if (!event || !event.isPublished) {
    throw new ApiError(404, `${eventType} not found`);
  }

  // Check registration window
  const now = new Date();
  if (
    now < new Date(event.registrationStartTime) ||
    now > new Date(event.registrationEndTime)
  ) {
    throw new ApiError(400, `Registration is not open for this ${eventType}`);
  }

  // Check max participants
  if (event.maxParticipants) {
    const registeredCount = await eventRegistrationRepository.count({
      eventType,
      eventId,
      status: { $ne: "disqualified" },
    });

    if (registeredCount >= event.maxParticipants) {
      throw new ApiError(400, "Maximum participants reached");
    }
  }

  return await eventRegistrationRepository.create({
    student: studentId,
    eventType,
    eventId,
    eventModel: eventModelMap[eventType],
    status: "registered",
    paymentStatus,
    paymentId: paymentId || undefined,
  });
};

export const getRegistrations = async (options = {}) => {
  const { studentId, eventType, eventId, status } = options;

  const query = {};
  if (studentId) query.student = studentId;
  if (eventType) query.eventType = eventType;
  if (eventId) query.eventId = eventId;
  if (status) query.status = status;

  return await eventRegistrationRepository.find(query, {
    populate: [
      { path: "eventId", select: "title startTime endTime" },
      { path: "student", select: "name email" },
    ],
    sort: { registeredAt: -1 },
  });
};

export const getRegistrationById = async (id) => {
  return await eventRegistrationRepository.findById(id, [
    { path: "eventId", select: "title startTime endTime" },
    { path: "student", select: "name email" },
  ]);
};

export const getRegistrationByEvent = async (eventType, eventId, studentId) => {
  return await eventRegistrationRepository.findOne(
    {
      student: studentId,
      eventType,
      eventId,
    },
    [
      { path: "eventId", select: "title startTime endTime" },
    ]
  );
};

export const getMyEventsDashboard = async (studentId) => {
  const registrations = await eventRegistrationRepository.find(
    { student: studentId },
    {
      populate: [
        { path: "eventId", select: "title startTime endTime" },
      ],
      sort: { registeredAt: -1 },
    }
  );

  const now = new Date();
  const upcoming = [];
  const live = [];
  const past = [];

  for (const reg of registrations) {
    const event = reg.eventId;
    if (!event) continue;

    const startTime = new Date(event.startTime);
    const endTime = new Date(event.endTime);

    if (now < startTime) {
      upcoming.push(reg);
    } else if (now >= startTime && now <= endTime) {
      live.push(reg);
    } else {
      past.push(reg);
    }
  }

  return {
    upcoming,
    live,
    past,
  };
};

export const getTournamentProgress = async (tournamentId, studentId) => {
  const tournament = await tournamentRepository.findById(tournamentId, [
    { path: "stages.test", select: "title durationMinutes totalMarks subject" },
  ]);

  if (!tournament) {
    throw new ApiError(404, "Tournament not found");
  }

  const registration = await eventRegistrationRepository.findOne({
    student: studentId,
    eventType: "tournament",
    eventId: tournamentId,
  });

  if (!registration) {
    return { qualifiedStages: [], currentStage: null };
  }

  const now = new Date();
  let currentStage = null;
  let qualifiedStages = [];

  // Check which stages student has qualified for
  for (const stage of tournament.stages) {
    const stageSession = await examSessionRepository.findOne({
      student: studentId,
      test: stage.test._id,
      status: "completed",
    });

    if (stageSession) {
      const score = stageSession.score || 0;
      if (score >= (stage.minimumMarksToQualify || 0)) {
        qualifiedStages.push(stage._id.toString());
      }
    }

    // Check if this is the current active stage
    if (
      now >= new Date(stage.startTime) &&
      now <= new Date(stage.endTime) &&
      qualifiedStages.includes(stage._id.toString())
    ) {
      currentStage = stage;
    }
  }

  return { qualifiedStages, currentStage };
};

export const updateRegistration = async (id, updateData) => {
  const registration = await eventRegistrationRepository.findById(id);
  if (!registration) {
    throw new ApiError(404, "Registration not found");
  }

  return await eventRegistrationRepository.updateById(id, updateData);
};

export default {
  registerForEvent,
  getRegistrations,
  getRegistrationById,
  getRegistrationByEvent,
  getMyEventsDashboard,
  getTournamentProgress,
  updateRegistration,
};

