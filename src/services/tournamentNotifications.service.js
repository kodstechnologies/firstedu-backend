import Tournament from "../models/Tournament.js";
import TournamentNotificationLog from "../models/TournamentNotificationLog.js";
import eventRegistrationRepository from "../repository/eventRegistration.repository.js";
import studentRepository from "../repository/student.repository.js";
import { sendNotificationToMultipleStudents } from "./notification.service.js";
import { isStudentQualifiedAfterStage } from "./tournament.service.js";
import { sendEventStartReminderEmail, sendEventResultEmail } from "../utils/sendEmail.js";

// Cron runs every minute; keep a small grace window so messages are near real-time
// but still sent if one tick is slightly late.
const START_WINDOW_MS = 70 * 1000;
const RESULTS_WINDOW_MS = 70 * 1000;

const sortStages = (stages) =>
  [...(stages || [])].sort((a, b) => (a.order || 0) - (b.order || 0));

const formatDateTime = (dateLike) =>
  new Date(dateLike).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });

const hasQualifiedStage = async (tournamentId, studentId, stage) =>
  isStudentQualifiedAfterStage(stage, studentId, tournamentId);

const tryLogNotification = async (tournamentId, stageId, kind) => {
  try {
    await TournamentNotificationLog.create({
      tournament: tournamentId,
      stageId,
      kind,
    });
    return true;
  } catch (e) {
    if (e?.code === 11000) return false;
    throw e;
  }
};

const notifyStageStart = async (tournament, stage) => {
  const stageId = stage._id;
  if (!stageId) return;

  const logged = await tryLogNotification(tournament._id, stageId, "stage_start");
  if (!logged) return;

  const regs = await eventRegistrationRepository.find(
    {
      eventType: "tournament",
      eventId: tournament._id,
      paymentStatus: "completed",
    },
    { limit: 5000 }
  );
  const studentIds = [
    ...new Set(regs.map((r) => r.student?._id?.toString?.() || r.student?.toString?.()).filter(Boolean)),
  ];
  if (studentIds.length === 0) return;

  const title = `${tournament.title} - ${stage.name} is now live`;
  const body = `Round "${stage.name}" has started. Start your test now before the round closes.`;
  await sendNotificationToMultipleStudents(studentIds, title, body, {
    type: "event",
    tournamentId: tournament._id.toString(),
    stageId: stageId.toString(),
    stageName: stage.name,
    notificationKind: "tournament_stage_start",
  }, null);
};

const notifyStageReminder = async (tournament, stage) => {
  const stageId = stage._id;
  if (!stageId) return;

  const logged = await tryLogNotification(tournament._id, stageId, "stage_start_reminder");
  if (!logged) return;

  const regs = await eventRegistrationRepository.find(
    {
      eventType: "tournament",
      eventId: tournament._id,
      paymentStatus: "completed",
    },
    { limit: 5000 }
  );
  const studentIds = [
    ...new Set(regs.map((r) => r.student?._id?.toString?.() || r.student?.toString?.()).filter(Boolean)),
  ];
  if (studentIds.length === 0) return;

  const title = `${tournament.title} - ${stage.name} starts in 10 mins!`;
  const body = `Round "${stage.name}" will start in 10 minutes. Get ready to compete!`;
  await sendNotificationToMultipleStudents(studentIds, title, body, {
    type: "event",
    tournamentId: tournament._id.toString(),
    stageId: stageId.toString(),
    stageName: stage.name,
    notificationKind: "tournament_stage_start_reminder",
  }, null);

  // Send emails in background — does NOT block cron tick
  setImmediate(async () => {
    try {
      const studentsData = await studentRepository.findAll(
        { _id: { $in: studentIds } },
        { limit: 5000 }
      );
      for (const s of (studentsData.students || [])) {
        if (!s.email) continue;
        await sendEventStartReminderEmail({
          email: s.email,
          name: s.name,
          eventName: `${tournament.title} (${stage.name})`,
          eventType: "tournament",
          startTime: stage.startTime,
        });
      }
      console.log(`[TournamentEmail] 📧 Reminder emails sent for "${tournament.title} - ${stage.name}" to ${studentIds.length} students.`);
    } catch (err) {
      console.error(`[TournamentEmail] Error sending reminder emails for "${tournament.title}":`, err);
    }
  });
};

