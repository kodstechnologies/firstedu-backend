import mongoose from "mongoose";
import LiveCompetition from "../models/LiveCompetition.js";
import LiveCompetitionSubmission from "../models/LiveCompetitionSubmission.js";
import liveCompetitionRepository from "../repository/liveCompetition.repository.js";
import studentRepository from "../repository/student.repository.js";
import { sendNotificationToMultipleStudents } from "./notification.service.js";
import { sendEventStartReminderEmail } from "../utils/sendEmail.js";

// A simple log model can be created, or we can use a generic one. Since we don't have a LiveCompetitionNotificationLog, 
// we will just track this in memory or rely on the cron window. Actually, without a log model, the cron might send multiple times if the server restarts within the 70s window. 
// However, the window is 70 seconds and cron runs every minute, so it usually runs once. 
// For robustness, we'll assume it's acceptable as-is or we can use a Set in memory for now.
const notificationCache = new Set();
const START_WINDOW_MS = 70 * 1000;
const REMINDER_MINUTES = 10;

const tryLogNotification = async (eventId, kind) => {
  const key = `${eventId}_${kind}`;
  if (notificationCache.has(key)) return false;
  notificationCache.add(key);
  // Optional: clear cache after an hour to prevent memory leak
  setTimeout(() => notificationCache.delete(key), 60 * 60 * 1000);
  return true;
};

/**
 * Fetch all registered student emails for a live competition.
 */
const getRegisteredStudents = async (eventId) => {
  const submissions = await LiveCompetitionSubmission.find({
    event: eventId,
    paymentStatus: "COMPLETED",
  }).select("participant").lean();

  const studentIds = [...new Set(submissions.map(s => s.participant?.toString()).filter(Boolean))];
  if (studentIds.length === 0) return [];

  const students = await studentRepository.findAll(
    { _id: { $in: studentIds } },
    { limit: 5000 }
  );
  return (students.students || []).filter(s => s.email);
};

const notifyReminder = async (event) => {
  const logged = await tryLogNotification(event._id.toString(), "live_comp_start_reminder");
  if (!logged) return;

  const students = await getRegisteredStudents(event._id);
  const studentIds = students.map(s => s._id?.toString() || s._id).filter(Boolean);

  if (studentIds.length > 0) {
    const title = `${event.title} starts in 10 mins!`;
    const body = `The Live Competition "${event.title}" will start in 10 minutes. Get ready!`;
    await sendNotificationToMultipleStudents(studentIds, title, body, {
      type: "event",
      eventId: event._id.toString(),
      notificationKind: "live_competition_start_reminder",
    }, null);
  }

  // Email notification
  setImmediate(async () => {
    try {
      for (const s of students) {
        await sendEventStartReminderEmail({
          email: s.email,
          name: s.name,
          eventName: event.title,
          eventType: "live_competition",
          startTime: event.eventWindow?.start,
        });
      }
      console.log(`[LiveCompEmail] 📧 Start reminder emails sent for "${event.title}" to ${students.length} students.`);
    } catch (err) {
      console.error(`[LiveCompEmail] Error sending reminder emails for "${event.title}":`, err);
    }
  });
};

const notifyStart = async (event) => {
  const logged = await tryLogNotification(event._id.toString(), "live_comp_start");
  if (!logged) return;

  const students = await getRegisteredStudents(event._id);
  const studentIds = students.map(s => s._id?.toString() || s._id).filter(Boolean);

  if (studentIds.length > 0) {
    const title = `${event.title} is now live!`;
    const body = `The Live Competition "${event.title}" has officially started. Best of luck!`;
    await sendNotificationToMultipleStudents(studentIds, title, body, {
      type: "event",
      eventId: event._id.toString(),
      notificationKind: "live_competition_start",
    }, null);
  }
};

export const runLiveCompetitionNotificationTick = async () => {
  const now = new Date();
  const startWindowStart = new Date(now.getTime() - START_WINDOW_MS);

  const reminderWindowEnd = new Date(now.getTime() + REMINDER_MINUTES * 60 * 1000);
  const reminderWindowStart = new Date(reminderWindowEnd.getTime() - START_WINDOW_MS);

  const events = await LiveCompetition.find({
    isPublished: true,
    $or: [
      { "eventWindow.start": { $gte: startWindowStart, $lte: reminderWindowEnd } },
    ],
  }).lean();

  for (const e of events) {
    if (e.eventWindow && e.eventWindow.start) {
      const start = new Date(e.eventWindow.start);
      if (start >= reminderWindowStart && start <= reminderWindowEnd) {
        await notifyReminder(e);
      }
      if (start >= startWindowStart && start <= now) {
        await notifyStart(e);
      }
    }
  }
};

const RESULT_WINDOW_MS = 70 * 1000; // 70-second window to avoid missing the cron tick

/**
 * Auto-declare Mega Audition (Round 1) result.
 * Called by cron when resultDeclarationDate has passed and status is still CLOSED.
 */
