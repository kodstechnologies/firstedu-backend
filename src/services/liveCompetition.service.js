import mongoose from "mongoose";
import { ApiError } from "../utils/ApiError.js";
import liveCompetitionRepository from "../repository/liveCompetition.repository.js";
import LiveCompetitionCategory from "../models/LiveCompetitionCategory.js";
import {
  uploadImageToCloudinary,
  uploadPDFToCloudinary,
  uploadVideoToCloudinary,
  uploadAudioToCloudinary,
  deleteFileFromCloudinary,
} from "../utils/s3Upload.js";
import walletService from "./wallet.service.js";
import couponService from "./coupon.service.js";
import { getAmountToCharge, getApplicableOfferDetails } from "../utils/offerUtils.js";
import razorpayOrderIntentRepository from "../repository/razorpayOrderIntent.repository.js";
import { createRazorpayOrder, verifyPaymentSignature } from "../utils/razorpayUtils.js";
import { sendNotificationToMultipleStudents } from "./notification.service.js";
import { sendEventResultEmail } from "../utils/sendEmail.js";

/**
 * Generic file upload — routes to the right S3 helper by MIME type.
 */
const uploadSubmissionFile = async (buffer, originalName, mimetype, folder) => {
  if (mimetype === "application/pdf") {
    return uploadPDFToCloudinary(buffer, originalName, folder);
  }
  if (mimetype.startsWith("video/")) {
    return uploadVideoToCloudinary(buffer, originalName, folder);
  }
  if (mimetype.startsWith("audio/")) {
    return uploadAudioToCloudinary(buffer, originalName, folder);
  }
  // Fallback: treat as image
  return uploadImageToCloudinary(buffer, originalName, folder, mimetype);
};

const LIVE_COMP_IMAGE_FOLDER = "live-competitions";
const LIVE_COMP_FILES_FOLDER = "live-competition-submissions";

// ─── Status Auto-Computation ─────────────────────────────

/**
 * Derives the correct status from a round's date windows.
 */
const computeRoundStatus = (round, isPublished) => {
  if (!isPublished) return "DRAFT";
  if (round.status === "LOCKED") return "LOCKED";
  if (round.status === "RESULT_DECLARED") return "RESULT_DECLARED";

  const now = new Date();
  const eventStart = new Date(round.eventWindow.start);
  const eventEnd = new Date(round.eventWindow.end);
  const regStart = round.registration?.start ? new Date(round.registration.start) : null;
  const payStart = round.paymentWindow?.start ? new Date(round.paymentWindow.start) : null;

  if (now >= eventStart && now <= eventEnd) return "LIVE";
  if (now > eventEnd) return "CLOSED";
  
  if (regStart && now >= regStart) return "UPCOMING";
  if (payStart && now >= payStart) return "UPCOMING";
  
  return "UPCOMING"; // Catch-all for published but before start dates
};

const validateEventDates = (megaAudition, grandFinale) => {
  const mRegStart = new Date(megaAudition.registration.start);
  const mRegEnd = new Date(megaAudition.registration.end);
  const mEventStart = new Date(megaAudition.eventWindow.start);
  const mEventEnd = new Date(megaAudition.eventWindow.end);

  if (mRegStart >= mRegEnd) throw new ApiError(400, "Round 1 registration end must be after start");
  if (mEventStart >= mEventEnd) throw new ApiError(400, "Round 1 event window end must be after start");
  if (mRegEnd > mEventStart) throw new ApiError(400, "Round 1 registration must close before event starts");

  if (grandFinale && grandFinale.paymentWindow) {
    if (!megaAudition.resultDeclarationDate) {
      throw new ApiError(400, "Round 1 must have a result declaration date if Grand Finale is configured");
    }
    const mResultDate = new Date(megaAudition.resultDeclarationDate);
    if (mEventEnd > mResultDate) throw new ApiError(400, "Round 1 event window must end before its result declaration date");

    const gPayStart = new Date(grandFinale.paymentWindow.start);
    const gPayEnd = new Date(grandFinale.paymentWindow.end);
    const gEventStart = new Date(grandFinale.eventWindow.start);
    const gEventEnd = new Date(grandFinale.eventWindow.end);

    // THE GOLDEN RULE
    if (gPayStart <= mResultDate) {
      throw new ApiError(400, "Round 2 payment window MUST start after Round 1 result declaration date");
    }
    
    if (gPayStart >= gPayEnd) throw new ApiError(400, "Round 2 payment window end must be after start");
    if (gPayEnd > gEventStart) throw new ApiError(400, "Round 2 payment window must close before event starts");
    if (gEventStart >= gEventEnd) throw new ApiError(400, "Round 2 event window end must be after start");
  }
};

const createdByPopulate = { path: "createdBy", select: "name email" };
const categoryPopulate = { path: "category", select: "name submissionType allowedFileTypes description" };
const participantPopulate = { path: "participant", select: "name email profileImage" };
const eventPopulate = { path: "event", select: "title category megaAudition grandFinale" };

// ==================== ADMIN SERVICES ====================

