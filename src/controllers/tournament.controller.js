import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
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

  return res.status(200).json(
    ApiResponse.success(result.tournaments, "Tournaments fetched successfully", result.pagination)
  );
});

export const getTournamentById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const tournament = await tournamentService.getTournamentById(id, true);
  return res.status(200).json(
    ApiResponse.success(tournament, "Tournament fetched successfully")
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
    "completed",
    value.paymentId
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
  getPublishedTournaments,
  getTournamentDetails,
  registerForTournament,
};

