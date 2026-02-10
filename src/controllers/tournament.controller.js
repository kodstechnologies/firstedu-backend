import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import tournamentService from "../services/tournament.service.js";
import eventRegistrationService from "../services/eventRegistration.service.js";
import tournamentValidator from "../validation/tournament.validator.js";

/** status = "open" (within registration), "close" (before), "completed" (after end) */
const withRegistrationStatus = (item) => {
  const obj = item?.toObject ? item.toObject() : { ...item };
  const now = new Date();
  const start = new Date(obj.registrationStartTime);
  const end = new Date(obj.registrationEndTime);
  if (now >= start && now <= end) obj.status = "open";
  else if (now > end) obj.status = "completed";
  else obj.status = "close";
  return obj;
};

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

  const tournament = await tournamentService.createTournament(value, req.user._id);
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

  const tournamentsWithStatus = (result.tournaments || []).map(withRegistrationStatus);
  return res.status(200).json(
    ApiResponse.success(tournamentsWithStatus, "Tournaments fetched successfully", result.pagination)
  );
});

export const getTournamentById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const tournament = await tournamentService.getTournamentById(id, true);
  return res.status(200).json(
    ApiResponse.success(withRegistrationStatus(tournament), "Tournament fetched successfully")
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

  const tournament = await tournamentService.updateTournament(id, value);
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
  const { page = 1, limit = 10, search } = req.query;

  const result = await tournamentService.getTournaments({
    page,
    limit,
    search,
    isPublished: true,
  });

  // Check registration status
  const tournamentsWithStatus = await Promise.all(
    result.tournaments.map(async (tournament) => {
      const registration = await eventRegistrationService.getRegistrationByEvent(
        "tournament",
        tournament._id,
        req.user._id
      );

      const now = new Date();
      const isRegistrationOpen =
        now >= new Date(tournament.registrationStartTime) &&
        now <= new Date(tournament.registrationEndTime);

      return {
        ...tournament.toObject(),
        isRegistered: !!registration,
        isRegistrationOpen,
        status: isRegistrationOpen ? "open" : (now > new Date(tournament.registrationEndTime) ? "completed" : "close"),
      };
    })
  );

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

  const now = new Date();
  const isRegistrationOpen =
    now >= new Date(tournament.registrationStartTime) &&
    now <= new Date(tournament.registrationEndTime);

  // Get student's progress through stages
  const { qualifiedStages, currentStage } = await eventRegistrationService.getTournamentProgress(
    tournament._id,
    req.user._id
  );

  return res.status(200).json(
    ApiResponse.success(
      {
        ...tournament.toObject(),
        isRegistered: !!registration,
        isRegistrationOpen,
        status: isRegistrationOpen ? "open" : (now > new Date(tournament.registrationEndTime) ? "completed" : "close"),
        currentStage,
        qualifiedStages,
      },
      "Tournament details fetched successfully"
    )
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
      paymentStatus: "completed",
      paymentId: value.paymentId,
      paymentMethod: value.paymentMethod,
    }
  );

  return res.status(201).json(
    ApiResponse.success(registration, "Successfully registered for tournament")
  );
});

export const initiateTournamentPayment = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const data = await eventRegistrationService.initiateEventPayment(
    "tournament",
    id,
    req.user._id
  );
  return res.status(200).json(
    ApiResponse.success(data, "Payment order created. Complete payment to register.")
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

