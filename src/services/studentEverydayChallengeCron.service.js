import EverydayChallengeCompletion from "../models/EverydayChallengeCompletion.js";
import Student from "../models/Student.js";
import { getStartOfDayUTC } from "./everydayChallenge.service.js";
import { sendNotificationToMultipleStudents } from "./notification.service.js";

const buildNotificationMessage = (streakDay) => {
  if (streakDay === 1) {
    return {
      title: "Start Your Streak!",
      body: "Time to build a habit! Take your Day 1 Everyday Challenge now."
    };
  } else if (streakDay === 6) {
    return {
      title: "6-Day Streak! 🔥",
      body: "Keep going, keep points! You are on a 6-day streak. Don't lose it now!"
    };
  } else if (streakDay === 7) {
    return {
      title: "Final Day! 🏆",
      body: "You made it to Day 7! Complete today's challenge to maximize your streak rewards."
    };
  } else {
    return {
      title: "Keep Your Streak Alive!",
      body: `You're on Day ${streakDay}! Complete today's challenge to earn more XP.`
    };
  }
};

/**
 * Runs the student notification logic for Everyday Challenges.
 * @param {boolean} isMorning - true if morning cron (08:00 AM), false if evening cron (06:00 PM)
 */
export const runStudentEverydayChallengeReminders = async (isMorning) => {
  try {
    const today = getStartOfDayUTC();
    const todayStr = today.toISOString().slice(0, 10);
    
    const yesterday = new Date(today);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    const yesterdayStr = yesterday.toISOString().slice(0, 10);

    // 1. Get all completions for today to exclude those students
    const todayCompletions = await EverydayChallengeCompletion.find({
      date: { $gte: today }
    }).select('student').lean();
    
    const excludedStudentIds = todayCompletions.map(c => c.student.toString());

    // 2. Find the latest completion for every student using aggregation
    const latestCompletions = await EverydayChallengeCompletion.aggregate([
      { $sort: { date: -1 } },
      {
        $group: {
          _id: "$student",
          lastDate: { $first: "$date" },
          streakDay: { $first: "$streakDay" }
        }
      }
    ]);

    const completionMap = new Map();
    latestCompletions.forEach(c => {
      completionMap.set(c._id.toString(), c);
    });

    // 3. Find all active students
    const activeStudents = await Student.find({ status: 'active' }).select('_id').lean();

    const groups = {
      1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: []
    };

    activeStudents.forEach(student => {
      const sId = student._id.toString();
      
      // Exclusion A: If they already completed today's challenge
      if (excludedStudentIds.includes(sId)) return;

      const lastComp = completionMap.get(sId);
      let nextStreakDay = 1;

      if (lastComp) {
        const lastDateStr = getStartOfDayUTC(lastComp.lastDate).toISOString().slice(0, 10);
        if (lastDateStr === yesterdayStr) {
          // If they completed yesterday, next day is streakDay+1 (or 1 if it was Day 7)
          nextStreakDay = lastComp.streakDay === 7 ? 1 : lastComp.streakDay + 1;
        } else if (lastDateStr === todayStr) {
           // Fallback check, shouldn't happen due to excludedStudentIds
           return; 
        } else {
          // Streak broken (last completion was > 1 day ago)
          nextStreakDay = 1;
        }
      } else {
        // No previous completions
        nextStreakDay = 1;
      }

      // Exclusion B: If Evening and they are on Day 1, do not spam them
      if (!isMorning && nextStreakDay === 1) {
        return;
      }

      groups[nextStreakDay].push(sId);
    });

    // 4. Send notifications per group
    for (const [dayStr, studentIds] of Object.entries(groups)) {
      const day = parseInt(dayStr, 10);
      if (studentIds.length > 0) {
        const msg = buildNotificationMessage(day);
        
        // Batch studentIds to avoid overloading FCM service
        const batchSize = 500;
        for (let i = 0; i < studentIds.length; i += batchSize) {
          const batch = studentIds.slice(i, i + batchSize);
          await sendNotificationToMultipleStudents(
            batch,
            msg.title,
            msg.body,
            { type: "gamification", event: "everyday_challenge_reminder" },
            null // Sent by system
          );
        }
        console.log(`[StudentEverydayChallengeCron] Sent Day ${day} reminders to ${studentIds.length} students (${isMorning ? 'Morning' : 'Evening'})`);
      }
    }
  } catch (error) {
    console.error("[StudentEverydayChallengeCron] Error running student reminders:", error);
  }
};

export default {
  runStudentEverydayChallengeReminders
};
