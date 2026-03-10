import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { getEventStatus, getGoesLiveAt, withEventStatus } from "../utils/eventStatus.js";
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

  const olympiad = await olympiadService.createOlympiad(value, req.user._id, req.file);
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

  const olympiadsWithStatus = (result.olympiads || []).map((o) => ({
    ...(o?.toObject ? o.toObject() : o),
    status: getEventStatus(o),
    goesLiveAt: getGoesLiveAt(o),
  }));
  return res.status(200).json(
    ApiResponse.success(olympiadsWithStatus, "Olympiads fetched successfully", result.pagination)
  );
});

export const getOlympiadById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const olympiad = await olympiadService.getOlympiadById(id, true);
  return res.status(200).json(
    ApiResponse.success(
      {
        ...(olympiad?.toObject ? olympiad.toObject() : olympiad),
        status: getEventStatus(olympiad),
        goesLiveAt: getGoesLiveAt(olympiad),
      },
      "Olympiad fetched successfully"
    )
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

  const olympiad = await olympiadService.updateOlympiad(id, value, req.file);
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

export const getOlympiadLeaderboard = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const limit = Math.min(parseInt(req.query.limit) || 20, 100);
  const result = await olympiadService.getOlympiadLeaderboard(id, limit);
  return res.status(200).json(
    ApiResponse.success(result, "Olympiad leaderboard fetched successfully")
  );
});

export const declareOlympiadWinners = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { error, value } = olympiadValidator.declareWinners.validate(req.body);
  if (error) {
    throw new ApiError(
      400,
      "Validation Error",
      error.details.map((x) => x.message)
    );
  }
  const result = await olympiadService.declareOlympiadWinners(id, value);
  return res.status(200).json(
    ApiResponse.success(result, "Winners declared and points credited")
  );
});

// ==================== STUDENT CONTROLLERS ====================

export const getPublishedOlympiads = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10, search, status, registeredOnly, category } = req.query;

  const result = await olympiadService.getOlympiads({
    page,
    limit,
    search,
    status: status || undefined,
    isPublished: true,
    category: category || undefined,
  });

  let olympiadsWithStatus = await Promise.all(
    result.olympiads.map(async (olympiad) => {
      const registration = await eventRegistrationService.getRegistrationByEvent(
        "olympiad",
        olympiad._id,
        req.user._id
      );
      const obj = withEventStatus(olympiad, !!registration);
      return { ...obj, isRegistered: !!registration };
    })
  );

  if (registeredOnly === "true" || registeredOnly === true) {
    olympiadsWithStatus = olympiadsWithStatus.filter((o) => o.isRegistered);
  }

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
  const obj = withEventStatus(olympiad, !!registration);
  return res.status(200).json(
    ApiResponse.success(
      { ...obj, isRegistered: !!registration },
      "Olympiad details fetched successfully"
    )
  );
});

export const initiateOlympiadPayment = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { error, value } = olympiadValidator.initiateOlympiadPayment.validate(req.body);

  if (error) {
    throw new ApiError(
      400,
      "Validation Error",
      error.details.map((x) => x.message)
    );
  }

  const result = await eventRegistrationService.initiateEventRegistration(
    "olympiad",
    id,
    req.user._id,
    value.paymentMethod
  );

  if (result.completed) {
    return res.status(201).json(
      ApiResponse.success(result.registration, "Successfully registered for olympiad")
    );
  }

  return res.status(200).json(
    ApiResponse.success(result, "Payment order created. Complete payment and call register API.")
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
    {
      paymentMethod: "gateway",
      razorpayOrderId: value.razorpayOrderId,
      razorpayPaymentId: value.razorpayPaymentId,
      razorpaySignature: value.razorpaySignature,
    }
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
  getOlympiadLeaderboard,
  declareOlympiadWinners,
  getPublishedOlympiads,
  getOlympiadDetails,
  registerForOlympiad,
  initiateOlympiadPayment,
  getOlympiadLobby,
};

