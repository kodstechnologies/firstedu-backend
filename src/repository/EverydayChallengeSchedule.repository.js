import EverydayChallengeSchedule from "../models/EverydayChallengeSchedule.js";

class EverydayChallengeScheduleRepository {
  async getSchedule() {
    return EverydayChallengeSchedule.find().populate({
      path: "testId",
      select: "title applicableFor rewardPoints questionBank",
      populate: { path: "questionBank", select: "totalQuestions totalMarks" },
    }).sort({ day: 1 });
  }

  async getScheduleForDay(day) {
    return EverydayChallengeSchedule.findOne({ day }).populate({
      path: "testId",
      select: "title applicableFor rewardPoints durationMinutes questionBank",
      populate: { path: "questionBank", select: "name categories totalQuestions totalMarks" },
    });
  }

  async upsertSchedule(day, testId) {
    return EverydayChallengeSchedule.findOneAndUpdate(
      { day },
      { testId },
      { new: true, upsert: true }
    ).populate("testId");
  }
}

export default new EverydayChallengeScheduleRepository();
