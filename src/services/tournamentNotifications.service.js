import Tournament from "../models/Tournament.js";
import TournamentNotificationLog from "../models/TournamentNotificationLog.js";
import eventRegistrationRepository from "../repository/eventRegistration.repository.js";
import { sendNotificationToMultipleStudents } from "./notification.service.js";
import { isStudentQualifiedAfterStage } from "./tournament.service.js";

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

const notifyStageResults = async (tournament, stageIndex, stage, orderedStages) => {
  const stageId = stage._id;
  if (!stageId) return;

  const nextStage = orderedStages[stageIndex + 1];
  if (!nextStage) return;

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

  const tournaments = await Tournament.find({
    isPublished: true,
    $or: [
      { stages: { $elemMatch: { startTime: { $gte: startWindowStart, $lte: now } } } },
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
