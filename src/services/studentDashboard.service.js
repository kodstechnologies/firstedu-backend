import ExamSession from "../models/ExamSession.js";
import Olympiad from "../models/Olympiad.js";
import Tournament from "../models/Tournament.js";
import Workshop from "../models/Workshop.js";

export const getStudentDashboardStats = async (studentId) => {
  const sessions = await ExamSession.find({
    student: studentId,
    status: "completed",
  })
    .populate({ path: "test", select: "title durationMinutes applicableFor questionBank", populate: { path: "questionBank", select: "name" } })
    .sort({ completedAt: 1 }) // Chronological order (oldest first)
    .lean();

  const totalTestsTaken = sessions.length;
  let totalTimeMs = 0;
  let totalScorePercent = 0;
  let bestScorePercent = 0;

  const monthlyData = {};
  const subjectData = {};
  const typeData = {}; // keyed by applicableFor value

  const recentTestResults = [];

  sessions.forEach((session) => {
    // 1. Total Time — sum of the officially decided test duration (durationMinutes)
    const durationMs = (session.test?.durationMinutes || 0) * 60 * 1000;
    totalTimeMs += durationMs;

    // 2. Score mapping
    let percent = 0;
    if (session.maxScore > 0) {
      percent = (Math.max(0, session.score || 0) / session.maxScore) * 100;
    }
    totalScorePercent += percent;
    if (percent > bestScorePercent) bestScorePercent = percent;

    // 3. Recent Tests
    // We unshift to put newest at the start of the array
    recentTestResults.unshift({
      name: session.test?.title || "Unknown Test",
      category: session.test?.questionBank?.name || "Uncategorized",
      score: Math.max(0, session.score || 0),
      maxScore: session.maxScore || 0,
      percentage: Math.round(percent),
      date: session.completedAt,
      sessionId: session._id,
      type: session.test?.applicableFor || "test",
    });

    // 4. Monthly Trend
    const compDate = new Date(session.completedAt || session.endTime);
    // e.g., "Jan 2026"
    const monthYear = compDate.toLocaleString("default", { month: "short", year: "numeric" });
    if (!monthlyData[monthYear]) {
      monthlyData[monthYear] = { sumPercent: 0, count: 0 };
    }
    monthlyData[monthYear].sumPercent += percent;
    monthlyData[monthYear].count += 1;

    // 5. Category Performance
    if (session.subjectAnalysis && Array.isArray(session.subjectAnalysis)) {
      session.subjectAnalysis.forEach((sub) => {
        if (!subjectData[sub.subject]) {
          subjectData[sub.subject] = { sumAccuracy: 0, count: 0 };
        }
        subjectData[sub.subject].sumAccuracy += sub.accuracy || 0;
        subjectData[sub.subject].count += 1;
      });
    }

    // 6. Test-Type Stats (by applicableFor)
    const type = session.test?.applicableFor || "test";
    if (!typeData[type]) {
      typeData[type] = {
        count: 0,
        totalDurationMinutes: 0,
        sumPercent: 0,
        bestScore: 0,
        monthly: {}, // monthKey → { sumPercent, count }
      };
    }
    typeData[type].count += 1;
    typeData[type].totalDurationMinutes += session.test?.durationMinutes || 0;
    typeData[type].sumPercent += percent;
    if (percent > typeData[type].bestScore) typeData[type].bestScore = percent;
    // Monthly breakdown per type
    const compDateType = new Date(session.completedAt || session.endTime);
    const monthKeyType = compDateType.toLocaleString("default", { month: "short", year: "numeric" });
    if (!typeData[type].monthly[monthKeyType]) {
      typeData[type].monthly[monthKeyType] = { sumPercent: 0, count: 0 };
    }
    typeData[type].monthly[monthKeyType].sumPercent += percent;
    typeData[type].monthly[monthKeyType].count += 1;
  });

  const averageScore = totalTestsTaken > 0 ? totalScorePercent / totalTestsTaken : 0;
  
  // Keep only the 5 most recent
  const cappedRecentTests = recentTestResults.slice(0, 5);

  const totalSeconds = Math.floor(totalTimeMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  // Convert monthlyData to array (Already in chronological order because sessions is sorted by completedAt ASC)
  const monthlyScoreTrend = Object.keys(monthlyData).map((month) => ({
    month,
    avgScore: Math.round((monthlyData[month].sumPercent / monthlyData[month].count) * 10) / 10,
  }));

  // Convert subjectData to array
  const categoryPerformance = Object.keys(subjectData).map((subject) => ({
    subject,
    avgAccuracy: Math.round(subjectData[subject].sumAccuracy / subjectData[subject].count),
  }));

  // Build testTypeStats array — one entry per applicableFor type the student has attempted
  const testTypeStats = Object.keys(typeData).map((type) => {
    const t = typeData[type];
    const avgScore = t.count > 0 ? Math.round((t.sumPercent / t.count) * 10) / 10 : 0;
    const monthlyTrend = Object.keys(t.monthly).map((month) => ({
      month,
      avgScore: Math.round((t.monthly[month].sumPercent / t.monthly[month].count) * 10) / 10,
      count: t.monthly[month].count, // number of tests of this type done in that month
    }));
    return {
      type,                                                      // e.g. "olympiad", "test", "tournament"
      totalTests: t.count,                                       // how many tests of this type attended
      totalDurationMinutes: t.totalDurationMinutes,              // total duration of all those tests
      avgScore,                                                  // average score % across all attempts
      bestScore: Math.round(t.bestScore * 10) / 10,             // best score % for this type
      monthlyTrend,                                             // monthly avg score for this type
    };
  });

  // --- Fetch Upcoming Events ---
  const now = new Date();
  const [upcomingOlympiad, upcomingTournament, upcomingWorkshop] = await Promise.all([
    Olympiad.findOne({ isPublished: true, startTime: { $gt: now }, registrationEndTime: { $gte: now } }).sort({ startTime: 1 }).lean(),
    Tournament.findOne({ isPublished: true, "stages.startTime": { $gt: now }, registrationEndTime: { $gte: now } }).sort({ "stages.startTime": 1 }).lean(),
    Workshop.findOne({ isPublished: true, startTime: { $gt: now }, registrationEndTime: { $gte: now } }).sort({ startTime: 1 }).lean(),
  ]);

  const formatEventDate = (d) => {
    if (!d) return "";
    return new Date(d).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  const upcomingEvents = [
    upcomingOlympiad
      ? {
          id: upcomingOlympiad._id.toString(),
          title: upcomingOlympiad.title,
          type: "Olympiad",
          date: formatEventDate(upcomingOlympiad.startTime),
        }
      : null,
    upcomingTournament
      ? {
          id: upcomingTournament._id.toString(),
          title: upcomingTournament.title,
          type: "Tournament",
          date: formatEventDate(
            upcomingTournament.stages?.find((s) => new Date(s.startTime) > now)?.startTime || new Date()
          ),
        }
      : null,
    upcomingWorkshop
      ? {
          id: upcomingWorkshop._id.toString(),
          title: upcomingWorkshop.title,
          type: "Workshop",
          date: formatEventDate(upcomingWorkshop.startTime),
        }
      : null,
  ].filter(Boolean);

  return {
    totalTestsTaken,
    averageScore: Math.round(averageScore * 10) / 10,
    bestScore: Math.round(bestScorePercent * 10) / 10,
    totalTimeLearning: {
      hours,
      minutes,
      totalMinutes: Math.floor(totalTimeMs / 60000),
    },
    recentTestResults: cappedRecentTests,
    allTestResults: recentTestResults, // Used for frontend pagination
    monthlyScoreTrend,
    categoryPerformance,
    testTypeStats,  // 🆕 per-type breakdown: count, duration, avgScore, bestScore, monthlyTrend
    upcomingEvents,
  };
};

export default { getStudentDashboardStats };
