import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import tournamentService from "../services/tournament.service.js";

/**
 * Student-facing: aggregated leaderboard API for tournaments.
 *
 * Query params:
 * - type: "tournament" | "all" (default: "all")
 * - eventId: optional; when provided, returns leaderboard only for that event
 * - page, limit: pagination over completed events when eventId is not provided
 */
export const getLeaderboardsForStudent = asyncHandler(async (req, res) => {
  const {
    type = "all",
    eventId,
    page = 1,
    limit = 10,
  } = req.query;

  const normalizedType = String(type).toLowerCase();

  if (eventId) {
    if (normalizedType !== "tournament" && normalizedType !== "all") {
      throw new ApiError(
        400,
        "Invalid type. Use: tournament when eventId is provided"
      );
    }

    const maxParticipants = 1000;

    const result = await tournamentService.getTournamentLeaderboard(
      eventId,
      maxParticipants
    );
    return res.status(200).json(
      ApiResponse.success(
        {
          type: "tournament",
          eventId,
          title: result.tournamentTitle,
          stage: result.stage,
          leaderboard: result.leaderboard,
        },
        "Tournament leaderboard fetched successfully"
      )
    );
  }

  // Aggregated mode: list all completed events with their leaderboards
  const pageNum = parseInt(page) || 1;
  const limitNum = Math.min(parseInt(limit) || 10, 50);

  const includeTournaments =
    normalizedType === "all" || normalizedType === "tournament";

  if (!includeTournaments) {
    throw new ApiError(
      400,
      "Invalid type. Use: tournament, or all"
    );
  }

  const events = [];

  // Fetch completed tournaments
  if (includeTournaments) {
    const tournamentResult = await tournamentService.getTournaments({
      page: pageNum,
      limit: limitNum,
      status: "completed",
      isPublished: true,
    });

    for (const t of tournamentResult.tournaments || []) {
      const leaderboardResult =
        await tournamentService.getTournamentLeaderboard(t._id, 1000);
      events.push({
        type: "tournament",
        eventId: t._id,
        title: t.title,
        stage: leaderboardResult.stage,
        status: "completed",
        leaderboard: leaderboardResult.leaderboard,
        totalParticipants: leaderboardResult.leaderboard.length,
      });
    }
  }

  return res.status(200).json(
    ApiResponse.success(
      {
        items: events,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: events.length,
          pages: 1,
        },
      },
      "Leaderboards fetched successfully"
    )
  );
});

export default {
  getLeaderboardsForStudent,
};

