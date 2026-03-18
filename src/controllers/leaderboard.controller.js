import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import olympiadService from "../services/olympiad.service.js";
import tournamentService from "../services/tournament.service.js";

/**
 * Student-facing: aggregated leaderboard API for olympiads and tournaments.
 *
 * Query params:
 * - type: "olympiad" | "tournament" | "all" (default: "all")
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
    // Single event leaderboard (either olympiad or tournament determined by type)
    if (normalizedType !== "olympiad" && normalizedType !== "tournament") {
      throw new ApiError(
        400,
        "Invalid type. Use: olympiad or tournament when eventId is provided"
      );
    }

    const maxParticipants = 1000;

    if (normalizedType === "olympiad") {
      const result = await olympiadService.getOlympiadLeaderboard(
        eventId,
        maxParticipants
      );
      return res.status(200).json(
        ApiResponse.success(
          {
            type: "olympiad",
            eventId,
            title: result.olympiadTitle,
            leaderboard: result.leaderboard,
          },
          "Olympiad leaderboard fetched successfully"
        )
      );
    }

    if (normalizedType === "tournament") {
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
  }

  // Aggregated mode: list all completed events with their leaderboards
  const pageNum = parseInt(page) || 1;
  const limitNum = Math.min(parseInt(limit) || 10, 50);

  const includeOlympiads =
    normalizedType === "all" || normalizedType === "olympiad";
  const includeTournaments =
    normalizedType === "all" || normalizedType === "tournament";

  if (!includeOlympiads && !includeTournaments) {
    throw new ApiError(
      400,
      "Invalid type. Use: olympiad, tournament, or all"
    );
  }

  const events = [];

  // Fetch completed olympiads
  if (includeOlympiads) {
    const olympiadResult = await olympiadService.getOlympiads({
      page: pageNum,
      limit: limitNum,
      status: "completed",
      isPublished: true,
    });

    for (const o of olympiadResult.olympiads || []) {
      const leaderboardResult = await olympiadService.getOlympiadLeaderboard(
        o._id,
        1000
      );
      events.push({
        type: "olympiad",
        eventId: o._id,
        title: o.title,
        status: "completed",
        leaderboard: leaderboardResult.leaderboard,
        totalParticipants: leaderboardResult.leaderboard.length,
      });
    }
  }

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

