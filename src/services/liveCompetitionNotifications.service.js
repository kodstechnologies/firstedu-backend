import LiveCompetition from "../models/LiveCompetition.js";
import LiveCompetitionSubmission from "../models/LiveCompetitionSubmission.js";
import studentRepository from "../repository/student.repository.js";
import { sendNotificationToMultipleStudents } from "./notification.service.js";
import { sendEventStartReminderEmail } from "../utils/sendEmail.js";
import mongoose from "mongoose";

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

export default { runLiveCompetitionNotificationTick };
