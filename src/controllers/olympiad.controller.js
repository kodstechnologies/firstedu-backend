import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import olympiadService from "../services/olympiad.service.js";
import eventRegistrationService from "../services/eventRegistration.service.js";
import olympiadValidator from "../validation/olympiad.validator.js";

// ==================== ADMIN CONTROLLERS ====================

export const createOlympiad = asyncHandler(async (req, res) => {
  const { error, value } = olympiadValidator.createOlympiad.validate(req.body);

  if (error) {
    throw new ApiError(
      400,
      "Validation Error",
      error.details.map((x) => x.message)
    );
  }

  const olympiad = await olympiadService.createOlympiad(value, req.user._id);
  return res.status(201).json(
    ApiResponse.success(olympiad, "Olympiad created successfully")
  );
});

export const getOlympiads = asyncHandler(async (req, res) => {
  const { page, limit, search, isPublished } = req.query;
  const result = await olympiadService.getOlympiads({
    page,
    limit,
    search,
    isPublished,
  });

  return res.status(200).json(
    ApiResponse.success(result.olympiads, "Olympiads fetched successfully", result.pagination)
  );
});

export const getOlympiadById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const olympiad = await olympiadService.getOlympiadById(id, true);
  return res.status(200).json(
    ApiResponse.success(olympiad, "Olympiad fetched successfully")
  );
});

export const updateOlympiad = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { error, value } = olympiadValidator.updateOlympiad.validate(req.body);

  if (error) {
    throw new ApiError(
      400,
      "Validation Error",
      error.details.map((x) => x.message)
    );
  }

  const olympiad = await olympiadService.updateOlympiad(id, value);
  return res.status(200).json(
    ApiResponse.success(olympiad, "Olympiad updated successfully")
  );
});

export const deleteOlympiad = asyncHandler(async (req, res) => {
  const { id } = req.params;
  await olympiadService.deleteOlympiad(id);
  return res.status(200).json(
    ApiResponse.success(null, "Olympiad deleted successfully")
  );
});

// ==================== STUDENT CONTROLLERS ====================

export const getPublishedOlympiads = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10, search } = req.query;

  const result = await olympiadService.getOlympiads({
    page,
    limit,
    search,
    isPublished: true,
  });

  // Check registration status for each olympiad
  const olympiadsWithStatus = await Promise.all(
    result.olympiads.map(async (olympiad) => {
      const registration = await eventRegistrationService.getRegistrationByEvent(
        "olympiad",
        olympiad._id,
        req.user._id
      );

      const now = new Date();
      const isRegistrationOpen =
        now >= new Date(olympiad.registrationStartTime) &&
        now <= new Date(olympiad.registrationEndTime);
      const isEventLive =
        now >= new Date(olympiad.startTime) && now <= new Date(olympiad.endTime);
      const canJoin = registration && isEventLive;

      return {
        ...olympiad.toObject(),
        isRegistered: !!registration,
        isRegistrationOpen,
        isEventLive,
        canJoin,
      };
    })
  );

  return res.status(200).json(
    ApiResponse.success(olympiadsWithStatus, "Olympiads fetched successfully", result.pagination)
  );
});

export const getOlympiadDetails = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const olympiad = await olympiadService.getOlympiadById(id, false);
  if (!olympiad.isPublished) {
    throw new ApiError(404, "Olympiad not found");
  }

  const registration = await eventRegistrationService.getRegistrationByEvent(
    "olympiad",
    olympiad._id,
    req.user._id
  );

  const now = new Date();
  const isRegistrationOpen =
    now >= new Date(olympiad.registrationStartTime) &&
    now <= new Date(olympiad.registrationEndTime);
  const isEventLive =
    now >= new Date(olympiad.startTime) && now <= new Date(olympiad.endTime);
  const canJoin = registration && isEventLive;

  return res.status(200).json(
    ApiResponse.success(
      {
        ...olympiad.toObject(),
        isRegistered: !!registration,
        isRegistrationOpen,
        isEventLive,
        canJoin,
      },
      "Olympiad details fetched successfully"
    )
  );
});

export const registerForOlympiad = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { error, value } = olympiadValidator.registerForOlympiad.validate(req.body);

  if (error) {
    throw new ApiError(
      400,
      "Validation Error",
      error.details.map((x) => x.message)
    );
  }

  const registration = await eventRegistrationService.registerForEvent(
    "olympiad",
    id,
    req.user._id,
    "completed",
    value.paymentId
  );

  return res.status(201).json(
    ApiResponse.success(registration, "Successfully registered for olympiad")
  );
});

export const getOlympiadLobby = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const olympiad = await olympiadService.getOlympiadById(id, false);
  if (!olympiad.isPublished) {
    throw new ApiError(404, "Olympiad not found");
  }

  const registration = await eventRegistrationService.getRegistrationByEvent(
    "olympiad",
    olympiad._id,
    req.user._id
  );

  if (!registration) {
    throw new ApiError(403, "You are not registered for this olympiad");
  }

  const now = new Date();
  const timeUntilStart = new Date(olympiad.startTime) - now;
  const isEventLive =
    now >= new Date(olympiad.startTime) && now <= new Date(olympiad.endTime);

  return res.status(200).json(
    ApiResponse.success(
      {
        olympiad,
        registration,
        timeUntilStart: timeUntilStart > 0 ? timeUntilStart : 0,
        isEventLive,
        canStart: isEventLive,
      },
      "Olympiad lobby data fetched successfully"
    )
  );
});

export default {
  createOlympiad,
  getOlympiads,
  getOlympiadById,
  updateOlympiad,
  deleteOlympiad,
  getPublishedOlympiads,
  getOlympiadDetails,
  registerForOlympiad,
  getOlympiadLobby,
};

