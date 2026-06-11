import Tournament from "../models/Tournament.js";
import TournamentNotificationLog from "../models/TournamentNotificationLog.js";
import eventRegistrationRepository from "../repository/eventRegistration.repository.js";
import studentRepository from "../repository/student.repository.js";
import { sendNotificationToMultipleStudents } from "./notification.service.js";
import { isStudentQualifiedAfterStage } from "./tournament.service.js";
import { sendEventStartReminderEmail, sendEventStartEmail, sendEventResultEmail } from "../utils/sendEmail.js";

const WINDOW_MS = 4 * 60 * 1000; // 4-minute grace period

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
  let studentIds = [
    ...new Set(regs.map((r) => r.student?._id?.toString?.() || r.student?.toString?.()).filter(Boolean)),
  ];
  if (studentIds.length === 0) return;

  const orderedStages = sortStages(tournament.stages);
  const stageIndex = orderedStages.findIndex(s => s._id.toString() === stageId.toString());
  if (stageIndex > 0) {
    const prevStage = orderedStages[stageIndex - 1];
    const qualifiedIds = [];
    for (const sid of studentIds) {
      if (await hasQualifiedStage(tournament._id, sid, prevStage)) {
        qualifiedIds.push(sid);
      }
    }
    studentIds = qualifiedIds;
  }

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

  // Send emails in background — does NOT block cron tick
  setImmediate(async () => {
    try {
      const studentsData = await studentRepository.findAll(
        { _id: { $in: studentIds } },
        { limit: 5000 }
      );
      for (const s of (studentsData.students || [])) {
        if (!s.email) continue;
        await sendEventStartEmail({
          email: s.email,
          name: s.name,
          eventName: `${tournament.title} (${stage.name})`,
          eventType: "tournament",
          startTime: stage.startTime,
        });
      }
      console.log(`[TournamentEmail] 📧 Exact start emails sent for "${tournament.title} - ${stage.name}" to ${studentIds.length} students.`);
    } catch (err) {
      console.error(`[TournamentEmail] Error sending exact start emails for "${tournament.title}":`, err);
    }
  });
};

const notifyStageReminder = async (tournament, stage) => {
  const stageId = stage._id;
  if (!stageId) return;

  const logged = await tryLogNotification(tournament._id, stageId, "stage_start_reminder_11");
  if (!logged) return;

  const regs = await eventRegistrationRepository.find(
    {
      eventType: "tournament",
      eventId: tournament._id,
      paymentStatus: "completed",
    },
    { limit: 5000 }
  );
  let studentIds = [
    ...new Set(regs.map((r) => r.student?._id?.toString?.() || r.student?.toString?.()).filter(Boolean)),
  ];
  if (studentIds.length === 0) return;

  const orderedStages = sortStages(tournament.stages);
  const stageIndex = orderedStages.findIndex(s => s._id.toString() === stageId.toString());
  if (stageIndex > 0) {
    const prevStage = orderedStages[stageIndex - 1];
    const qualifiedIds = [];
    for (const sid of studentIds) {
      if (await hasQualifiedStage(tournament._id, sid, prevStage)) {
        qualifiedIds.push(sid);
      }
    }
    studentIds = qualifiedIds;
  }

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
      console.log(`[TournamentEmail] 📧 11-min reminder emails sent for "${tournament.title} - ${stage.name}" to ${studentIds.length} students.`);
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
        const { getTournamentLeaderboard } = await import("./tournament.service.js");
        const { leaderboard } = await getTournamentLeaderboard(tournament._id, 10000);
        const lbMap = new Map();
        leaderboard.forEach(entry => {
          if (entry.student) lbMap.set(entry.student.toString(), entry);
        });

        const allStudentIds = [...qualified, ...notQualified];
        if (allStudentIds.length === 0) return;
        const studentsData = await studentRepository.findAll(
          { _id: { $in: allStudentIds } },
          { limit: 5000 }
        );
        for (const s of (studentsData.students || [])) {
          if (!s.email) continue;
          const lbEntry = lbMap.get(s._id.toString());
          await sendEventResultEmail({
            email: s.email,
            name: s.name,
            eventName: tournament.title,
            eventType: "tournament",
            score: lbEntry?.score,
            maxScore: lbEntry?.maxScore,
            rank: lbEntry?.rank,
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
 * Run from cron (e.g. every minute): stage-start reminders, starts, and post-stage qualification notices.
 */
export const runTournamentNotificationTick = async () => {
  const now = new Date();

  // Broad window query: fetch tournaments that have stages starting within the next 15 mins or ending within the last 4 mins
  const tournaments = await Tournament.find({
    isPublished: true,
    $or: [
      { stages: { $elemMatch: { startTime: { $gte: new Date(now.getTime() - WINDOW_MS), $lte: new Date(now.getTime() + 15 * 60 * 1000) } } } },
      { stages: { $elemMatch: { endTime: { $gte: new Date(now.getTime() - WINDOW_MS), $lte: now } } } },
    ],
  }).lean();

  for (const t of tournaments) {
    const ordered = sortStages(t.stages);
    for (let i = 0; i < ordered.length; i++) {
      const stage = ordered[i];
      const start = new Date(stage.startTime);
      const end = new Date(stage.endTime);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) continue;

      const timeToStartMs = start.getTime() - now.getTime();
      const timeSinceResultMs = now.getTime() - end.getTime();

      // Reminder: ~11 minutes before
      const elevenMinsMs = 11 * 60 * 1000;
      if (timeToStartMs <= elevenMinsMs && timeToStartMs >= elevenMinsMs - WINDOW_MS) {
        await notifyStageReminder(t, stage);
      }

      // Start: ~1 minute before
      const oneMinMs = 1 * 60 * 1000;
      if (timeToStartMs <= oneMinMs && timeToStartMs >= oneMinMs - WINDOW_MS) {
        await notifyStageStart(t, stage);
      }

      // Results: Within WINDOW_MS after the stage ends
      if (timeSinceResultMs >= 0 && timeSinceResultMs <= WINDOW_MS) {
        await notifyStageResults(t, i, stage, ordered);
      }
    }
  }
};

export default { runTournamentNotificationTick };
