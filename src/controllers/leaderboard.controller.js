import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import tournamentService from "../services/tournament.service.js";
import {
  getOlympiadLeaderboard,
  getCompletedOlympiads,
} from "../services/studentOlympiad.service.js";

const VALID_TYPES = ["tournament", "olympiad"];

/**
 * Student-facing: aggregated leaderboard API for olympiads and tournaments.
 *
 * Query params:
 * - type: "tournament" | "olympiad"
 * - eventId: optional; when provided, returns leaderboard only for that event
 * - page, limit: pagination over completed events when eventId is not provided
 *
 * The frontend always sends a specific type matching the active tab.
 * Olympiad tab  → type=olympiad  → returns only completed olympiads
 * Tournament tab → type=tournament → returns only completed tournaments
 */
export const getLeaderboardsForStudent = asyncHandler(async (req, res) => {
  const {
    type,
    eventId,
    page = 1,
    limit = 10,
  } = req.query;

  const normalizedType = String(type || "").toLowerCase();

  if (!VALID_TYPES.includes(normalizedType)) {
    throw new ApiError(400, "Invalid type. Use: tournament or olympiad");
  }

  const pageNum = parseInt(page) || 1;
  const limitNum = Math.min(parseInt(limit) || 10, 50);

  // ── SINGLE EVENT MODE ────────────────────────────────────────────────────────
  // Returns one event's full leaderboard when eventId is provided.

  if (eventId) {
    if (normalizedType === "tournament") {
      const result = await tournamentService.getTournamentLeaderboard(
        eventId,
        1000
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

    // type === "olympiad"
    const result = await getOlympiadLeaderboard(eventId, 1000);
    return res.status(200).json(
      ApiResponse.success(
        {
          type: "olympiad",
          eventId,
          title: result.olympiadTitle,
          stage: null,
          leaderboard: result.leaderboard,
        },
        "Olympiad leaderboard fetched successfully"
      )
    );
  }

  // ── LIST MODE ────────────────────────────────────────────────────────────────
  // Returns paginated list of completed events for the requested type only.
  // Each item already contains its leaderboard so the frontend avoids a
  // second round-trip when auto-selecting the first event.

  if (normalizedType === "tournament") {
    const tournamentResult = await tournamentService.getTournaments({
      page: pageNum,
      limit: limitNum,
      status: "completed",
      isPublished: true,
    });

    const tournaments = tournamentResult.tournaments || [];

    // Fetch all leaderboards in parallel (avoids serial N+1 loop)
    const leaderboards = tournaments.length
      ? await Promise.all(
          tournaments.map((t) =>
            tournamentService.getTournamentLeaderboard(t._id, 1000)
          )
        )
      : [];

    const items = tournaments.map((t, i) => {
      const lb = leaderboards[i];
      return {
        type: "tournament",
        eventId: t._id,
        title: t.title,
        stage: lb.stage,
        status: "completed",
        leaderboard: lb.leaderboard,
        totalParticipants: lb.leaderboard.length,
      };
    });

    return res.status(200).json(
      ApiResponse.success(
        {
          items,
          pagination: {
            page: pageNum,
            limit: limitNum,
            total: items.length,
            pages: 1,
          },
        },
        "Leaderboards fetched successfully"
      )
    );
  }

  // type === "olympiad"
  const olympiadResult = await getCompletedOlympiads({
    page: pageNum,
    limit: limitNum,
  });

  const olympiads = olympiadResult.olympiads || [];

  // Fetch all leaderboards in parallel
  const leaderboards = olympiads.length
    ? await Promise.all(
        olympiads.map((o) => getOlympiadLeaderboard(o._id, 1000))
      )
    : [];

  const items = olympiads.map((o, i) => {
    const lb = leaderboards[i];
    return {
      type: "olympiad",
      eventId: o._id,
      title: o.title,
      stage: null,
      status: "completed",
      leaderboard: lb.leaderboard,
      totalParticipants: lb.leaderboard.length,
    };
  });

  return res.status(200).json(
    ApiResponse.success(
      {
        items,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: items.length,
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
