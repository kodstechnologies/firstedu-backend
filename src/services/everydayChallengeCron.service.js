import EverydayChallengeSchedule from "../models/EverydayChallengeSchedule.js";
import { sendNotificationToAllAdmins } from "./notification.service.js";

/**
 * Validates the Everyday Challenge schedule and notifies admins if action is needed.
 * This runs daily via cron.
 */
export const runEverydayChallengeCronTick = async () => {
  try {
    const schedules = await EverydayChallengeSchedule.find().lean();
    
    const now = Date.now();
    const sevenDaysInMs = 7 * 24 * 60 * 60 * 1000;
    
    // 1. Filter out expired slots (older than 7 days) or empty slots
    const freshSchedules = schedules.filter(schedule => {
      if (!schedule.testId || !schedule.updatedAt) return false;
      const timeSinceUpdate = now - new Date(schedule.updatedAt).getTime();
      return timeSinceUpdate < sevenDaysInMs;
    });

    if (freshSchedules.length === 0) {
      // Condition: 7 days have passed, or no tests are assigned at all.
      await sendNotificationToAllAdmins(
        "Everyday Challenge Update Required",
        "7 days have gone! Please add tests for the new Everyday Challenge cycle starting with Day 1.",
        { type: "system", module: "everyday_challenge" }
      );
      console.log(`[EverydayChallengeCron] Notified admins: 0 tests assigned/fresh.`);
      return;
    }

    // 2. Determine cycle start based on the oldest fresh update
    const oldestUpdate = Math.min(...freshSchedules.map(s => new Date(s.updatedAt).getTime()));
    const daysPassed = Math.floor((now - oldestUpdate) / (1000 * 60 * 60 * 24));
    
    // 3. Find the highest slot currently filled
    const highestSlotFilled = Math.max(...freshSchedules.map(s => s.day));

    // 4. Check if the cycle is reaching the end of the filled slots
    if (highestSlotFilled < 7) {
      const nextSlot = highestSlotFilled + 1;
      
      // If we are at or past the point where there's only 1 valid test left
      if (daysPassed >= highestSlotFilled - 1) {
        await sendNotificationToAllAdmins(
          "Incomplete Everyday Challenge",
          `You have reached Day ${daysPassed + 1} of the cycle, but Day ${nextSlot} is empty. Please assign a test for Day ${nextSlot}.`,
          { type: "system", module: "everyday_challenge" }
        );
        console.log(`[EverydayChallengeCron] Notified admins: Reached day ${daysPassed + 1}, Slot ${nextSlot} empty.`);
      }
    } else {
      // If highestSlotFilled === 7, the cycle is fully populated!
      console.log(`[EverydayChallengeCron] Schedule is fully updated for the current cycle.`);
    }

  } catch (error) {
    console.error("[EverydayChallengeCron] Error running everyday challenge cron tick:", error);
  }
};

export default {
  runEverydayChallengeCronTick
};
