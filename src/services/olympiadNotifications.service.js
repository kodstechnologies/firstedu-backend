import OlympiadTest from "../models/OlympiadTest.js";
import OlympiadNotificationLog from "../models/OlympiadNotificationLog.js";
import EventRegistration from "../models/EventRegistration.js";
import studentRepository from "../repository/student.repository.js";
import {
  sendOlympiadStartReminderNotification,
  sendOlympiadStartNotification,
  sendOlympiadResultDeclaredNotification,
} from "./notification.service.js";
import {
  sendEventStartReminderEmail,
  sendEventResultEmail,
} from "../utils/sendEmail.js";

const START_WINDOW_MS = 70 * 1000;
const RESULTS_WINDOW_MS = 70 * 1000;
const REMINDER_MINUTES = 10;

const tryLogNotification = async (olympiadId, kind) => {
  try {
    await OlympiadNotificationLog.create({ olympiad: olympiadId, kind });
    return true;
  } catch (e) {
    if (e?.code === 11000) return false;
    throw e;
  }
};

/**
 * Fetch all registered student emails for an olympiad in one query.
 * Returns array of { _id, name, email }
 */
const getRegisteredStudents = async (olympiadId) => {
  const regs = await EventRegistration.find({
    eventId: olympiadId,
    eventType: "olympiad",
    paymentStatus: "completed",
  }).select("student").lean();

  const studentIds = [...new Set(regs.map(r => r.student?.toString()).filter(Boolean))];
  if (studentIds.length === 0) return [];

  const students = await studentRepository.findAll(
    { _id: { $in: studentIds } },
    { limit: 5000 }
  );
  return (students.students || []).filter(s => s.email);
};

const notifyReminder = async (olympiad) => {
  const logged = await tryLogNotification(olympiad._id, "exam_start_reminder");
  if (!logged) return;

  // In-app push notification
  await sendOlympiadStartReminderNotification(olympiad._id, olympiad.title, null);

  // Email notification (fire-and-forget, does NOT block the cron tick)
  setImmediate(async () => {
    try {
      const students = await getRegisteredStudents(olympiad._id);
      for (const s of students) {
        await sendEventStartReminderEmail({
          email: s.email,
          name: s.name,
          eventName: olympiad.title,
          eventType: "olympiad",
          startTime: olympiad.startTime,
        });
      }
      console.log(`[OlympiadEmail] 📧 Start reminder emails sent for "${olympiad.title}" to ${students.length} students.`);
    } catch (err) {
      console.error(`[OlympiadEmail] Error sending reminder emails for "${olympiad.title}":`, err);
    }
  });
};

const notifyStart = async (olympiad) => {
  const logged = await tryLogNotification(olympiad._id, "exam_start");
  if (!logged) return;

  await sendOlympiadStartNotification(olympiad._id, olympiad.title, null);
};

const notifyResults = async (olympiad) => {
  const logged = await tryLogNotification(olympiad._id, "results_declared");
  if (!logged) return;

  // In-app push notification
  await sendOlympiadResultDeclaredNotification(olympiad._id, olympiad.title, null);

  // Simple result email to all registered students — fire-and-forget
  setImmediate(async () => {
    try {
      const students = await getRegisteredStudents(olympiad._id);
      for (const s of students) {
        await sendEventResultEmail({
          email: s.email,
          name: s.name,
          eventName: olympiad.title,
          eventType: "olympiad",
        });
      }
      console.log(`[OlympiadEmail] 📧 Result emails sent for "${olympiad.title}" to ${students.length} students.`);
    } catch (err) {
      console.error(`[OlympiadEmail] Error sending result emails for "${olympiad.title}":`, err);
    }
  });
};

/**
 * Run from cron (e.g. every minute): olympiad reminders, starts, and results declarations.
 */
export const runOlympiadNotificationTick = async () => {
  const now = new Date();
  const startWindowStart = new Date(now.getTime() - START_WINDOW_MS);
  const resultsWindowStart = new Date(now.getTime() - RESULTS_WINDOW_MS);

  const reminderWindowEnd = new Date(now.getTime() + REMINDER_MINUTES * 60 * 1000);
  const reminderWindowStart = new Date(reminderWindowEnd.getTime() - START_WINDOW_MS);

  const olympiads = await OlympiadTest.find({
    $or: [
      { startTime: { $gte: startWindowStart, $lte: reminderWindowEnd } },
      { resultDeclarationDate: { $gte: resultsWindowStart, $lte: now } },
    ],
  }).lean();

  for (const o of olympiads) {
    if (o.startTime) {
      const start = new Date(o.startTime);
      if (start >= reminderWindowStart && start <= reminderWindowEnd) {
        await notifyReminder(o);
      }
      if (start >= startWindowStart && start <= now) {
        await notifyStart(o);
      }
    }

    if (o.resultDeclarationDate) {
      const resultDate = new Date(o.resultDeclarationDate);
      if (resultDate >= resultsWindowStart && resultDate <= now) {
        await notifyResults(o);
      }
    }
  }
};

export default { runOlympiadNotificationTick };
