import Workshop from "../models/Workshop.js";
import WorkshopNotificationLog from "../models/WorkshopNotificationLog.js";
import EventRegistration from "../models/EventRegistration.js";
import studentRepository from "../repository/student.repository.js";
import { sendNotificationToMultipleStudents } from "./notification.service.js";
import { sendEventStartReminderEmail } from "../utils/sendEmail.js";

const START_WINDOW_MS = 70 * 1000;
const REMINDER_MINUTES = 10;

const tryLogNotification = async (workshopId, kind) => {
  try {
    await WorkshopNotificationLog.create({ workshop: workshopId, kind });
    return true;
  } catch (e) {
    if (e?.code === 11000) return false;
    throw e;
  }
};

/**
 * Fetch all registered student emails for a workshop in one query.
 * Returns array of { _id, name, email }
 */
const getRegisteredStudents = async (workshopId) => {
  const regs = await EventRegistration.find({
    eventId: workshopId,
    eventType: "workshop",
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

const notifyReminder = async (workshop) => {
  const logged = await tryLogNotification(workshop._id, "workshop_start_reminder");
  if (!logged) return;

  const students = await getRegisteredStudents(workshop._id);
  const studentIds = students.map(s => s._id?.toString() || s._id).filter(Boolean);

  if (studentIds.length > 0) {
    const title = `${workshop.title} starts in 10 mins!`;
    const body = `Your registered workshop "${workshop.title}" will start in 10 minutes. Get ready!`;
    await sendNotificationToMultipleStudents(studentIds, title, body, {
      type: "event",
      workshopId: workshop._id.toString(),
      notificationKind: "workshop_start_reminder",
    }, null);
  }

  // Email notification (fire-and-forget)
  setImmediate(async () => {
    try {
      for (const s of students) {
        await sendEventStartReminderEmail({
          email: s.email,
          name: s.name,
          eventName: workshop.title,
          eventType: "workshop",
          startTime: workshop.startTime,
        });
      }
      console.log(`[WorkshopEmail] 📧 Start reminder emails sent for "${workshop.title}" to ${students.length} students.`);
    } catch (err) {
      console.error(`[WorkshopEmail] Error sending reminder emails for "${workshop.title}":`, err);
    }
  });
};

const notifyStart = async (workshop) => {
  const logged = await tryLogNotification(workshop._id, "workshop_start");
  if (!logged) return;

  const students = await getRegisteredStudents(workshop._id);
  const studentIds = students.map(s => s._id?.toString() || s._id).filter(Boolean);

  if (studentIds.length > 0) {
    const title = `${workshop.title} is now live!`;
    const body = `Your workshop "${workshop.title}" has started. Join now using the meeting link.`;
    await sendNotificationToMultipleStudents(studentIds, title, body, {
      type: "event",
      workshopId: workshop._id.toString(),
      notificationKind: "workshop_start",
    }, null);
  }
};

/**
 * Run from cron (e.g. every minute): workshop reminders and starts.
 */
export const runWorkshopNotificationTick = async () => {
  const now = new Date();
  const startWindowStart = new Date(now.getTime() - START_WINDOW_MS);

  const reminderWindowEnd = new Date(now.getTime() + REMINDER_MINUTES * 60 * 1000);
  const reminderWindowStart = new Date(reminderWindowEnd.getTime() - START_WINDOW_MS);

  const workshops = await Workshop.find({
    isPublished: true,
    $or: [
      { startTime: { $gte: startWindowStart, $lte: reminderWindowEnd } },
    ],
  }).lean();

  for (const w of workshops) {
    if (w.startTime) {
      const start = new Date(w.startTime);
      if (start >= reminderWindowStart && start <= reminderWindowEnd) {
        await notifyReminder(w);
      }
      if (start >= startWindowStart && start <= now) {
        await notifyStart(w);
      }
    }
  }
};

export default { runWorkshopNotificationTick };