export const createEvent = async (data, adminId, file) => {
  validateEventDates(data.megaAudition, data.grandFinale);

  const category = await LiveCompetitionCategory.findById(data.category);
  if (!category) throw new ApiError(400, "Category not found");

  let bannerUrl = null;
  if (file) {
    bannerUrl = await uploadImageToCloudinary(
      file.buffer,
      file.originalname,
      LIVE_COMP_IMAGE_FOLDER,
      file.mimetype
    );
  }

  // Override submission configs from category
  const mergeSubmission = (subData) => {
    if (!subData) return undefined;
    return {
      ...subData,
      type: category.submissionType,
      text: category.submissionType === "TEXT"
        ? (subData.text || { limit: 1000, limitType: "WORDS" })
        : undefined,
      file: {
        ...(subData.file || {}),
        allowedTypes: subData.file?.allowedTypes?.length
          ? subData.file.allowedTypes
          : category.allowedFileTypes,
      },
    };
  };

  data.megaAudition.submission = mergeSubmission(data.megaAudition.submission);
  data.megaAudition.status = computeRoundStatus(data.megaAudition, data.isPublished);

  if (data.grandFinale) {
    data.grandFinale.submission = mergeSubmission(data.grandFinale.submission);
    data.grandFinale.status = "LOCKED";
  }

  const created = await liveCompetitionRepository.createEvent({
    ...data,
    bannerUrl,
    createdBy: adminId,
  });

  return created;
};

export const getEvents = async (options = {}) => {
  const { page = 1, limit = 10, search, status, category } = options;

  const query = {};
  if (search) {
    query.$or = [
      { title: { $regex: search, $options: "i" } },
      { description: { $regex: search, $options: "i" } },
    ];
  }
  // status filtering could be complex now with 2 rounds, keeping simple for now
  if (category) query.category = category;

  const pageNum = parseInt(page);
  const limitNum = parseInt(limit);
  const skip = (pageNum - 1) * limitNum;

  const [events, total] = await Promise.all([
    liveCompetitionRepository.findEvents(query, {
      populate: [createdByPopulate, categoryPopulate],
      sort: { createdAt: -1 },
      skip,
      limit: limitNum,
    }),
    liveCompetitionRepository.countEvents(query),
  ]);

  // Lazy status sync
  const syncedEvents = await Promise.all(
    events.map(async (e) => {
      let changed = false;
      const mStatus = computeRoundStatus(e.megaAudition, e.isPublished);
      if (mStatus !== e.megaAudition.status) {
        e.megaAudition.status = mStatus;
        changed = true;
      }
      if (e.grandFinale) {
        const gStatus = computeRoundStatus(e.grandFinale, e.isPublished);
        if (gStatus !== e.grandFinale.status) {
          e.grandFinale.status = gStatus;
          changed = true;
        }
      }
      if (changed) {
        return liveCompetitionRepository.updateEventById(e._id, {
          "megaAudition.status": e.megaAudition.status,
          ...(e.grandFinale ? { "grandFinale.status": e.grandFinale.status } : {})
        });
      }
      return e;
    })
  );

  return {
    events: syncedEvents,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      pages: Math.ceil(total / limitNum) || 1,
    },
  };
};

export const getEventById = async (id) => {
  const event = await liveCompetitionRepository.findEventById(id, [createdByPopulate, categoryPopulate]);
  if (!event) throw new ApiError(404, "Live competition not found");
  return event;
};

export const updateEvent = async (id, updateData, file) => {
  const event = await liveCompetitionRepository.findEventById(id);
  if (!event) throw new ApiError(404, "Live competition not found");

  const mergedMega = { ...event.megaAudition.toObject(), ...(updateData.megaAudition || {}) };
  const mergedGrand = updateData.grandFinale 
    ? { ...(event.grandFinale?.toObject() || {}), ...updateData.grandFinale }
    : event.grandFinale?.toObject();

  validateEventDates(mergedMega, mergedGrand);

  if (file) {
    if (event.bannerUrl) await deleteFileFromCloudinary(event.bannerUrl);
    updateData.bannerUrl = await uploadImageToCloudinary(
      file.buffer,
      file.originalname,
      LIVE_COMP_IMAGE_FOLDER,
      file.mimetype
    );
  }

  // Preserve RESULT_DECLARED statuses unless explicitly changed
  if (updateData.megaAudition?.status && updateData.megaAudition.status !== "RESULT_DECLARED") {
    delete updateData.megaAudition.status;
  }
  if (updateData.grandFinale?.status && updateData.grandFinale.status !== "RESULT_DECLARED") {
    delete updateData.grandFinale.status;
  }

  const updated = await liveCompetitionRepository.updateEventById(id, updateData);

  // Sync statuses
  let changed = false;
  const mStatus = computeRoundStatus(updated.megaAudition, updated.isPublished);
  if (mStatus !== updated.megaAudition.status) {
    updated.megaAudition.status = mStatus;
    changed = true;
  }
  if (updated.grandFinale) {
    const gStatus = computeRoundStatus(updated.grandFinale, updated.isPublished);
    if (gStatus !== updated.grandFinale.status) {
      updated.grandFinale.status = gStatus;
      changed = true;
    }
  }

  if (changed) {
    return await liveCompetitionRepository.updateEventById(id, {
      "megaAudition.status": updated.megaAudition.status,
      ...(updated.grandFinale ? { "grandFinale.status": updated.grandFinale.status } : {})
    });
  }
  return updated;
};

export const deleteEvent = async (id) => {
  const event = await liveCompetitionRepository.findEventById(id);
  if (!event) throw new ApiError(404, "Live competition not found");
  if (event.bannerUrl) await deleteFileFromCloudinary(event.bannerUrl);
  return await liveCompetitionRepository.deleteEventById(id);
};

// ─── Submission Management ───────────────────────────────

