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
 * Derives the correct status from the event's date windows.
 * RESULT_DECLARED is preserved — it can only be set manually via declareWinners.
 */
const computeStatus = (event) => {
  if (event.status === "RESULT_DECLARED") return "RESULT_DECLARED";
  if (!event.isPublished) return "DRAFT";

  const now = new Date();
  const regStart = new Date(event.registration.start);
  const eventStart = new Date(event.eventWindow.start);
  const eventEnd = new Date(event.eventWindow.end);

  if (now >= eventStart && now <= eventEnd) return "LIVE";
  if (now > eventEnd) return "CLOSED";
  if (now >= regStart) return "UPCOMING"; // registration open or event hasn't started
  return "UPCOMING"; // before registration opens
};

const createdByPopulate = { path: "createdBy", select: "name email" };
const categoryPopulate = { path: "category", select: "name submissionType allowedFileTypes description" };
const participantPopulate = { path: "participant", select: "name email profileImage" };
const eventPopulate = { path: "event", select: "title category status eventWindow submission fee" };

// ==================== ADMIN SERVICES ====================

export const createEvent = async (data, adminId, file) => {
  const { registration, eventWindow } = data;

  // Validate time ranges
  if (new Date(registration.start) >= new Date(registration.end)) {
    throw new ApiError(400, "Registration end must be after registration start");
  }
  if (new Date(eventWindow.start) >= new Date(eventWindow.end)) {
    throw new ApiError(400, "Event window end must be after event window start");
  }
  if (new Date(registration.end) > new Date(eventWindow.start)) {
    throw new ApiError(400, "Registration must close before the event window opens");
  }

  // Resolve category — override submission.type from category.submissionType
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

  // Strip any forced status sent from client
  const { status: _ignored, ...cleanData } = data;

  // Override submission.type from category (source of truth).
  // Only propagate text config for TEXT categories; strip it for FILE categories.
  const submissionOverride = {
    ...(cleanData.submission || {}),
    type: category.submissionType,
    // text.limit only applies to TEXT submission types
    text: category.submissionType === "TEXT"
      ? (cleanData.submission?.text || { limit: 1000, limitType: "WORDS" })
      : undefined,
    file: {
      ...(cleanData.submission?.file || {}),
      allowedTypes:
        cleanData.submission?.file?.allowedTypes?.length
          ? cleanData.submission.file.allowedTypes
          : category.allowedFileTypes,
    },
  };

  const created = await liveCompetitionRepository.createEvent({
    ...cleanData,
    submission: submissionOverride,
    bannerUrl,
    createdBy: adminId,
    status: cleanData.isPublished ? "UPCOMING" : "DRAFT",
  });

  // Compute and persist the real status based on dates
  const computedStatus = computeStatus(created);
  if (computedStatus !== created.status) {
    return await liveCompetitionRepository.updateEventById(created._id, { status: computedStatus });
  }
  return created;
};

