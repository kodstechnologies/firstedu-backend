import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { getEventStatus, getGoesLiveAt, withEventStatus } from "../utils/eventStatus.js";
import tournamentService from "../services/tournament.service.js";
import eventRegistrationService from "../services/eventRegistration.service.js";
import tournamentValidator from "../validation/tournament.validator.js";

// ==================== ADMIN CONTROLLERS ====================

export const createTournament = asyncHandler(async (req, res) => {
  const { error, value } = tournamentValidator.createTournament.validate(req.body);

  if (error) {
    throw new ApiError(
      400,
      "Validation Error",
      error.details.map((x) => x.message)
    );
  }

  const tournament = await tournamentService.createTournament(value, req.user._id, req.file);
  return res.status(201).json(
    ApiResponse.success(tournament, "Tournament created successfully")
  );
});

export const getTournaments = asyncHandler(async (req, res) => {
  const { page, limit, search, isPublished } = req.query;
  const result = await tournamentService.getTournaments({
    page,
    limit,
    search,
    isPublished,
  });

  const tournamentsWithStatus = (result.tournaments || []).map((t) => ({
    ...(t?.toObject ? t.toObject() : t),
    status: getEventStatus(t),
    goesLiveAt: getGoesLiveAt(t),
  }));
  return res.status(200).json(
    ApiResponse.success(tournamentsWithStatus, "Tournaments fetched successfully", result.pagination)
  );
});

export const getTournamentById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const tournament = await tournamentService.getTournamentById(id, true);
  return res.status(200).json(
    ApiResponse.success(
      {
        ...(tournament?.toObject ? tournament.toObject() : tournament),
        status: getEventStatus(tournament),
        goesLiveAt: getGoesLiveAt(tournament),
      },
      "Tournament fetched successfully"
    )
  );
});

export const updateTournament = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { error, value } = tournamentValidator.updateTournament.validate(req.body);

  if (error) {
    throw new ApiError(
      400,
      "Validation Error",
      error.details.map((x) => x.message)
    );
  }

  const tournament = await tournamentService.updateTournament(id, value, req.file);
  return res.status(200).json(
    ApiResponse.success(tournament, "Tournament updated successfully")
  );
});

export const deleteTournament = asyncHandler(async (req, res) => {
  const { id } = req.params;
  await tournamentService.deleteTournament(id);
  return res.status(200).json(
    ApiResponse.success(null, "Tournament deleted successfully")
  );
});

export const getTournamentLeaderboard = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const limit = Math.min(parseInt(req.query.limit) || 20, 100);
  const result = await tournamentService.getTournamentLeaderboard(id, limit);
  return res.status(200).json(
    ApiResponse.success(result, "Tournament leaderboard fetched successfully")
  );
});

export const declareTournamentWinners = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { error, value } = tournamentValidator.declareWinners.validate(req.body);
  if (error) {
    throw new ApiError(
      400,
      "Validation Error",
      error.details.map((x) => x.message)
    );
  }
  const result = await tournamentService.declareTournamentWinners(id, value);
  return res.status(200).json(
    ApiResponse.success(result, "Winners declared and points credited")
  );
});

// ==================== STUDENT CONTROLLERS ====================

export const getPublishedTournaments = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10, search, status, registeredOnly, category } = req.query;

  const result = await tournamentService.getTournaments({
    page,
    limit,
    search,
    status: status || undefined,
    isPublished: true,
    category: category || undefined,
  });

  let tournamentsWithStatus = await Promise.all(
    result.tournaments.map(async (tournament) => {
      const registration = await eventRegistrationService.getRegistrationByEvent(
        "tournament",
        tournament._id,
        req.user._id
      );
      const obj = withEventStatus(tournament, !!registration);
      const stagesWithSession = await tournamentService.buildTournamentStagesWithStudentAccess(
        tournament,
        req.user._id
      );

      return {
        ...obj,
        stages: stagesWithSession,
        isRegistered: !!registration,
      };
    })
  );

  if (registeredOnly === "true" || registeredOnly === true) {
    tournamentsWithStatus = tournamentsWithStatus.filter((t) => t.isRegistered);
  }

  return res.status(200).json(
    ApiResponse.success(tournamentsWithStatus, "Tournaments fetched successfully", result.pagination)
  );
});

export const getTournamentDetails = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const tournament = await tournamentService.getTournamentById(id, false);
  if (!tournament.isPublished) {
    throw new ApiError(404, "Tournament not found");
  }

  const registration = await eventRegistrationService.getRegistrationByEvent(
    "tournament",
    tournament._id,
    req.user._id
  );
  const { qualifiedStages, currentStage } = await eventRegistrationService.getTournamentProgress(
    tournament._id,
    req.user._id
  );
  const obj = withEventStatus(tournament, !!registration);
  const stagesWithSession = await tournamentService.buildTournamentStagesWithStudentAccess(
    tournament,
    req.user._id
  );

  return res.status(200).json(
    ApiResponse.success(
      {
        ...obj,
        stages: stagesWithSession,
        isRegistered: !!registration,
        currentStage,
        qualifiedStages,
      },
      "Tournament details fetched successfully"
    )
  );
});

export const initiateTournamentPayment = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { error, value } = tournamentValidator.initiateTournamentPayment.validate(req.body);

  if (error) {
    throw new ApiError(
      400,
      "Validation Error",
      error.details.map((x) => x.message)
    );
  }

  const result = await eventRegistrationService.initiateEventRegistration(
    "tournament",
    id,
    req.user._id,
    value.paymentMethod,
    { couponCode: value?.couponCode }
  );

  if (result.completed) {
    return res.status(201).json(
      ApiResponse.success(result.registration, "Successfully registered for tournament")
    );
  }

  return res.status(200).json(
    ApiResponse.success(result, "Payment order created. Complete payment and call register API.")
  );
});

export const registerForTournament = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { error, value } = tournamentValidator.registerForTournament.validate(req.body);

  if (error) {
    throw new ApiError(
      400,
      "Validation Error",
      error.details.map((x) => x.message)
    );
  }

  const registration = await eventRegistrationService.registerForEvent(
    "tournament",
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
    ApiResponse.success(registration, "Successfully registered for tournament")
  );
});

export default {
  createTournament,
  getTournaments,
  getTournamentById,
  updateTournament,
  deleteTournament,
  getTournamentLeaderboard,
  declareTournamentWinners,
  getPublishedTournaments,
  getTournamentDetails,
  registerForTournament,
  initiateTournamentPayment,
};