export const getSubmissionsByEvent = async (eventId, options = {}) => {
  const event = await liveCompetitionRepository.findEventById(eventId);
  if (!event) throw new ApiError(404, "Live competition not found");

  const { page = 1, limit = 20, round } = options;
  const pageNum = parseInt(page);
  const limitNum = parseInt(limit);
  const skip = (pageNum - 1) * limitNum;

  const filter = { event: eventId };
  if (round) filter.round = round;

  const [submissions, total] = await Promise.all([
    liveCompetitionRepository.findSubmissions(filter, {
      populate: [participantPopulate],
      sort: { createdAt: -1 },
      skip,
      limit: limitNum,
    }),
    liveCompetitionRepository.countSubmissions(filter),
  ]);

  return {
    submissions,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      pages: Math.ceil(total / limitNum) || 1,
    },
  };
};

export const getSubmissionById = async (id) => {
  const submission = await liveCompetitionRepository.findSubmissionById(id, [
    participantPopulate,
    eventPopulate,
  ]);
  if (!submission) throw new ApiError(404, "Submission not found");
  return submission;
};

export const reviewSubmission = async (id, { isChecked }) => {
  const submission = await liveCompetitionRepository.findSubmissionById(id);
  if (!submission) throw new ApiError(404, "Submission not found");

  return await liveCompetitionRepository.updateSubmissionById(id, {
    evaluationStatus: isChecked ? "CHECKED" : "PENDING",
  });
};

export const deleteSubmission = async (id) => {
  const submission = await liveCompetitionRepository.findSubmissionById(id);
  if (!submission) throw new ApiError(404, "Submission not found");
  return await liveCompetitionRepository.deleteSubmissionById(id);
};

// ─── Qualifier & Winner System ──────────────────────────

export const qualifyStudents = async (eventId, adminId, { submissionIds }) => {
  const event = await liveCompetitionRepository.findEventById(eventId);
  if (!event) throw new ApiError(404, "Event not found");

  if (event.megaAudition.status !== "CLOSED" && event.megaAudition.status !== "RESULT_DECLARED") {
    throw new ApiError(400, "Cannot qualify students until Round 1 is CLOSED");
  }

  const maxQualifiers = event.megaAudition.maxQualifiers || 0;
  if (maxQualifiers > 0) {
    const currentlyQualified = await liveCompetitionRepository.countQualifiedByEvent(eventId);
    if (currentlyQualified + submissionIds.length > maxQualifiers) {
      throw new ApiError(400, `Cannot exceed maximum of ${maxQualifiers} qualifiers. Currently qualified: ${currentlyQualified}`);
    }
  }

  // Validate submissions
  const submissions = await liveCompetitionRepository.findSubmissions({ _id: { $in: submissionIds } });
  if (submissions.length !== submissionIds.length) throw new ApiError(400, "Some submissions not found");
  
  for (const sub of submissions) {
    if (sub.event.toString() !== eventId.toString()) throw new ApiError(400, "Submissions must belong to this event");
    if (sub.round !== "MEGA_AUDITION") throw new ApiError(400, "Only MEGA_AUDITION submissions can be qualified");
    if (!sub.submittedAt) throw new ApiError(400, "Cannot qualify students who haven't submitted");
  }

  await liveCompetitionRepository.qualifySubmissions(submissionIds, adminId);

  // Send notifications
  const participantIds = submissions.map(s => s.participant.toString());
  try {
    await sendNotificationToMultipleStudents(
      [...new Set(participantIds)],
      `🏆 You qualified!`,
      `Congratulations! You have qualified for the Grand Finale of ${event.title}!`,
      { type: "live_competition_qualify", eventId: eventId.toString() },
      null
    );
  } catch (err) {
    console.error("Failed to send qualification notifications:", err);
  }

  return { message: `${submissionIds.length} students qualified successfully.` };
};

export const declareResult = async (eventId, { round }) => {
  const event = await liveCompetitionRepository.findEventById(eventId);
  if (!event) throw new ApiError(404, "Event not found");

  const targetRound = round === "GRAND_FINALE" ? event.grandFinale : event.megaAudition;
  if (!targetRound) throw new ApiError(400, "Round configuration not found");

  if (targetRound.status === "RESULT_DECLARED") return event;
  if (targetRound.status !== "CLOSED") {
    throw new ApiError(400, "Round must be CLOSED before declaring results");
  }

  if (targetRound.resultDeclarationDate && new Date() < new Date(targetRound.resultDeclarationDate)) {
    throw new ApiError(400, "Cannot declare results before the scheduled declaration date");
  }

  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    let updatePayload = {};
    if (round === "MEGA_AUDITION") {
      updatePayload["megaAudition.status"] = "RESULT_DECLARED";
      if (event.grandFinale && event.grandFinale.paymentWindow) {
        if (new Date() >= new Date(event.grandFinale.paymentWindow.start)) {
          updatePayload["grandFinale.status"] = "UPCOMING";
        }
      }
    } else {
      // Grand finale requires at least rank 1 to be selected
      const winners = await liveCompetitionRepository.findWinnersByEvent(eventId, "GRAND_FINALE");
      if (!winners || winners.length === 0) {
        throw new ApiError(400, "You must select at least Rank 1 winner before declaring Grand Finale results.");
      }
      updatePayload["grandFinale.status"] = "RESULT_DECLARED";
    }

    const updatedEvent = await liveCompetitionRepository.updateEventById(eventId, updatePayload);

    await session.commitTransaction();
    session.endSession();

    // Send notifications
    try {
      const allSubmissions = await liveCompetitionRepository.findSubmissions(
        { event: eventId, round },
        { limit: 10000, populate: [{ path: "participant", select: "name email" }] }
      );
      
      const pIds = [...new Set(allSubmissions.map(s => s.participant._id ? s.participant._id.toString() : s.participant.toString()))];
      
      if (pIds.length > 0) {
        await sendNotificationToMultipleStudents(
          pIds,
          `${round === "MEGA_AUDITION" ? 'Round 1' : 'Final'} Results Declared!`,
          `Results for ${event.title} are now live. Check the app!`,
          { type: "live_competition_result", eventId: eventId.toString() },
          null
        );

        // Send email to all registered participants
        setImmediate(async () => {
          for (const sub of allSubmissions) {
            if (sub.participant && sub.participant.email) {
              try {
                await sendEventResultEmail({
                  email: sub.participant.email,
                  name: sub.participant.name,
                  eventName: event.title,
                  eventType: "live_competition",
                });
              } catch (emailErr) {
                console.error("Failed to send live comp result email:", emailErr);
              }
            }
          }
        });
      }
    } catch (e) {
      console.error(e);
    }

    return updatedEvent;
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    throw error;
  }
};

