import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { getGoesLiveAt } from "../utils/eventStatus.js";
import { getTournaments } from "../services/tournament.service.js";
import { getWorkshops } from "../services/workshop.service.js";

/** live-competition | workshop | both (both = live-competitions + workshops only) */
const VALID_CATEGORIES = ["live-competition", "workshop", "both"];

/** status = "open" (within registration), "close" (before), "completed" (after end); goesLiveAt = countdown target */
const addRegistrationStatus = (item) => {
  const doc = item?.toObject ? item.toObject() : { ...item };
  const now = new Date();
  const start = new Date(doc.registrationStartTime);
  const end = new Date(doc.registrationEndTime);
  if (now >= start && now <= end) doc.status = "open";
  else if (now > end) doc.status = "completed";
  else doc.status = "close";
  doc.goesLiveAt = getGoesLiveAt(item, { onlyWithin24Hours: true });
  return doc;
};

/**
 * Get all published events. Response always has data: { olympiads, tournaments, workshops } and meta pagination.
 *
 * Query params:
 * - category: "olympiad" | "live-competition" | "workshop" | "both" — filter (both = live-competitions + workshops only)
 * - status: "close" | "open" | "upcoming" | "live" | "completed" — filter by event status
 * - search: string — search in title/description/subject (case-insensitive)
 * - page, limit: pagination (limit max 50)
 */
export const getAllEvents = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, category, status, search } = req.query;
  const pageNum = parseInt(page);
  const limitNum = Math.min(parseInt(limit) || 20, 50);

  const normalizedCategory = typeof category === "string" ? category.trim().toLowerCase() : null;

  if (normalizedCategory && !VALID_CATEGORIES.includes(normalizedCategory)) {
    return res.status(400).json(
      ApiResponse.error(
        "Invalid category. Use: live-competition, workshop, or both",
        null,
        { validCategories: VALID_CATEGORIES }
      )
    );
  }

  const fetchTournaments =
    !normalizedCategory || normalizedCategory === "live-competition" || normalizedCategory === "both";
  const fetchWorkshops =
    !normalizedCategory || normalizedCategory === "workshop" || normalizedCategory === "both";

  const baseOptions = {
    page: pageNum,
    limit: limitNum,
    isPublished: true,
    search: search || undefined,
    status: status || undefined,
  };

  // ── Fetch data from services (conditional on resolved category) ──────────
  const [tournamentResult, workshopResult] = await Promise.all([
    fetchTournaments
      ? getTournaments(baseOptions)
      : Promise.resolve({ tournaments: [], pagination: null }),
    fetchWorkshops
      ? getWorkshops(baseOptions)
      : Promise.resolve({ workshops: [], pagination: null }),
  ]);
  // ─────────────────────────────────────────────────────────────────────────

  const message = !normalizedCategory || normalizedCategory === "both"
    ? "Live-competitions and workshops fetched successfully"
    : `${normalizedCategory.replace(/s$/, "")} fetched successfully`;

  // Strip meeting link/password from workshops in list – only show on detail for purchased users
  const workshopsSafe = (workshopResult.workshops || []).map((w) => {
    const doc = addRegistrationStatus(w);
    delete doc.meetingLink;
    delete doc.meetingPassword;
    return doc;
  });

  return res.status(200).json(
    ApiResponse.success(
      {
        "live-competitions": (tournamentResult.tournaments || []).map(addRegistrationStatus),
        workshops: workshopsSafe,
      },
      message,
      {
        "live-competitionsPagination": tournamentResult.pagination,
        workshopsPagination: workshopResult.pagination,
      }
    )
  );
});

export default {
  getAllEvents,
};