const notifyStageResults = async (tournament, stageIndex, stage, orderedStages) => {
  const stageId = stage._id;
  if (!stageId) return;

  const nextStage = orderedStages[stageIndex + 1];

  const logged = await tryLogNotification(tournament._id, stageId, "stage_results");
  if (!logged) return;

  const regs = await eventRegistrationRepository.find(
    {
      eventType: "tournament",
      eventId: tournament._id,
      paymentStatus: "completed",
    },
    { limit: 5000 }
  );
  const studentIds = [
    ...new Set(regs.map((r) => r.student?._id?.toString?.() || r.student?.toString?.()).filter(Boolean)),
  ];
  if (studentIds.length === 0) return;

  const qualified = [];
  const notQualified = [];
  for (const sid of studentIds) {
    if (await hasQualifiedStage(tournament._id, sid, stage)) qualified.push(sid);
    else notQualified.push(sid);
  }

  if (!nextStage) {
    // This is the final round — send in-app push
    if (qualified.length > 0) {
      await sendNotificationToMultipleStudents(
        qualified,
        `${tournament.title} - Final Results Declared!`,
        `Congratulations! You have completed the final round of ${tournament.title}. Check your final ranking now!`,
        {
          type: "event",
          tournamentId: tournament._id.toString(),
          stageId: stageId.toString(),
          notificationKind: "tournament_final_result",
        },
        null
      );
    }
    if (notQualified.length > 0) {
      await sendNotificationToMultipleStudents(
        notQualified,
        `${tournament.title} - Final Results Declared`,
        `The final results for ${tournament.title} are now available. Check the leaderboard!`,
        {
          type: "event",
          tournamentId: tournament._id.toString(),
          stageId: stageId.toString(),
          notificationKind: "tournament_final_result",
        },
        null
      );
    }

    // Send simple result emails to ALL registered students — fire-and-forget
    setImmediate(async () => {
      try {
        const allStudentIds = [...qualified, ...notQualified];
        if (allStudentIds.length === 0) return;
        const studentsData = await studentRepository.findAll(
          { _id: { $in: allStudentIds } },
          { limit: 5000 }
        );
        for (const s of (studentsData.students || [])) {
          if (!s.email) continue;
          await sendEventResultEmail({
            email: s.email,
            name: s.name,
            eventName: tournament.title,
            eventType: "tournament",
          });
        }
        console.log(`[TournamentEmail] 📧 Final result emails sent for "${tournament.title}" to ${allStudentIds.length} students.`);
      } catch (err) {
        console.error(`[TournamentEmail] Error sending final result emails for "${tournament.title}":`, err);
      }
    });

    return;
  }

  // Else, it has a nextStage — send in-app push notifications
  if (qualified.length > 0) {
    await sendNotificationToMultipleStudents(
      qualified,
      `${tournament.title} - You qualified for next round`,
      `You have qualified for "${nextStage.name}". Next round starts on ${formatDateTime(nextStage.startTime)}. Join on time.`,
      {
        type: "event",
        tournamentId: tournament._id.toString(),
        stageId: stageId.toString(),
        nextStageId: nextStage._id?.toString?.() || "",
        notificationKind: "tournament_stage_qualified",
      },
      null
    );

    // Email only qualified students for intermediate rounds
    setImmediate(async () => {
      try {
        const studentsData = await studentRepository.findAll(
          { _id: { $in: qualified } },
          { limit: 5000 }
        );
        for (const s of (studentsData.students || [])) {
          if (!s.email) continue;
          await sendEventResultEmail({
            email: s.email,
            name: s.name,
            eventName: `${tournament.title} (${stage.name} Round)`,
            eventType: "tournament",
          });
        }
        console.log(`[TournamentEmail] 📧 Intermediate result emails sent for "${tournament.title} - ${stage.name}" to ${qualified.length} qualified students.`);
      } catch (err) {
        console.error(`[TournamentEmail] Error sending intermediate result emails for "${tournament.title}":`, err);
      }
    });
  }

  if (notQualified.length > 0) {
    await sendNotificationToMultipleStudents(
      notQualified,
      `${tournament.title} - Round result update`,
      `You did not qualify for "${nextStage.name}". You can still view tournament updates in the app.`,
      {
        type: "event",
        tournamentId: tournament._id.toString(),
        stageId: stageId.toString(),
        notificationKind: "tournament_stage_not_qualified",
      },
      null
    );
  }
};

/**
 * Run from cron (e.g. every minute): stage-start reminders and post-stage qualification notices.
 */
export const runTournamentNotificationTick = async () => {
  const now = new Date();
  const startWindowStart = new Date(now.getTime() - START_WINDOW_MS);
  const resultsWindowStart = new Date(now.getTime() - RESULTS_WINDOW_MS);

  // 10 minute reminder
  const REMINDER_MINUTES = 10;
  const reminderWindowEnd = new Date(now.getTime() + REMINDER_MINUTES * 60 * 1000);
  const reminderWindowStart = new Date(reminderWindowEnd.getTime() - START_WINDOW_MS);

  const tournaments = await Tournament.find({
    isPublished: true,
    $or: [
      { stages: { $elemMatch: { startTime: { $gte: startWindowStart, $lte: reminderWindowEnd } } } },
      { stages: { $elemMatch: { endTime: { $gte: resultsWindowStart, $lte: now } } } },
    ],
  }).lean();

  for (const t of tournaments) {
    const ordered = sortStages(t.stages);
    for (let i = 0; i < ordered.length; i++) {
      const stage = ordered[i];
      const start = new Date(stage.startTime);
      const end = new Date(stage.endTime);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) continue;

      if (start >= reminderWindowStart && start <= reminderWindowEnd) {
        await notifyStageReminder(t, stage);
      }
      if (start >= startWindowStart && start <= now) {
        await notifyStageStart(t, stage);
      }
      if (end >= resultsWindowStart && end <= now) {
        await notifyStageResults(t, i, stage, ordered);
      }
    }
  }
};

export default { runTournamentNotificationTick };
