import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import olympiadService from "../services/olympiad.service.js";
import tournamentService from "../services/tournament.service.js";
import workshopService from "../services/workshop.service.js";

/** Only 3 categories: olympiad, tournament, workshop */
const VALID_CATEGORIES = ["olympiad", "tournament", "workshop"];

/** status = "open" (within registration), "close" (before), "completed" (after end) */
const addRegistrationStatus = (item) => {
  const doc = item?.toObject ? item.toObject() : { ...item };
  const now = new Date();
  const start = new Date(doc.registrationStartTime);
  const end = new Date(doc.registrationEndTime);
  if (now >= start && now <= end) doc.status = "open";
  else if (now > end) doc.status = "completed";
  else doc.status = "close";
  return doc;
};

/**
 * Get all published events. Response always has data: { olympiads, tournaments, workshops } and meta pagination.
 *
 * Query params:
 * - category: "olympiad" | "tournament" | "workshop" — filter to one type (only that array is filled)
 * - search: string — search in title/description/subject (case-insensitive)
 * - page, limit: pagination (limit max 50)
 */
export const getAllEvents = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, category, search } = req.query;
  const pageNum = parseInt(page);
  const limitNum = Math.min(parseInt(limit) || 20, 50);

  const normalizedCategory = typeof category === "string" ? category.trim().toLowerCase() : null;

  if (normalizedCategory && !VALID_CATEGORIES.includes(normalizedCategory)) {
    return res.status(400).json(
      ApiResponse.error(
        "Invalid category. Use: olympiad, tournament, or workshop",
        null,
        { validCategories: VALID_CATEGORIES }
      )
    );
  }

  const fetchOlympiads = !normalizedCategory || normalizedCategory === "olympiad";
  const fetchTournaments = !normalizedCategory || normalizedCategory === "tournament";
  const fetchWorkshops = !normalizedCategory || normalizedCategory === "workshop";

  const baseOptions = { page: pageNum, limit: limitNum, isPublished: true, search: search || undefined };

  const [olympiadResult, tournamentResult, workshopResult] = await Promise.all([
    fetchOlympiads ? olympiadService.getOlympiads(baseOptions) : Promise.resolve({ olympiads: [], pagination: { page: pageNum, limit: limitNum, total: 0, pages: 0 } }),
    fetchTournaments ? tournamentService.getTournaments(baseOptions) : Promise.resolve({ tournaments: [], pagination: { page: pageNum, limit: limitNum, total: 0, pages: 0 } }),
    fetchWorkshops ? workshopService.getWorkshops(baseOptions) : Promise.resolve({ workshops: [], pagination: { page: pageNum, limit: limitNum, total: 0, pages: 0 } }),
  ]);

  const message = normalizedCategory
    ? `${normalizedCategory.replace(/s$/, "")} fetched successfully`
    : "Olympiads, tournaments and workshops fetched successfully";

  return res.status(200).json(
    ApiResponse.success(
      {
        olympiads: (olympiadResult.olympiads || []).map(addRegistrationStatus),
        tournaments: (tournamentResult.tournaments || []).map(addRegistrationStatus),
        workshops: (workshopResult.workshops || []).map(addRegistrationStatus),
      },
      message,
      {
        olympiadsPagination: olympiadResult.pagination,
        tournamentsPagination: tournamentResult.pagination,
        workshopsPagination: workshopResult.pagination,
      }
    )
  );
});

export default {
  getAllEvents,
};
