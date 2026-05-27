import mongoose from "mongoose";
import LiveCompetition from "../models/LiveCompetition.js";
import LiveCompetitionSubmission from "../models/LiveCompetitionSubmission.js";
import { ApiError } from "../utils/ApiError.js";

// ─── LiveCompetition (Event) ───────────────────────────────────────────────

const createEvent = async (data) => {
  try {
    return await LiveCompetition.create(data);
  } catch (error) {
    throw new ApiError(500, "Failed to create live competition", error.message);
  }
};

const findEvents = async (filter = {}, options = {}) => {
  const { populate = [], sort = { createdAt: -1 }, skip = 0, limit = 10 } = options;
  let query = LiveCompetition.find(filter);
  populate.forEach((pop) => {
    query = query.populate(pop.populate ? pop : { path: pop.path, select: pop.select });
  });
  return query.sort(sort).skip(skip).limit(limit);
};

const findEventById = async (id, populate = []) => {
  let query = LiveCompetition.findById(id);
  populate.forEach((pop) => {
    query = query.populate(pop.populate ? pop : { path: pop.path, select: pop.select });
  });
  return query;
};

const updateEventById = async (id, updateData) => {
  return LiveCompetition.findByIdAndUpdate(id, { $set: updateData }, { new: true });
};

const deleteEventById = async (id) => {
  return LiveCompetition.findByIdAndDelete(id);
};

const countEvents = async (filter = {}) => {
  return LiveCompetition.countDocuments(filter);
};

/**
 * Increment per-round stats on a LiveCompetition document.
 * round = "MEGA_AUDITION" | "GRAND_FINALE"
 */
const incrementEventStats = async (id, { round, participants = 0, submissions = 0 }) => {
  const inc = {};
  const prefix = round === "GRAND_FINALE" ? "grandFinale" : "megaAudition";
  if (participants) inc[`${prefix}.totalParticipants`] = participants;
  if (submissions)  inc[`${prefix}.totalSubmissions`]  = submissions;
  return LiveCompetition.findByIdAndUpdate(id, { $inc: inc }, { new: true });
};

// ─── LiveCompetitionSubmission ─────────────────────────────────────────────

const createSubmission = async (data) => {
  try {
    return await LiveCompetitionSubmission.create(data);
  } catch (error) {
    if (error.code === 11000) {
      throw new ApiError(409, "You have already registered for this round of the event");
    }
    throw new ApiError(500, "Failed to create submission", error.message);
  }
};

const findSubmissions = async (filter = {}, options = {}) => {
  const { populate = [], sort = { createdAt: -1 }, skip = 0, limit = 20 } = options;
  let query = LiveCompetitionSubmission.find(filter);
  populate.forEach((pop) => {
    query = query.populate(pop.populate ? pop : { path: pop.path, select: pop.select });
  });
  return query.sort(sort).skip(skip).limit(limit);
};

const findSubmissionById = async (id, populate = []) => {
  let query = LiveCompetitionSubmission.findById(id);
  populate.forEach((pop) => {
    query = query.populate(pop.populate ? pop : { path: pop.path, select: pop.select });
  });
  return query;
};

const findOneSubmission = async (filter, populate = []) => {
  let query = LiveCompetitionSubmission.findOne(filter);
  populate.forEach((pop) => {
    query = query.populate(pop.populate ? pop : { path: pop.path, select: pop.select });
  });
  return query;
};

const updateSubmissionById = async (id, updateData) => {
  return LiveCompetitionSubmission.findByIdAndUpdate(id, { $set: updateData }, { new: true });
};

const deleteSubmissionById = async (id) => {
  return LiveCompetitionSubmission.findByIdAndDelete(id);
};

const countSubmissions = async (filter = {}) => {
  return LiveCompetitionSubmission.countDocuments(filter);
};

const getSubmissionAggregateStats = async (eventId, round) => {
  const matchFilter = { event: new mongoose.Types.ObjectId(eventId) };
  if (round) matchFilter.round = round;

  const result = await LiveCompetitionSubmission.aggregate([
    { $match: matchFilter },
    {
      $group: {
        _id:      null,
        total:    { $sum: 1 },
        avgScore: { $avg: "$score" },
        maxScore: { $max: "$score" },
        minScore: { $min: "$score" },
      },
    },
  ]);
  return result[0] || { total: 0, avgScore: 0, maxScore: 0, minScore: 0 };
};

/**
 * Bulk-qualify a set of submissions for the Grand Finale.
 */
const qualifySubmissions = async (submissionIds, adminId) => {
  return LiveCompetitionSubmission.updateMany(
    { _id: { $in: submissionIds } },
    {
      $set: {
        isQualified: true,
        qualifiedAt: new Date(),
        qualifiedBy: adminId,
      },
    }
  );
};

/**
 * Count how many students are already qualified for the Grand Finale of an event.
 */
const countQualifiedByEvent = async (eventId) => {
  return LiveCompetitionSubmission.countDocuments({
    event:       eventId,
    round:       "MEGA_AUDITION",
    isQualified: true,
  });
};

/**
 * Find all winner submissions for a specific round, sorted by rank.
 */
const findWinnersByEvent = async (eventId, round, populate = []) => {
  let query = LiveCompetitionSubmission.find({
    event:    eventId,
    round,
    isWinner: true,
  }).sort({ rank: 1 });

  populate.forEach((pop) => {
    query = query.populate(pop.populate ? pop : { path: pop.path, select: pop.select });
  });

  return query;
};

export default {
  // Event
  createEvent,
  findEvents,
  findEventById,
  updateEventById,
  deleteEventById,
  countEvents,
  incrementEventStats,
  // Submission
  createSubmission,
  findSubmissions,
  findSubmissionById,
  findOneSubmission,
  updateSubmissionById,
  deleteSubmissionById,
  countSubmissions,
  getSubmissionAggregateStats,
  // Qualifier & Winner
  qualifySubmissions,
  countQualifiedByEvent,
  findWinnersByEvent,
};
