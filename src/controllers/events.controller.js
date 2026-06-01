import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { getGoesLiveAt } from "../utils/eventStatus.js";
import { getEvents as getLiveCompetitions, getEventById as getLiveCompByIdService } from "../services/liveCompetition.service.js";
import { getWorkshops } from "../services/workshop.service.js";

/** live-competition | workshop | both (both = live-competitions + workshops only) */
const VALID_CATEGORIES = ["live-competition", "workshop", "both"];

/** status = "open" (within registration), "close" (before), "completed" (after end); goesLiveAt = countdown target */
const addRegistrationStatus = (item) => {
  const doc = item?.toObject ? item.toObject() : { ...item };
  const now = new Date();

  // If it's a LiveCompetition (has megaAudition)
  if (doc.megaAudition && doc.megaAudition.registration) {
    const start = new Date(doc.megaAudition.registration.start);
    const end = new Date(doc.megaAudition.registration.end);
    if (now >= start && now <= end) doc.status = "open";
    else if (now > end) doc.status = "completed";
    else doc.status = "close";

    // Map fields for frontend compatibility
    doc.registrationStartTime = doc.megaAudition.registration.start;
    doc.registrationEndTime = doc.megaAudition.registration.end;
    
    // Map Stages
    doc.stages = [];
    if (doc.megaAudition && doc.megaAudition.eventWindow) {
      doc.stages.push({
        _id: 'mega',
        name: doc.megaAudition.title || "Mega Audition",
        subject: doc.category?.name || "Competition",
        startTime: doc.megaAudition.eventWindow.start,
        endTime: doc.megaAudition.eventWindow.end
      });
    }
    if (doc.grandFinale && doc.grandFinale.isVisible !== false && doc.grandFinale.eventWindow) {
      doc.stages.push({
        _id: 'grand',
        name: doc.grandFinale.title || "Grand Finale",
        subject: doc.category?.name || "Competition",
        startTime: doc.grandFinale.eventWindow.start,
        endTime: doc.grandFinale.eventWindow.end
      });
    }
    
    // Map pricing and prizes
    doc.price = doc.megaAudition.fee?.amount || 0;
    if (doc.prizes && doc.prizes.length > 0) {
      const p1 = doc.prizes.find(p => p.rank === 1);
      const p2 = doc.prizes.find(p => p.rank === 2);
      const p3 = doc.prizes.find(p => p.rank === 3);
      if (p1) {
        doc.firstPlacePoints = p1.walletPoints;
        doc.points = p1.walletPoints;
      }
      if (p2) doc.secondPlacePoints = p2.walletPoints;
      if (p3) doc.thirdPlacePoints = p3.walletPoints;
    }
    
    // Support image/cover for frontend
    if (doc.bannerUrl) doc.image = doc.bannerUrl;
    
    // GoesLiveAt based on megaAudition eventWindow
    if (doc.megaAudition.eventWindow) {
      doc.goesLiveAt = getGoesLiveAt({
        startTime: doc.megaAudition.eventWindow.start,
        endTime: doc.megaAudition.eventWindow.end
      }, { onlyWithin24Hours: true });
    }

    // Clean up backend-specific properties to reduce payload size
    delete doc.megaAudition;
    delete doc.grandFinale;
    delete doc.prizes;
  } else {
    // Fallback for Workshops / Tournaments
    const start = new Date(doc.registrationStartTime);
    const end = new Date(doc.registrationEndTime);
    if (now >= start && now <= end) doc.status = "open";
    else if (now > end) doc.status = "completed";
    else doc.status = "close";
    doc.goesLiveAt = getGoesLiveAt(item, { onlyWithin24Hours: true });
  }

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
  const [liveCompetitionResult, workshopResult] = await Promise.all([
    fetchTournaments
      ? getLiveCompetitions(baseOptions)
      : Promise.resolve({ events: [], pagination: null }),
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
        "live-competitions": (liveCompetitionResult.events || []).map(addRegistrationStatus),
        workshops: workshopsSafe,
      },
      message,
      {
        "live-competitionsPagination": liveCompetitionResult.pagination,
        workshopsPagination: workshopResult.pagination,
      }
    )
  );
});

export const getLiveCompetitionById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const event = await getLiveCompByIdService(id);
  const mappedEvent = addRegistrationStatus(event);
  return res.status(200).json(ApiResponse.success(mappedEvent, "Live competition fetched successfully"));
});

export default {
  getAllEvents,
  getLiveCompetitionById,
};
