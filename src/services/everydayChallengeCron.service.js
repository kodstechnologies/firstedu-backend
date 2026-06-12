import EverydayChallengeSchedule from "../models/EverydayChallengeSchedule.js";
import Admin from "../models/Admin.js";
import { sendEmailWithTemplate } from "../utils/sendEmail.js";

/**
 * Sends a dynamically generated HTML email to all admins.
 */
const sendEmailToAllAdmins = async (subject, htmlBody) => {
  try {
    const admins = await Admin.find({ email: { $exists: true, $ne: "" } }).select("email").lean();
    for (const admin of admins) {
      if (admin.email) {
        await sendEmailWithTemplate({
          to: admin.email,
          category: "admin_alerts",
          slug: "everyday_challenge_alert",
          defaultSubject: subject,
          defaultHtml: htmlBody,
        });
      }
    }
  } catch (error) {
    console.error("[EverydayChallengeCron] Error sending emails to admins:", error);
  }
};

/**
 * Validates the Everyday Challenge schedule and notifies admins via email if action is needed.
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
      let lastDateText = "Your 7-day Everyday Challenge cycle has completely expired or is empty.";
      const validOldSchedules = schedules.filter(s => s.updatedAt);
      if (validOldSchedules.length > 0) {
        const veryOldest = Math.min(...validOldSchedules.map(s => new Date(s.updatedAt).getTime()));
        const lastDate = new Date(veryOldest + 6 * 24 * 60 * 60 * 1000); // 7th day date
        lastDateText = `${lastDate.toLocaleDateString("en-IN", { dateStyle: "long" })} was the last date for you.`;
      }
      
      const emailHtml = `
        <div style="font-family: Arial, sans-serif; color: #333;">
          <h2 style="color: #e63946;">Everyday Challenge - Cycle Completed</h2>
          <p>${lastDateText} The tests are already completed.</p>
          <p>Please add new tests to the <strong>Everyday Challenge</strong>.</p>
        </div>
      `;
      await sendEmailToAllAdmins("Everyday Challenge Update Required", emailHtml);
      console.log(`[EverydayChallengeCron] Notified admins via email: 0 tests assigned/fresh.`);
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
        const emailHtml = `
          <div style="font-family: Arial, sans-serif; color: #333;">
            <h2 style="color: #f4a261;">Everyday Challenge - Incomplete Schedule</h2>
            <p>You have reached Day ${daysPassed + 1} of the cycle, but Day ${nextSlot} is empty.</p>
            <p>Please assign a test for <strong>Day ${nextSlot}</strong> in the Everyday Challenge to avoid interruptions.</p>
          </div>
        `;
        await sendEmailToAllAdmins("Incomplete Everyday Challenge Schedule", emailHtml);
        console.log(`[EverydayChallengeCron] Notified admins via email: Reached day ${daysPassed + 1}, Slot ${nextSlot} empty.`);
      }
    } else {
      // If highestSlotFilled === 7, the cycle is fully populated!
      if (daysPassed === 5) {
        // Tomorrow is the 7th day
        const tomorrow = new Date(now + 24 * 60 * 60 * 1000);
        const tomorrowStr = tomorrow.toLocaleDateString("en-IN", { dateStyle: "long" });
        const emailHtml = `
          <div style="font-family: Arial, sans-serif; color: #333;">
            <h2 style="color: #2a9d8f;">Everyday Challenge - Ending Tomorrow</h2>
            <p>Tomorrow is the 7th day (last day). On <strong>${tomorrowStr}</strong>, the 7 days will be completed.</p>
            <p>Please add new tests to the <strong>Everyday Challenge</strong>.</p>
          </div>
        `;
        await sendEmailToAllAdmins("Everyday Challenge Reminder - Ends Tomorrow", emailHtml);
        console.log(`[EverydayChallengeCron] Notified admins via email: Cycle ends tomorrow (${tomorrowStr}).`);
      } else if (daysPassed === 6) {
        // Today is the 7th day
        const todayStr = new Date(now).toLocaleDateString("en-IN", { dateStyle: "long" });
        const emailHtml = `
          <div style="font-family: Arial, sans-serif; color: #333;">
            <h2 style="color: #e76f51;">Everyday Challenge - Ending Today</h2>
            <p>Today, <strong>${todayStr}</strong>, is the end of the date test.</p>
            <p>Add there in <strong>Everyday Challenge</strong> to start the new cycle tomorrow.</p>
          </div>
        `;
        await sendEmailToAllAdmins("Everyday Challenge Reminder - Ends Today", emailHtml);
        console.log(`[EverydayChallengeCron] Notified admins via email: Cycle ends today (${todayStr}).`);
      } else {
        console.log(`[EverydayChallengeCron] Schedule is fully updated for the current cycle. Days passed: ${daysPassed}`);
      }
    }

  } catch (error) {
    console.error("[EverydayChallengeCron] Error running everyday challenge cron tick:", error);
  }
};

export default {
  runEverydayChallengeCronTick
};
