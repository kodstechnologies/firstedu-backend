import EverydayChallengeSchedule from "../models/EverydayChallengeSchedule.js";
import { sendNotificationToAllAdmins } from "./notification.service.js";

/**
 * Validates the Everyday Challenge schedule and notifies admins if action is needed.
 * This runs daily via cron.
 */
export const runEverydayChallengeCronTick = async () => {
  try {
    const schedules = await EverydayChallengeSchedule.find().lean();
    
    // Count how many days have a test assigned and were updated within the last 7 days
    const now = Date.now();
    const sevenDaysInMs = 7 * 24 * 60 * 60 * 1000;
    
    let recentUpdatesCount = 0;
    schedules.forEach(schedule => {
      if (schedule.testId && schedule.updatedAt) {
        const timeSinceUpdate = now - new Date(schedule.updatedAt).getTime();
        if (timeSinceUpdate < sevenDaysInMs) {
          recentUpdatesCount++;
        }
      }
    });

    if (recentUpdatesCount === 0) {
      // Condition: 7 days have passed, or no tests are assigned at all.
      await sendNotificationToAllAdmins(
        "Everyday Challenge Update Required",
        "7 days have gone! Please add 7 tests for the new Everyday Challenge cycle.",
        { type: "system", module: "everyday_challenge" }
      );
      console.log(`[EverydayChallengeCron] Notified admins: 7 days have gone (recent updates = 0).`);
    } else if (recentUpdatesCount > 0 && recentUpdatesCount < 7) {
      // Condition: Partially updated schedule.
      const remaining = 7 - recentUpdatesCount;
      await sendNotificationToAllAdmins(
        "Incomplete Everyday Challenge",
        `You added only ${recentUpdatesCount} tests. Please add the remaining ${remaining} tests for the Everyday Challenge.`,
        { type: "system", module: "everyday_challenge" }
      );
      console.log(`[EverydayChallengeCron] Notified admins: Partially updated (${recentUpdatesCount}/7).`);
    } else {
      // recentUpdatesCount === 7, all good.
      console.log(`[EverydayChallengeCron] Schedule is fully updated for the current cycle.`);
    }

  } catch (error) {
    console.error("[EverydayChallengeCron] Error running everyday challenge cron tick:", error);
  }
};

export default {
  runEverydayChallengeCronTick
};