export const declareWinner = async (eventId, { round, rank1Id, rank2Id, rank3Id }) => {
  const event = await liveCompetitionRepository.findEventById(eventId);
  if (!event) throw new ApiError(404, "Live competition not found");

  const targetRound = round === "GRAND_FINALE" ? event.grandFinale : event.megaAudition;
  if (targetRound.status !== "CLOSED" && targetRound.status !== "RESULT_DECLARED") {
    throw new ApiError(400, "Round must be CLOSED to declare winners");
  }

  if (round === "GRAND_FINALE" && !rank1Id) {
    throw new ApiError(400, "Rank 1 is required for Grand Finale");
  }

  const validateSub = async (id, rank) => {
    if (!id) return null;
    const sub = await liveCompetitionRepository.findSubmissionById(id, [{ path: "participant", select: "name" }]);
    if (!sub) throw new ApiError(404, `Rank ${rank} submission not found`);
    if (sub.event.toString() !== eventId.toString() || sub.round !== round) {
      throw new ApiError(400, `Rank ${rank} submission is invalid for this round`);
    }
    if (!sub.submittedAt) throw new ApiError(400, `Rank ${rank} submission has not submitted work`);
    return sub;
  };

  const [rank1Sub, rank2Sub, rank3Sub] = await Promise.all([
    validateSub(rank1Id, 1),
    validateSub(rank2Id, 2),
    validateSub(rank3Id, 3),
  ]);

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // 1. Reset old winners
    await LiveCompetitionSubmission.updateMany(
      { event: eventId, round, isWinner: true },
      { $set: { isWinner: false, rank: null } },
      { session }
    );

    // 2. Set new winners & credit wallets
    const applyWinner = async (sub, rank) => {
      if (!sub) return;
      await LiveCompetitionSubmission.updateOne(
        { _id: sub._id },
        { $set: { isWinner: true, rank } },
        { session }
      );

      // Only credit prizes for Grand Finale
      if (round === "GRAND_FINALE" && event.grandFinale.prizes) {
        const prizeConfig = event.grandFinale.prizes.find(p => p.rank === rank);
        if (prizeConfig && prizeConfig.walletPoints > 0) {
          // Note: walletService handles its own transaction, which isn't ideal here, 
          // but we will wrap it tightly.
          await walletService.addRewardPoints(
            sub.participant._id,
            prizeConfig.walletPoints,
            "live_competition_win",
            `Rank ${rank} - ${event.title}`,
            eventId,
            "LiveCompetition"
          );
        }
      }
    };

    await applyWinner(rank1Sub, 1);
    await applyWinner(rank2Sub, 2);
    await applyWinner(rank3Sub, 3);

    await session.commitTransaction();
    session.endSession();

    // 3. Send notifications to winners
    const notify = async (sub, rank) => {
      if (!sub) return;
      try {
        await sendNotificationToMultipleStudents(
          [sub.participant._id.toString()],
          `🥇 You Won!`,
          `Congratulations! You achieved Rank ${rank} in ${event.title}!`,
          { type: "live_competition_win", eventId: eventId.toString() },
          null
        );
      } catch (e) { console.error(e); }
    };

    await notify(rank1Sub, 1);
    await notify(rank2Sub, 2);
    await notify(rank3Sub, 3);

    return { message: "Winners successfully updated." };
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    throw error;
  }
};

// ─── Analytics ────────────────────────────────────────────

export const getEventStats = async (eventId, options = {}) => {
  const event = await liveCompetitionRepository.findEventById(eventId);
  if (!event) throw new ApiError(404, "Live competition not found");

  const { round } = options; // Optional filter

  const stats = await liveCompetitionRepository.getSubmissionAggregateStats(eventId, round);

  return {
    eventId,
    title: event.title,
    roundFilter: round || "ALL",
    totalParticipants: round === "GRAND_FINALE" ? event.grandFinale?.totalParticipants : event.megaAudition.totalParticipants,
    totalSubmissions: round === "GRAND_FINALE" ? event.grandFinale?.totalSubmissions : event.megaAudition.totalSubmissions,
    scoreStats: {
      average: stats.avgScore ? Math.round(stats.avgScore * 100) / 100 : 0,
      highest: stats.maxScore || 0,
      lowest: stats.minScore || 0,
    },
  };
};


// ==================== STUDENT SERVICES ====================

