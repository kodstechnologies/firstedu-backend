import ExamSession from "../models/ExamSession.js";

export const getStudentDashboardStats = async (studentId) => {
  const sessions = await ExamSession.find({
    student: studentId,
    status: "completed",
  })
    .populate({ path: "test", select: "title durationMinutes questionBank", populate: { path: "questionBank", select: "name" } })
    .sort({ completedAt: 1 }) // Chronological order (oldest first)
    .lean();

  const totalTestsTaken = sessions.length;
  let totalTimeMs = 0;
  let totalScorePercent = 0;
  let bestScorePercent = 0;

  const monthlyData = {};
  const subjectData = {};

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
  };
};

export default { getStudentDashboardStats };