export const getEvents = async (options = {}) => {
  const { page = 1, limit = 10, search, status, category } = options;

  const query = {};
  if (search) {
    query.$or = [
      { title: { $regex: search, $options: "i" } },
      { description: { $regex: search, $options: "i" } },
      { category: { $regex: search, $options: "i" } },
    ];
  }
  if (status) query.status = status;
  if (category) query.category = { $regex: category, $options: "i" };

  const pageNum = parseInt(page);
  const limitNum = parseInt(limit);
  const skip = (pageNum - 1) * limitNum;

  const [events, total] = await Promise.all([
    liveCompetitionRepository.findEvents(query, {
      populate: [createdByPopulate],
      sort: { createdAt: -1 },
      skip,
      limit: limitNum,
    }),
    liveCompetitionRepository.countEvents(query),
  ]);

  // Lazy status sync — update any event whose computed status differs from stored
  const syncedEvents = await Promise.all(
    events.map(async (e) => {
      const computed = computeStatus(e);
      if (computed !== e.status) {
        return liveCompetitionRepository.updateEventById(e._id, { status: computed });
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
  const event = await liveCompetitionRepository.findEventById(id, [createdByPopulate]);
  if (!event) throw new ApiError(404, "Live competition not found");
  return event;
};

export const updateEvent = async (id, updateData, file) => {
  const event = await liveCompetitionRepository.findEventById(id);
  if (!event) throw new ApiError(404, "Live competition not found");

  if (file) {
    if (event.bannerUrl) await deleteFileFromCloudinary(event.bannerUrl);
    updateData.bannerUrl = await uploadImageToCloudinary(
      file.buffer,
      file.originalname,
      LIVE_COMP_IMAGE_FOLDER,
      file.mimetype
    );
  }

  // If admin is not explicitly setting RESULT_DECLARED, strip status and auto-compute
  if (updateData.status && updateData.status !== "RESULT_DECLARED") {
    delete updateData.status;
  }

  const updated = await liveCompetitionRepository.updateEventById(id, updateData);

  // Re-compute status after date changes
  const computedStatus = computeStatus(updated);
  if (computedStatus !== updated.status) {
    return await liveCompetitionRepository.updateEventById(id, { status: computedStatus });
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

  const { page = 1, limit = 20 } = options;
  const pageNum = parseInt(page);
  const limitNum = parseInt(limit);
  const skip = (pageNum - 1) * limitNum;

  const filter = { event: eventId };
  const [submissions, total] = await Promise.all([
    liveCompetitionRepository.findSubmissions(filter, {
      populate: [participantPopulate],
      sort: { score: -1, createdAt: -1 },
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

  // Mark as CHECKED or revert to PENDING
  return await liveCompetitionRepository.updateSubmissionById(id, {
    evaluationStatus: isChecked ? "CHECKED" : "PENDING",
  });
};

export const deleteSubmission = async (id) => {
  const submission = await liveCompetitionRepository.findSubmissionById(id);
  if (!submission) throw new ApiError(404, "Submission not found");
  return await liveCompetitionRepository.deleteSubmissionById(id);
};

// ─── Winner System ────────────────────────────────────────

export const declareWinner = async (eventId, { winnerId }) => {
  const event = await liveCompetitionRepository.findEventById(eventId);
  if (!event) throw new ApiError(404, "Live competition not found");

  // If winnerId is passed, validate it
  if (winnerId) {
    const sub = await liveCompetitionRepository.findSubmissionById(winnerId);
    if (!sub) throw new ApiError(404, `Submission ${winnerId} not found`);
    if (sub.event.toString() !== eventId.toString()) {
      throw new ApiError(400, `Submission ${winnerId} does not belong to this event`);
    }
    if (!sub.submittedAt) {
      throw new ApiError(400, `Submission ${winnerId} has not been submitted yet`);
    }
  }

  // Reset any previously-declared winners for this event (prevent multiple winners)
  const prevWinners = await liveCompetitionRepository.findSubmissions({
    event: eventId,
    isWinner: true,
  });
  for (const s of prevWinners) {
    await liveCompetitionRepository.updateSubmissionById(s._id, {
      isWinner: false,
    });
  }

  // If we are clearing the winner, just return the updated event
  if (!winnerId) {
    return await liveCompetitionRepository.updateEventById(eventId, {
      status: "LIVE", // Or keep RESULT_DECLARED? Usually we revert if no winner.
    });
  }

  // Assign new winner
  await liveCompetitionRepository.updateSubmissionById(winnerId, { isWinner: true });

  // Mark event as RESULT_DECLARED
  const updatedEvent = await liveCompetitionRepository.updateEventById(eventId, {
    status: "RESULT_DECLARED",
  });

  return updatedEvent;
};

// ─── Analytics ────────────────────────────────────────────

export const getEventStats = async (eventId) => {
  const event = await liveCompetitionRepository.findEventById(eventId);
  if (!event) throw new ApiError(404, "Live competition not found");

  const stats = await liveCompetitionRepository.getSubmissionAggregateStats(
    new mongoose.Types.ObjectId(eventId)
  );

  return {
    eventId,
    title: event.title,
    status: event.status,
    totalParticipants: event.totalParticipants,
    totalSubmissions: event.totalSubmissions,
    scoreStats: {
      average: stats.avgScore ? Math.round(stats.avgScore * 100) / 100 : 0,
      highest: stats.maxScore || 0,
      lowest: stats.minScore || 0,
    },
  };
};

// ==================== STUDENT SERVICES ====================

export const getPublishedEvents = async (options = {}) => {
  const { page = 1, limit = 10, search, status, category, studentId } = options;

  const now = new Date();
  const query = { isPublished: true };

  if (search) {
    query.$or = [
      { title: { $regex: search, $options: "i" } },
      { description: { $regex: search, $options: "i" } },
      { category: { $regex: search, $options: "i" } },
    ];
  }
  if (status) query.status = status;
  if (category) query.category = category;

  const pageNum = parseInt(page);
  const limitNum = parseInt(limit);
  const skip = (pageNum - 1) * limitNum;

  const [events, total] = await Promise.all([
    liveCompetitionRepository.findEvents(query, {
      populate: [categoryPopulate],
      sort: { "eventWindow.start": 1 },
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

  // Lazy status sync + enrich with computed flags
  const enriched = await Promise.all(
    events.map(async (e) => {
      const computed = computeStatus(e);
      let eventObj = e;
      if (computed !== e.status) {
        eventObj = await liveCompetitionRepository.updateEventById(e._id, { status: computed });
        // Re-attach the populated category after update (updateEventById returns lean doc without populate)
        eventObj = await liveCompetitionRepository.findEventById(eventObj._id, [categoryPopulate]);
      }
      const obj = eventObj.toObject ? eventObj.toObject() : eventObj;
      obj.isRegistrationOpen =
        now >= new Date(e.registration.start) && now <= new Date(e.registration.end);
      obj.isEventLive =
        now >= new Date(e.eventWindow.start) && now <= new Date(e.eventWindow.end);

      // Enforce submission.type from category (source of truth)
      if (obj.category?.submissionType) {
        obj.submission = obj.submission || {};
        obj.submission.type = obj.category.submissionType;
      }

      // Inject per-student registration status if caller provides studentId
      if (studentId) {
        const existing = await liveCompetitionRepository.findOneSubmission({
          event: e._id,
          participant: studentId,
          paymentStatus: "COMPLETED",
        });
        obj.hasRegistered = !!existing;
        obj.hasSubmitted = !!(existing && existing.submittedAt);
        obj.walletBalance = studentWalletBalance;
      }

      // Inject active offer details
      const feeAmount = Number(obj.fee?.amount) || 0;
      if (feeAmount > 0) {
        const offerDetails = await getApplicableOfferDetails("LiveCompetition", feeAmount);
        obj.appliedOffer = offerDetails.appliedOffer || null;
        obj.discountedPrice = offerDetails.discountedPrice;
      } else {
        obj.appliedOffer = null;
        obj.discountedPrice = 0;
      }

      // Inject winner details for RESULT_DECLARED events
      if (obj.status === "RESULT_DECLARED") {
        const winnerSub = await liveCompetitionRepository.findOneSubmission(
          { event: e._id, isWinner: true },
          [{ path: "participant", select: "name profilePic email" }]
        );
        if (winnerSub && winnerSub.participant) {
          obj.winner = {
            submissionId: winnerSub._id,
            name: winnerSub.participant.name || "Winner",
            email: winnerSub.participant.email || "",
            profilePic: winnerSub.participant.profilePic || null,
          };
        } else {
          obj.winner = null;
        }
      } else {
        obj.winner = null;
      }

      return obj;
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
  // Populate category so submission.type is always authoritative from the category
  const event = await liveCompetitionRepository.findEventById(id, [categoryPopulate]);
  if (!event) throw new ApiError(404, "Live competition not found");
  if (!event.isPublished) throw new ApiError(404, "Live competition not found");

  const now = new Date();
  const obj = event.toObject ? event.toObject() : event;
  obj.isRegistrationOpen =
    now >= new Date(event.registration.start) && now <= new Date(event.registration.end);
  obj.isEventLive =
    now >= new Date(event.eventWindow.start) && now <= new Date(event.eventWindow.end);

  // Enforce submission.type from category (source of truth — overrides any stale DB value)
  if (obj.category?.submissionType) {
    obj.submission = obj.submission || {};
    obj.submission.type = obj.category.submissionType;
  }

  if (studentId) {
    const [existing, walletBalanceObj] = await Promise.all([
      liveCompetitionRepository.findOneSubmission({
        event: id,
        participant: studentId,
        paymentStatus: "COMPLETED",
      }),
      walletService.getWalletBalance(studentId, "User").catch(() => null)
    ]);
    obj.hasRegistered = !!existing;
    obj.hasSubmitted = !!(existing && existing.submittedAt);
    if (walletBalanceObj) {
      obj.walletBalance = walletBalanceObj.monetaryBalance || 0;
    }
  }

  // Inject active offer details
  const feeAmount = Number(obj.fee?.amount) || 0;
  if (feeAmount > 0) {
    const offerDetails = await getApplicableOfferDetails("LiveCompetition", feeAmount);
    obj.appliedOffer = offerDetails.appliedOffer || null;
    obj.discountedPrice = offerDetails.discountedPrice;
  } else {
    obj.appliedOffer = null;
    obj.discountedPrice = 0;
  }

  // Inject winner details for RESULT_DECLARED events
  if (obj.status === "RESULT_DECLARED") {
    const winnerSub = await liveCompetitionRepository.findOneSubmission(
      { event: id, isWinner: true },
      [{ path: "participant", select: "name profilePic email" }]
    );
    if (winnerSub && winnerSub.participant) {
      obj.winner = {
        submissionId: winnerSub._id,
        name: winnerSub.participant.name || "Winner",
        email: winnerSub.participant.email || "",
        profilePic: winnerSub.participant.profilePic || null,
      };
    } else {
      obj.winner = null;
    }
  } else {
    obj.winner = null;
  }

  return obj;
};

export const registerForEvent = async (eventId, studentId) => {
  const event = await liveCompetitionRepository.findEventById(eventId);
  if (!event) throw new ApiError(404, "Live competition not found");
  if (!event.isPublished) throw new ApiError(404, "Live competition not found");

  const now = new Date();
  if (now < new Date(event.registration.start)) {
    throw new ApiError(400, "Registration has not opened yet");
  }
  if (now > new Date(event.registration.end)) {
    throw new ApiError(400, "Registration window has closed");
  }

  // Check duplicate
  const existing = await liveCompetitionRepository.findOneSubmission({
    event: eventId,
    participant: studentId,
  });
  if (existing) throw new ApiError(409, "You are already registered for this event");

  // For free events, create a placeholder submission record (registration)
  const paymentStatus = event.fee.isPaid ? "PENDING" : "COMPLETED";
  const submission = await liveCompetitionRepository.createSubmission({
    event: eventId,
    participant: studentId,
    paymentStatus,
  });

  // Increment participant count
  await liveCompetitionRepository.incrementEventStats(eventId, { participants: 1 });

  return submission;
};

export const initiateLiveCompPayment = async (eventId, studentId, paymentMethod, options = {}) => {
  const event = await liveCompetitionRepository.findEventById(eventId);
  if (!event) throw new ApiError(404, "Live competition not found");
  if (!event.isPublished) throw new ApiError(404, "Live competition not found");

  const now = new Date();
  if (now < new Date(event.registration.start)) {
    throw new ApiError(400, "Registration has not opened yet");
  }
  if (now > new Date(event.registration.end)) {
    throw new ApiError(400, "Registration window has closed");
  }

  // Check duplicate
  const existing = await liveCompetitionRepository.findOneSubmission({
    event: eventId,
    participant: studentId,
  });
  if (existing && existing.paymentStatus === "COMPLETED") {
    throw new ApiError(409, "You are already registered for this event");
  }

  const basePrice = Number(event.fee?.amount) || 0;
  const { couponCode } = options;

  const { amountToCharge, couponId, appliedOffer, appliedCoupon } = await getAmountToCharge("LiveCompetition", basePrice, couponCode);

  if (paymentMethod === "free") {
    if (amountToCharge > 0) {
      throw new ApiError(400, "This event is paid. Use paymentMethod: wallet or razorpay.");
    }
    if (existing) {
      const updated = await liveCompetitionRepository.updateSubmissionById(existing._id, { paymentStatus: "COMPLETED" });
      return { completed: true, registration: updated };
    }
    const submission = await liveCompetitionRepository.createSubmission({
      event: eventId,
      participant: studentId,
      paymentStatus: "COMPLETED",
    });
    await liveCompetitionRepository.incrementEventStats(eventId, { participants: 1 });
    return { completed: true, registration: submission };
  }

  if (paymentMethod === "wallet") {
    if (amountToCharge <= 0) {
      throw new ApiError(400, "This event is free. Use paymentMethod: free.");
    }
    await walletService.deductMonetaryBalance(studentId, amountToCharge, "User");
    if (existing) {
      const updated = await liveCompetitionRepository.updateSubmissionById(existing._id, { paymentStatus: "COMPLETED" });
      return { completed: true, registration: updated };
    }
    const submission = await liveCompetitionRepository.createSubmission({
      event: eventId,
      participant: studentId,
      paymentStatus: "COMPLETED",
    });
    await liveCompetitionRepository.incrementEventStats(eventId, { participants: 1 });
    return { completed: true, registration: submission };
  }

  if (paymentMethod === "razorpay") {
    if (amountToCharge < 1) {
      throw new ApiError(400, "This event is free. Use paymentMethod: free.");
    }
    let submission = existing;
    if (!submission) {
      submission = await liveCompetitionRepository.createSubmission({
        event: eventId,
        participant: studentId,
        paymentStatus: "PENDING",
      });
      await liveCompetitionRepository.incrementEventStats(eventId, { participants: 1 });
    } else if (submission.paymentStatus !== "PENDING") {
      submission = await liveCompetitionRepository.updateSubmissionById(existing._id, { paymentStatus: "PENDING" });
    }

    const receipt = `LC_${eventId}_${studentId}_${Date.now()}`.substring(0, 40);
    const { orderId, amount: amountPaise } = await createRazorpayOrder(amountToCharge, receipt);

    await razorpayOrderIntentRepository.create({
      orderId,
      studentId,
      type: "live_competition",
      entityId: eventId,
      entityModel: "LiveCompetition",
      amountPaise,
      currency: "INR",
      receipt,
      couponId: couponId || undefined,
      appliedOffer: appliedOffer || undefined,
      appliedCoupon: appliedCoupon || undefined,
    });

    const razorpayKeyId = process.env.RAZORPAY_KEY_ID;
    if (!razorpayKeyId) throw new ApiError(500, "Payment gateway not configured");

    return {
      completed: false,
      orderId,
      amount: amountPaise,
      currency: "INR",
      key: razorpayKeyId,
      eventTitle: event.title,
    };
  }

  throw new ApiError(400, "Invalid paymentMethod. Use: free, wallet, or razorpay.");
};

export const completeLiveCompPayment = async (eventId, studentId, data) => {
  const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = data;

  const isValid = verifyPaymentSignature(razorpayOrderId, razorpayPaymentId, razorpaySignature);
  if (!isValid) throw new ApiError(400, "Invalid payment signature");

  const intent = await razorpayOrderIntentRepository.findByOrderIdAny(razorpayOrderId);
  if (!intent || intent.type !== "live_competition" || intent.entityId.toString() !== eventId.toString() || intent.studentId.toString() !== studentId.toString()) {
    throw new ApiError(400, "Invalid payment intent details");
  }

  const existing = await liveCompetitionRepository.findOneSubmission({
    event: eventId,
    participant: studentId,
  });
  if (!existing) {
    throw new ApiError(404, "Submission record not found");
  }

  let submissionToReturn = existing;

  if (!intent.reconciled) {
    if (intent.couponId) {
      await couponService.incrementCouponUsedCount(intent.couponId);
    }
    submissionToReturn = await liveCompetitionRepository.updateSubmissionById(existing._id, { paymentStatus: "COMPLETED" });
    await razorpayOrderIntentRepository.markReconciled(razorpayOrderId, razorpayPaymentId);
  }

  return submissionToReturn;
};

export const startEssaySession = async (eventId, studentId) => {
  const event = await liveCompetitionRepository.findEventById(eventId, [{ path: "category" }]);
  if (!event || !event.isPublished) throw new ApiError(404, "Live competition not found");

  const submissionType = event.category?.submissionType || event.submission?.type;
  if (submissionType !== "TEXT") {
    throw new ApiError(400, "This event does not support live essay sessions");
  }

  const now = new Date();
  if (now < new Date(event.eventWindow.start)) {
    throw new ApiError(400, "Event has not started yet");
  }
  if (now > new Date(event.eventWindow.end)) {
    throw new ApiError(400, "Event window has closed");
  }

  const submission = await liveCompetitionRepository.findOneSubmission({
    event: eventId,
    participant: studentId,
  });
  if (!submission) {
    throw new ApiError(403, "You are not registered for this event");
  }
  if (submission.paymentStatus !== "COMPLETED") {
    throw new ApiError(403, "Payment is required before starting");
  }

  // Prevent starting a second session (attempt lock)
  if (submission.attemptLocked) {
    return submission; // already started — return existing session
  }

  // Lock the attempt and record start time
  return await liveCompetitionRepository.updateSubmissionById(submission._id, {
    startedAt: now,
    attemptLocked: true,
  });
};

export const saveDraft = async (eventId, studentId, { text }) => {
  const submission = await liveCompetitionRepository.findOneSubmission({
    event: eventId,
    participant: studentId,
  });
  if (!submission) throw new ApiError(403, "You are not registered for this event");

  return await liveCompetitionRepository.updateSubmissionById(submission._id, {
    "content.text": text || "",
  });
};

export const submitWork = async (eventId, studentId, { text }, files = []) => {
  const event = await liveCompetitionRepository.findEventById(eventId, [{ path: "category" }]);
  if (!event || !event.isPublished) throw new ApiError(404, "Live competition not found");

  const now = new Date();
  if (now < new Date(event.eventWindow.start)) {
    throw new ApiError(400, "Event has not started yet");
  }

  // Block submission after event window closes
  const isLate = now > new Date(event.eventWindow.end);
  if (isLate) {
    throw new ApiError(400, "Submission deadline has passed — the event window is closed");
  }

  const submission = await liveCompetitionRepository.findOneSubmission({
    event: eventId,
    participant: studentId,
  });
  if (!submission) throw new ApiError(403, "You are not registered for this event");

  // Block if already submitted
  if (submission.submittedAt) {
    throw new ApiError(409, "You have already submitted your work for this event.");
  }

  // Block if paid event and payment not completed
  if (event.fee?.isPaid && submission.paymentStatus !== "COMPLETED") {
    throw new ApiError(403, "Payment is required before submitting");
  }

  const submissionType = event.category?.submissionType || event.submission?.type; // "TEXT" or "FILE"

  // ── Type-specific content validation ─────────────────────────────────────
  if (submissionType === "TEXT") {
    const essayText = text || submission.content?.text || "";
    if (!essayText.trim()) {
      throw new ApiError(400, "Essay content is required for TEXT submissions");
    }

    // Enforce limits
    const limit = event.submission.text?.limit;
    if (limit) {
      const limitType = event.submission.text?.limitType || "WORDS";
      if (limitType === "WORDS") {
        const words = essayText.trim().split(/\s+/).filter(Boolean).length;
        if (words > limit) {
          throw new ApiError(400, `Your submission exceeds the limit of ${limit} words.`);
        }
      } else {
        if (essayText.length > limit) {
          throw new ApiError(400, `Your submission exceeds the limit of ${limit} characters.`);
        }
      }
    }
  }

  if (submissionType === "FILE") {
    if (!files || files.length === 0) {
      throw new ApiError(400, "At least one file is required for FILE submissions");
    }

    const allowedTypes = event.submission.file?.allowedTypes || [];
    const maxSize      = event.submission.file?.maxSize;           // MB
    const maxFiles     = event.submission.file?.maxFiles || 5;

    if (files.length > maxFiles) {
      throw new ApiError(400, `Maximum ${maxFiles} file(s) allowed for this event`);
    }

    for (const file of files) {
      const ext = file.originalname.split(".").pop().toLowerCase();

      // Validate file extension
      if (allowedTypes.length > 0 && !allowedTypes.includes(ext)) {
        throw new ApiError(
          400,
          `File type '.${ext}' is not allowed. Accepted: ${allowedTypes.join(", ")}`
        );
      }

      // Validate file size (file.size is bytes from multer)
      if (maxSize && file.size > maxSize * 1024 * 1024) {
        throw new ApiError(
          400,
          `File '${file.originalname}' exceeds the ${maxSize} MB size limit`
        );
      }
    }
  }

  // ── Upload files ──────────────────────────────────────────────────────────
  let uploadedFiles = [];
  if (submissionType === "FILE" && files.length > 0) {
    for (const file of files) {
      const url = await uploadSubmissionFile(
        file.buffer,
        file.originalname,
        file.mimetype,
        LIVE_COMP_FILES_FOLDER
      );
      uploadedFiles.push({
        url,
        fileType:  file.originalname.split(".").pop().toLowerCase(),
        fileName:  file.originalname,
        fileSize:  file.size, // bytes — stored for audit
      });
    }
  }

  // ── Build update payload ──────────────────────────────────────────────────
  const updateData = {
    submittedAt: now,
    isLate: false, // window already validated above, so never late here
  };

  if (submissionType === "TEXT") {
    updateData["content.text"] = text || submission.content?.text || "";
  }
  if (uploadedFiles.length > 0) {
    updateData["content.files"] = uploadedFiles;
  }

  const updated = await liveCompetitionRepository.updateSubmissionById(
    submission._id,
    updateData
  );

  // Increment submission count (only on first real submit — guard not applied
  // here to keep it simple; the unique index prevents double submissions)
  await liveCompetitionRepository.incrementEventStats(eventId, { submissions: 1 });

  return updated;
};

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