const enrichEventForStudent = async (e, studentId, studentWalletBalance) => {
  const now = new Date();
  
  // Enforce submission.type from category (source of truth)
  if (e.category?.submissionType) {
    if (e.megaAudition) {
      e.megaAudition.submission = e.megaAudition.submission || {};
      e.megaAudition.submission.type = e.category.submissionType;
    }
    if (e.grandFinale) {
      e.grandFinale.submission = e.grandFinale.submission || {};
      e.grandFinale.submission.type = e.category.submissionType;
    }
  }

  const obj = e.toObject ? e.toObject() : e;

  // 1. MEGA AUDITION STATUS
  obj.megaAudition.isRegistrationOpen =
    now >= new Date(e.megaAudition.registration.start) && now <= new Date(e.megaAudition.registration.end);
  obj.megaAudition.isEventLive =
    now >= new Date(e.megaAudition.eventWindow.start) && now <= new Date(e.megaAudition.eventWindow.end);

  // Offers
  const applyOffer = async (feeAmount) => {
    if (feeAmount > 0) {
      const offerDetails = await getApplicableOfferDetails("LiveCompetition", feeAmount);
      return { appliedOffer: offerDetails.appliedOffer || null, discountedPrice: offerDetails.discountedPrice };
    }
    return { appliedOffer: null, discountedPrice: 0 };
  };

  const mFee = await applyOffer(Number(obj.megaAudition.fee?.amount) || 0);
  obj.megaAudition.appliedOffer = mFee.appliedOffer;
  obj.megaAudition.discountedPrice = mFee.discountedPrice;

  // 2. GRAND FINALE STATUS
  if (obj.grandFinale) {
    obj.grandFinale.isPaymentOpen =
      now >= new Date(e.grandFinale.paymentWindow.start) && now <= new Date(e.grandFinale.paymentWindow.end);
    obj.grandFinale.isEventLive =
      now >= new Date(e.grandFinale.eventWindow.start) && now <= new Date(e.grandFinale.eventWindow.end);

    const gFee = await applyOffer(Number(obj.grandFinale.fee?.amount) || 0);
    obj.grandFinale.appliedOffer = gFee.appliedOffer;
    obj.grandFinale.discountedPrice = gFee.discountedPrice;
  }

  // 3. STUDENT SPECIFIC DATA (The 3-Tier Visibility Logic)
  obj.studentStatus = {
    walletBalance: studentWalletBalance || 0,
    megaAudition: { hasRegistered: false, hasSubmitted: false, isQualified: false },
    grandFinale: { hasRegistered: false, hasSubmitted: false }
  };

  if (studentId) {
    const submissions = await liveCompetitionRepository.findSubmissions({
      event: e._id,
      participant: studentId,
      paymentStatus: "COMPLETED",
    });

    const mSub = submissions.find(s => s.round === "MEGA_AUDITION");
    if (mSub) {
      obj.studentStatus.megaAudition.hasRegistered = true;
      obj.studentStatus.megaAudition.hasSubmitted = !!mSub.submittedAt;
      obj.studentStatus.megaAudition.isQualified = mSub.isQualified;
    }

    const gSub = submissions.find(s => s.round === "GRAND_FINALE");
    if (gSub) {
      obj.studentStatus.grandFinale.hasRegistered = true;
      obj.studentStatus.grandFinale.hasSubmitted = !!gSub.submittedAt;
    }

    // VISIBILITY GUARD FOR GRAND FINALE
    if (obj.grandFinale) {
      // If they haven't paid/registered for Grand Finale, hide sensitive topics/rules
      if (!gSub) {
        if (obj.grandFinale.submission?.text) {
          delete obj.grandFinale.submission.text.topic;
          delete obj.grandFinale.submission.text.rules;
        }
        if (obj.grandFinale.submission?.file) {
          delete obj.grandFinale.submission.file.instructions;
        }
      }
    }
  } else {
    // If no student logged in, show skeleton Grand Finale (for marketing)
    if (obj.grandFinale) {
      if (obj.grandFinale.submission?.text) {
        delete obj.grandFinale.submission.text.topic;
        delete obj.grandFinale.submission.text.rules;
      }
      if (obj.grandFinale.submission?.file) {
        delete obj.grandFinale.submission.file.instructions;
      }
    }
  }

  // Inject Winners
  const attachWinner = async (roundName) => {
    const winnerSub = await liveCompetitionRepository.findOneSubmission(
      { event: e._id, round: roundName, isWinner: true },
      [{ path: "participant", select: "name profilePic email" }]
    );
    if (winnerSub?.participant) {
      return {
        submissionId: winnerSub._id,
        name: winnerSub.participant.name || "Winner",
        email: winnerSub.participant.email || "",
        profilePic: winnerSub.participant.profilePic || null,
      };
    }
    return null;
  };

  if (obj.megaAudition.status === "RESULT_DECLARED") {
    obj.megaAudition.winner = await attachWinner("MEGA_AUDITION");
  }
  if (obj.grandFinale && obj.grandFinale.status === "RESULT_DECLARED") {
    obj.grandFinale.winner = await attachWinner("GRAND_FINALE");
  }

  return obj;
};