const autoDeclareMegaAuditionResult = async (event) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    let updatePayload = { "megaAudition.status": "RESULT_DECLARED" };

    // If Grand Finale is configured and its payment window has opened, unlock it
    if (event.grandFinale?.paymentWindow?.start) {
      const now = new Date();
      if (now >= new Date(event.grandFinale.paymentWindow.start)) {
        updatePayload["grandFinale.status"] = "UPCOMING";
      }
    }

    await liveCompetitionRepository.updateEventById(event._id, updatePayload);
    await session.commitTransaction();
    session.endSession();

    console.log(`[LiveCompCron] ✅ Round 1 result auto-declared for "${event.title}"`);

    // Notify all Round 1 participants (fire-and-forget)
    setImmediate(async () => {
      try {
        const submissions = await liveCompetitionRepository.findSubmissions({
          event: event._id,
          round: "MEGA_AUDITION",
        });
        const pIds = [...new Set(submissions.map((s) => s.participant.toString()))];
        if (pIds.length > 0) {
          await sendNotificationToMultipleStudents(
            pIds,
            "Round 1 Results Declared! 🎯",
            `Results for ${event.title} (Mega Audition) are now live. Check the app!`,
            { type: "live_competition_result", eventId: event._id.toString() },
            null
          );
        }
      } catch (err) {
        console.error(`[LiveCompCron] Failed to send Round 1 notifications for "${event.title}":`, err);
      }
    });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    console.error(`[LiveCompCron] Failed to auto-declare Round 1 result for "${event.title}":`, err);
  }
};

/**
 * Auto-declare Grand Finale (Round 2) result.
 * Only fires if at least Rank 1 winner has been assigned (set by admin via WinnerPanel).
 */
const autoDeclareFinalResult = async (event) => {
  // Guard: Grand Finale result requires Rank 1 to be set
  const rank1Winner = await LiveCompetitionSubmission.findOne({
    event: event._id,
    round: "GRAND_FINALE",
    isWinner: true,
    rank: 1,
  }).lean();

  if (!rank1Winner) {
    console.warn(
      `[LiveCompCron] ⚠️ Grand Finale result declaration skipped for "${event.title}" — no Rank 1 winner assigned yet.`
    );
    return;
  }

  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    await liveCompetitionRepository.updateEventById(event._id, {
      "grandFinale.status": "RESULT_DECLARED",
    });
    await session.commitTransaction();
    session.endSession();

    console.log(`[LiveCompCron] ✅ Grand Finale result auto-declared for "${event.title}"`);

    // Notify all Grand Finale participants (fire-and-forget)
    setImmediate(async () => {
      try {
        const submissions = await liveCompetitionRepository.findSubmissions({
          event: event._id,
          round: "GRAND_FINALE",
        });
        const pIds = [...new Set(submissions.map((s) => s.participant.toString()))];
        if (pIds.length > 0) {
          await sendNotificationToMultipleStudents(
            pIds,
            "Grand Finale Results Declared! 🏆",
            `Final results for ${event.title} are now live. Check the app!`,
            { type: "live_competition_result", eventId: event._id.toString() },
            null
          );
        }
      } catch (err) {
        console.error(`[LiveCompCron] Failed to send Grand Finale notifications for "${event.title}":`, err);
      }
    });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    console.error(`[LiveCompCron] Failed to auto-declare Grand Finale result for "${event.title}":`, err);
  }
};

/**
 * Run from the main cron (every minute).
 * Checks for events whose resultDeclarationDate has passed and auto-declares the result.
 */
export const runLiveCompetitionResultTick = async () => {
  const now = new Date();
  const windowStart = new Date(now.getTime() - RESULT_WINDOW_MS);

  // Find events where either round needs auto-declaration
  const events = await LiveCompetition.find({
    isPublished: true,
    $or: [
      // Round 1: CLOSED and resultDeclarationDate has passed
      {
        "megaAudition.status": "CLOSED",
        "megaAudition.resultDeclarationDate": { $gte: windowStart, $lte: now },
      },
      // Grand Finale: CLOSED and resultDeclarationDate has passed
      {
        "grandFinale.status": "CLOSED",
        "grandFinale.resultDeclarationDate": { $gte: windowStart, $lte: now },
      },
    ],
  }).lean();

  for (const event of events) {
    // Round 1 check
    if (
      event.megaAudition?.status === "CLOSED" &&
      event.megaAudition?.resultDeclarationDate
    ) {
      const rdDate = new Date(event.megaAudition.resultDeclarationDate);
      if (rdDate >= windowStart && rdDate <= now) {
        await autoDeclareMegaAuditionResult(event);
      }
    }

    // Grand Finale check
    if (
      event.grandFinale?.status === "CLOSED" &&
      event.grandFinale?.resultDeclarationDate
    ) {
      const rdDate = new Date(event.grandFinale.resultDeclarationDate);
      if (rdDate >= windowStart && rdDate <= now) {
        await autoDeclareFinalResult(event);
      }
    }
  }
};


export default { runLiveCompetitionNotificationTick, runLiveCompetitionResultTick };
