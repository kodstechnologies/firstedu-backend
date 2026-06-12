import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { ApiError } from "../utils/ApiError.js";
import everydayChallengeScheduleRepository from "../repository/EverydayChallengeSchedule.repository.js";
import EverydayChallengeSchedule from "../models/EverydayChallengeSchedule.js";

/**
 * GET /admin/everyday-challenge-schedule
 */
export const getEverydayChallengeSchedule = asyncHandler(async (req, res) => {
  const schedule = await everydayChallengeScheduleRepository.getSchedule();
  return res
    .status(200)
    .json(ApiResponse.success(schedule, "Schedule retrieved successfully"));
});

/**
 * POST /admin/everyday-challenge-schedule
 * Body: { day: 1..7, testId: "objectId" }
 */
export const upsertEverydayChallengeSchedule = asyncHandler(async (req, res) => {
  const { day, testId } = req.body;
  if (!day || day < 1 || day > 7) {
    throw new ApiError(400, "Valid day between 1 and 7 is required");
  }
  if (!testId) {
    throw new ApiError(400, "testId is required");
  }

  const updated = await everydayChallengeScheduleRepository.upsertSchedule(day, testId);
  return res
    .status(200)
    .json(ApiResponse.success(updated, `Test assigned to day ${day} successfully`));
});

/**
 * GET /admin/gamification/everyday-challenge/status
 * Returns showModal: true/false so the frontend can display a reminder modal on login.
 * Uses the same date math as the cron job — no side effects, read-only.
 */
export const getEverydayChallengeStatus = asyncHandler(async (req, res) => {
  const schedules = await EverydayChallengeSchedule.find().lean();

  const now = Date.now();
  const sevenDaysInMs = 7 * 24 * 60 * 60 * 1000;

  // Filter fresh slots (assigned within last 7 days)
  const freshSchedules = schedules.filter(s => {
    if (!s.testId || !s.updatedAt) return false;
    return (now - new Date(s.updatedAt).getTime()) < sevenDaysInMs;
  });

  // Scenario 1: No fresh tests at all — cycle expired or empty
  if (freshSchedules.length === 0) {
    let lastDateText = "The 7-day Everyday Challenge cycle has expired or is empty.";
    const validOld = schedules.filter(s => s.updatedAt);
    if (validOld.length > 0) {
      const veryOldest = Math.min(...validOld.map(s => new Date(s.updatedAt).getTime()));
      const lastDate = new Date(veryOldest + 6 * 24 * 60 * 60 * 1000);
      lastDateText = `${lastDate.toLocaleDateString("en-IN", { dateStyle: "long" })} was the last date. The tests are already completed.`;
    }
    return res.status(200).json(ApiResponse.success({
      showModal: true,
      type: "expired",
      title: "Everyday Challenge — Cycle Completed",
      message: `${lastDateText} Please add new tests to the Everyday Challenge now.`,
    }));
  }

  const oldestUpdate = Math.min(...freshSchedules.map(s => new Date(s.updatedAt).getTime()));
  const daysPassed = Math.floor((now - oldestUpdate) / (1000 * 60 * 60 * 24));
  const highestSlotFilled = Math.max(...freshSchedules.map(s => s.day));

  // Scenario 2: Incomplete schedule — next day slot is empty
  if (highestSlotFilled < 7) {
    const nextSlot = highestSlotFilled + 1;
    if (daysPassed >= highestSlotFilled - 1) {
      return res.status(200).json(ApiResponse.success({
        showModal: true,
        type: "incomplete",
        title: "Everyday Challenge — Incomplete Schedule",
        message: `You have reached Day ${daysPassed + 1} of the cycle, but Day ${nextSlot} is empty. Please assign a test for Day ${nextSlot} in the Everyday Challenge to avoid interruptions.`,
      }));
    }
  } else {
    // Scenario 3: Full schedule — warn 1 day before end
    if (daysPassed === 5) {
      const tomorrowStr = new Date(now + 24 * 60 * 60 * 1000).toLocaleDateString("en-IN", { dateStyle: "long" });
      return res.status(200).json(ApiResponse.success({
        showModal: true,
        type: "ending_tomorrow",
        title: "Everyday Challenge — Ending Tomorrow",
        message: `Tomorrow (${tomorrowStr}) is the 7th and last day of the current Everyday Challenge cycle. Please prepare and add new tests for the next cycle.`,
      }));
    }
    // Scenario 4: Full schedule — warn on the last day
    if (daysPassed === 6) {
      const todayStr = new Date(now).toLocaleDateString("en-IN", { dateStyle: "long" });
      return res.status(200).json(ApiResponse.success({
        showModal: true,
        type: "ending_today",
        title: "Everyday Challenge — Ending Today",
        message: `Today (${todayStr}) is the last day of the current Everyday Challenge cycle. Add new tests to the Everyday Challenge to start the new cycle tomorrow.`,
      }));
    }
  }

  // All good — no modal needed
  return res.status(200).json(ApiResponse.success({ showModal: false }));
});

export default {
  getEverydayChallengeStatus,
  getEverydayChallengeSchedule,
  upsertEverydayChallengeSchedule,
};