export const getPublishedEvents = async (options = {}) => {
  const { page = 1, limit = 10, search, category, studentId } = options;

  const query = { isPublished: true };

  if (search) {
    query.$or = [
      { title: { $regex: search, $options: "i" } },
      { description: { $regex: search, $options: "i" } },
    ];
  }
  if (category) query.category = category;

  const pageNum = parseInt(page);
  const limitNum = parseInt(limit);
  const skip = (pageNum - 1) * limitNum;

  const [events, total] = await Promise.all([
    liveCompetitionRepository.findEvents(query, {
      populate: [categoryPopulate],
      sort: { "megaAudition.eventWindow.start": 1 },
      skip,
      limit: limitNum,
    }),
    liveCompetitionRepository.countEvents(query),
  ]);

  let studentWalletBalance = 0;
  if (studentId) {
    const walletBalanceObj = await walletService.getWalletBalance(studentId, "User").catch(() => null);
    if (walletBalanceObj) {
      studentWalletBalance = walletBalanceObj.monetaryBalance || 0;
    }
  }

  const enriched = await Promise.all(
    events.map(async (e) => {
      let eventObj = e;
      let changed = false;
      const mStatus = computeRoundStatus(e.megaAudition, true);
      if (mStatus !== e.megaAudition.status) {
        e.megaAudition.status = mStatus;
        changed = true;
      }
      if (e.grandFinale) {
        const gStatus = computeRoundStatus(e.grandFinale, true);
        if (gStatus !== e.grandFinale.status) {
          e.grandFinale.status = gStatus;
          changed = true;
        }
      }
      if (changed) {
        eventObj = await liveCompetitionRepository.updateEventById(e._id, {
          "megaAudition.status": e.megaAudition.status,
          ...(e.grandFinale ? { "grandFinale.status": e.grandFinale.status } : {})
        });
        eventObj = await liveCompetitionRepository.findEventById(eventObj._id, [categoryPopulate]);
      }
      
      return await enrichEventForStudent(eventObj, studentId, studentWalletBalance);
    })
  );

  return {
    events: enriched,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      pages: Math.ceil(total / limitNum) || 1,
    },
  };
};

export const getPublishedEventById = async (id, studentId = null) => {
  const event = await liveCompetitionRepository.findEventById(id, [categoryPopulate]);
  if (!event || !event.isPublished) throw new ApiError(404, "Live competition not found");

  let studentWalletBalance = 0;
  if (studentId) {
    const walletBalanceObj = await walletService.getWalletBalance(studentId, "User").catch(() => null);
    if (walletBalanceObj) studentWalletBalance = walletBalanceObj.monetaryBalance || 0;
  }

  return await enrichEventForStudent(event, studentId, studentWalletBalance);
};

export const registerForEvent = async (eventId, studentId, options = {}) => {
  const { round = "MEGA_AUDITION" } = options;
  const event = await liveCompetitionRepository.findEventById(eventId);
  if (!event || !event.isPublished) throw new ApiError(404, "Live competition not found");

  const targetRound = round === "GRAND_FINALE" ? event.grandFinale : event.megaAudition;
  const now = new Date();
  
  if (round === "MEGA_AUDITION") {
    if (now < new Date(targetRound.registration.start)) throw new ApiError(400, "Registration not open");
    if (now > new Date(targetRound.registration.end)) throw new ApiError(400, "Registration closed");
  } else {
    if (now < new Date(targetRound.paymentWindow.start)) throw new ApiError(400, "Payment not open");
    if (now > new Date(targetRound.paymentWindow.end)) throw new ApiError(400, "Payment closed");
    const mSub = await liveCompetitionRepository.findOneSubmission({ event: eventId, participant: studentId, round: "MEGA_AUDITION" });
    if (!mSub || !mSub.isQualified) throw new ApiError(403, "Not qualified");
  }

  const existing = await liveCompetitionRepository.findOneSubmission({ event: eventId, participant: studentId, round });
  if (existing) throw new ApiError(409, "Already registered");

  const paymentStatus = targetRound.fee?.isPaid ? "PENDING" : "COMPLETED";
  const submission = await liveCompetitionRepository.createSubmission({
    event: eventId, participant: studentId, paymentStatus, round
  });

  await liveCompetitionRepository.incrementEventStats(eventId, { round, participants: 1 });
  return submission;
};

export const initiateLiveCompPayment = async (eventId, studentId, paymentMethod, options = {}) => {
  const event = await liveCompetitionRepository.findEventById(eventId);
  if (!event || !event.isPublished) throw new ApiError(404, "Live competition not found");

  const { round = "MEGA_AUDITION", couponCode } = options;
  const targetRound = round === "GRAND_FINALE" ? event.grandFinale : event.megaAudition;

  if (!targetRound) throw new ApiError(400, "Round configuration not found");

  const now = new Date();
  
  if (round === "MEGA_AUDITION") {
    if (now < new Date(targetRound.registration.start)) throw new ApiError(400, "Registration has not opened yet");
    if (now > new Date(targetRound.registration.end)) throw new ApiError(400, "Registration window has closed");
  } else {
    // Grand Finale Payment validations
    if (now < new Date(targetRound.paymentWindow.start)) throw new ApiError(400, "Payment window has not opened yet");
    if (now > new Date(targetRound.paymentWindow.end)) throw new ApiError(400, "Payment window has closed");

    // Verify qualification
    const mSub = await liveCompetitionRepository.findOneSubmission({ event: eventId, participant: studentId, round: "MEGA_AUDITION" });
    if (!mSub || !mSub.isQualified) {
      throw new ApiError(403, "You are not qualified for the Grand Finale");
    }
  }

  const existing = await liveCompetitionRepository.findOneSubmission({ event: eventId, participant: studentId, round });
  if (existing && existing.paymentStatus === "COMPLETED") {
    throw new ApiError(409, "You are already registered for this round");
  }

  const basePrice = Number(targetRound.fee?.amount) || 0;
  const { amountToCharge, couponId, appliedOffer, appliedCoupon } = await getAmountToCharge("LiveCompetition", basePrice, couponCode);

  if (paymentMethod === "free") {
    if (amountToCharge > 0) throw new ApiError(400, "This event is paid. Use paymentMethod: wallet or razorpay.");
    if (existing) {
      const updated = await liveCompetitionRepository.updateSubmissionById(existing._id, { paymentStatus: "COMPLETED" });
      return { completed: true, registration: updated };
    }
    const submission = await liveCompetitionRepository.createSubmission({
      event: eventId, participant: studentId, paymentStatus: "COMPLETED", round
    });
    await liveCompetitionRepository.incrementEventStats(eventId, { round, participants: 1 });
    return { completed: true, registration: submission };
  }

  if (paymentMethod === "wallet") {
    if (amountToCharge <= 0) throw new ApiError(400, "This event is free. Use paymentMethod: free.");
    await walletService.deductMonetaryBalance(studentId, amountToCharge, "User");
    if (existing) {
      const updated = await liveCompetitionRepository.updateSubmissionById(existing._id, { paymentStatus: "COMPLETED" });
      return { completed: true, registration: updated };
    }
    const submission = await liveCompetitionRepository.createSubmission({
      event: eventId, participant: studentId, paymentStatus: "COMPLETED", round
    });
    await liveCompetitionRepository.incrementEventStats(eventId, { round, participants: 1 });
    return { completed: true, registration: submission };
  }

  if (paymentMethod === "razorpay") {
    if (amountToCharge < 1) throw new ApiError(400, "This event is free. Use paymentMethod: free.");
    
    let submission = existing;
    if (!submission) {
      submission = await liveCompetitionRepository.createSubmission({
        event: eventId, participant: studentId, paymentStatus: "PENDING", round
      });
      await liveCompetitionRepository.incrementEventStats(eventId, { round, participants: 1 });
    } else if (submission.paymentStatus !== "PENDING") {
      submission = await liveCompetitionRepository.updateSubmissionById(existing._id, { paymentStatus: "PENDING" });
    }

    const receipt = `LC_${eventId}_${studentId}_${Date.now()}`.substring(0, 40);
    const { orderId, amount: amountPaise } = await createRazorpayOrder(amountToCharge, receipt);

    await razorpayOrderIntentRepository.create({
      orderId, studentId, type: "live_competition", entityId: eventId, entityModel: "LiveCompetition",
      amountPaise, currency: "INR", receipt, couponId: couponId || undefined,
      appliedOffer: appliedOffer || undefined, appliedCoupon: appliedCoupon || undefined,
      metadata: { round }
    });

    const razorpayKeyId = process.env.RAZORPAY_KEY_ID;
    if (!razorpayKeyId) throw new ApiError(500, "Payment gateway not configured");

    return {
      completed: false, orderId, amount: amountPaise, currency: "INR",
      key: razorpayKeyId, eventTitle: event.title,
    };
  }

  throw new ApiError(400, "Invalid paymentMethod.");
};

export const completeLiveCompPayment = async (eventId, studentId, data) => {
  const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = data;

  const isValid = verifyPaymentSignature(razorpayOrderId, razorpayPaymentId, razorpaySignature);
  if (!isValid) throw new ApiError(400, "Invalid payment signature");

  const intent = await razorpayOrderIntentRepository.findByOrderIdAny(razorpayOrderId);
  if (!intent || intent.type !== "live_competition" || intent.entityId.toString() !== eventId.toString() || intent.studentId.toString() !== studentId.toString()) {
    throw new ApiError(400, "Invalid payment intent details");
  }

  const round = intent.metadata?.round || "MEGA_AUDITION";

  const existing = await liveCompetitionRepository.findOneSubmission({ event: eventId, participant: studentId, round });
  if (!existing) throw new ApiError(404, "Submission record not found");

  if (!intent.reconciled) {
    if (intent.couponId) await couponService.incrementCouponUsedCount(intent.couponId);
    await liveCompetitionRepository.updateSubmissionById(existing._id, { paymentStatus: "COMPLETED" });
    await razorpayOrderIntentRepository.markReconciled(razorpayOrderId, razorpayPaymentId);
    existing.paymentStatus = "COMPLETED";
  }

  return existing;
};

export const startEssaySession = async (eventId, studentId, options = {}) => {
  const { round = "MEGA_AUDITION" } = options;
  const event = await liveCompetitionRepository.findEventById(eventId, [{ path: "category" }]);
  if (!event || !event.isPublished) throw new ApiError(404, "Live competition not found");

  const targetRound = round === "GRAND_FINALE" ? event.grandFinale : event.megaAudition;
  const submissionType = event.category?.submissionType || targetRound.submission?.type;
  
  if (submissionType !== "TEXT") throw new ApiError(400, "This event does not support live essay sessions");

  const now = new Date();
  if (now < new Date(targetRound.eventWindow.start)) throw new ApiError(400, "Event has not started yet");
  if (now > new Date(targetRound.eventWindow.end)) throw new ApiError(400, "Event window has closed");

  const submission = await liveCompetitionRepository.findOneSubmission({ event: eventId, participant: studentId, round });
  if (!submission) throw new ApiError(403, "You are not registered for this round");
  if (submission.paymentStatus !== "COMPLETED") throw new ApiError(403, "Payment is required before starting");

  if (submission.attemptLocked) return submission;

  return await liveCompetitionRepository.updateSubmissionById(submission._id, {
    startedAt: now, attemptLocked: true,
  });
};

export const saveDraft = async (eventId, studentId, { text, round = "MEGA_AUDITION" }) => {
  const submission = await liveCompetitionRepository.findOneSubmission({ event: eventId, participant: studentId, round });
  if (!submission) throw new ApiError(403, "You are not registered for this event");

  return await liveCompetitionRepository.updateSubmissionById(submission._id, {
    "content.text": text || "",
  });
};

export const submitWork = async (eventId, studentId, { text, round = "MEGA_AUDITION" }, files = []) => {
  const event = await liveCompetitionRepository.findEventById(eventId, [{ path: "category" }]);
  if (!event || !event.isPublished) throw new ApiError(404, "Live competition not found");

  const targetRound = round === "GRAND_FINALE" ? event.grandFinale : event.megaAudition;
  if (!targetRound) throw new ApiError(400, "Round configuration not found");

  const now = new Date();
  if (now < new Date(targetRound.eventWindow.start)) throw new ApiError(400, "Event has not started yet");

  const gracePeriodEnd = new Date(targetRound.eventWindow.end.getTime() + 2 * 60000);
  if (now > gracePeriodEnd) throw new ApiError(400, "Submission deadline has passed");

  const submission = await liveCompetitionRepository.findOneSubmission({ event: eventId, participant: studentId, round });
  if (!submission) throw new ApiError(403, "You are not registered for this round");
  if (submission.submittedAt) throw new ApiError(409, "You have already submitted your work");
  if (targetRound.fee?.isPaid && submission.paymentStatus !== "COMPLETED") throw new ApiError(403, "Payment is required");

  const submissionType = event.category?.submissionType || targetRound.submission?.type;

  if (submissionType === "TEXT") {
    const essayText = text || submission.content?.text || "";
    if (!essayText.trim()) throw new ApiError(400, "Essay content is required");
    const limit = targetRound.submission.text?.limit;
    if (limit) {
      const limitType = targetRound.submission.text?.limitType || "WORDS";
      if (limitType === "WORDS" && essayText.trim().split(/\s+/).filter(Boolean).length > limit) {
        throw new ApiError(400, `Exceeds the limit of ${limit} words.`);
      } else if (limitType === "CHARACTERS" && essayText.length > limit) {
        throw new ApiError(400, `Exceeds the limit of ${limit} characters.`);
      }
    }
  }

  if (submissionType === "FILE") {
    if (!files || files.length === 0) throw new ApiError(400, "At least one file is required");
    const maxFiles = targetRound.submission.file?.maxFiles || 5;
    if (files.length > maxFiles) throw new ApiError(400, `Maximum ${maxFiles} file(s) allowed`);
    
    for (const file of files) {
      const ext = file.originalname.split(".").pop().toLowerCase();
      const allowedTypes = targetRound.submission.file?.allowedTypes || [];
      if (allowedTypes.length > 0 && !allowedTypes.includes(ext)) {
        throw new ApiError(400, `File type '.${ext}' not allowed.`);
      }
      const maxSize = targetRound.submission.file?.maxSize;
      if (maxSize && file.size > maxSize * 1024 * 1024) {
        throw new ApiError(400, `File exceeds the ${maxSize} MB size limit`);
      }
    }
  }

  let uploadedFiles = [];
  if (submissionType === "FILE" && files.length > 0) {
    for (const file of files) {
      const url = await uploadSubmissionFile(file.buffer, file.originalname, file.mimetype, LIVE_COMP_FILES_FOLDER);
      uploadedFiles.push({ url, fileType: file.originalname.split(".").pop().toLowerCase(), fileName: file.originalname, fileSize: file.size });
    }
  }

  const updateData = { submittedAt: now, isLate: false };
  if (submissionType === "TEXT") updateData["content.text"] = text || submission.content?.text || "";
  if (uploadedFiles.length > 0) updateData["content.files"] = uploadedFiles;

  const updated = await liveCompetitionRepository.updateSubmissionById(submission._id, updateData);
  await liveCompetitionRepository.incrementEventStats(eventId, { round, submissions: 1 });

  return updated;
};

// getMySubmissions
export const getMySubmissions = async (studentId, options = {}) => {
  const { page = 1, limit = 10 } = options;
  const pageNum = parseInt(page);
  const limitNum = parseInt(limit);
  const skip = (pageNum - 1) * limitNum;

  const filter = { participant: studentId };
  const [submissions, total] = await Promise.all([
    liveCompetitionRepository.findSubmissions(filter, {
      populate: [eventPopulate],
      sort: { createdAt: -1 },
      skip,
      limit: limitNum,
    }),
    liveCompetitionRepository.countSubmissions(filter),
  ]);

  return {
    submissions,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      pages: Math.ceil(total / limitNum) || 1,
    },
  };
};

export default {
  // Admin
  createEvent,
  getEvents,
  getEventById,
  updateEvent,
  deleteEvent,
  getSubmissionsByEvent,
  getSubmissionById,
  reviewSubmission,
  deleteSubmission,
  qualifyStudents,
  declareResult,
  declareWinner,
  getEventStats,
  // Student
  getPublishedEvents,
  getPublishedEventById,
  registerForEvent,
  initiateLiveCompPayment,
  completeLiveCompPayment,
  startEssaySession,
  saveDraft,
  submitWork,
  getMySubmissions,
};
