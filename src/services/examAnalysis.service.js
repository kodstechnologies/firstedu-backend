import { ApiError } from "../utils/ApiError.js";
import examSessionRepository from "../repository/examSession.repository.js";
import olympiadRepository from "../repository/olympiad.repository.js";
import tournamentRepository from "../repository/tournament.repository.js";
import hallOfFameRepository from "../repository/hallOfFame.repository.js";
import hallOfFameService from "./hallOfFame.service.js";

/**
 * Calculate detailed performance analysis by topic and subject
 * This breaks down performance even for single-subject exams by sub-topics
 */
export const calculateDetailedAnalysis = async (sessionId) => {
  const session = await examSessionRepository.findById(sessionId, {
    test: "title",
    answers: {
      select: "subject topic marks correctAnswer options negativeMarks",
    },
  });

  if (!session) {
    throw new ApiError(404, "Exam session not found");
  }

  if (session.status !== "completed") {
    throw new ApiError(400, "Exam session is not completed yet");
  }

  // Create maps for analysis (questions come from populated answer.questionId)
  const topicMap = new Map(); // key: "subject|topic"
  const subjectMap = new Map(); // key: "subject"

  // Process each answer
  for (const answerEntry of session.answers) {
    const question = answerEntry.questionId;
    if (!question) continue;

    const subject = question.subject || "Unknown";
    const topic = question.topic || "Unknown";
    const topicKey = `${subject}|${topic}`;
    const marks = question.marks || 0;

    // Check if answer is correct
    let isCorrect = false;
    if (answerEntry.status === "answered" && answerEntry.answer !== null) {
      isCorrect = checkAnswerCorrectness(
        question,
        answerEntry.answer
      );
    }

    // Update topic analysis
    if (!topicMap.has(topicKey)) {
      topicMap.set(topicKey, {
        topic,
        subject,
        totalQuestions: 0,
        correctAnswers: 0,
        wrongAnswers: 0,
        skippedAnswers: 0,
        marksObtained: 0,
        maxMarks: 0,
      });
    }

    const topicData = topicMap.get(topicKey);
    topicData.totalQuestions++;
    topicData.maxMarks += marks;

    if (answerEntry.status === "answered") {
      if (isCorrect) {
        topicData.correctAnswers++;
        topicData.marksObtained += marks;
      } else {
        topicData.wrongAnswers++;
        // Apply negative marking if applicable
        const negativeMarks = question.negativeMarks || 0;
        topicData.marksObtained -= negativeMarks;
      }
    } else if (answerEntry.status === "skipped") {
      topicData.skippedAnswers++;
    }

    // Update subject analysis
    if (!subjectMap.has(subject)) {
      subjectMap.set(subject, {
        subject,
        totalQuestions: 0,
        correctAnswers: 0,
        wrongAnswers: 0,
        skippedAnswers: 0,
        marksObtained: 0,
        maxMarks: 0,
        topics: new Map(),
      });
    }

    const subjectData = subjectMap.get(subject);
    subjectData.totalQuestions++;
    subjectData.maxMarks += marks;

    if (answerEntry.status === "answered") {
      if (isCorrect) {
        subjectData.correctAnswers++;
        subjectData.marksObtained += marks;
      } else {
        subjectData.wrongAnswers++;
        const negativeMarks = question.negativeMarks || 0;
        subjectData.marksObtained -= negativeMarks;
      }
    } else if (answerEntry.status === "skipped") {
      subjectData.skippedAnswers++;
    }

    // Update topic within subject
    if (!subjectData.topics.has(topic)) {
      subjectData.topics.set(topic, {
        topic,
        totalQuestions: 0,
        correctAnswers: 0,
        wrongAnswers: 0,
        skippedAnswers: 0,
        marksObtained: 0,
        maxMarks: 0,
      });
    }

    const subjectTopicData = subjectData.topics.get(topic);
    subjectTopicData.totalQuestions++;
    subjectTopicData.maxMarks += marks;

    if (answerEntry.status === "answered") {
      if (isCorrect) {
        subjectTopicData.correctAnswers++;
        subjectTopicData.marksObtained += marks;
      } else {
        subjectTopicData.wrongAnswers++;
        const negativeMarks = question.negativeMarks || 0;
        subjectTopicData.marksObtained -= negativeMarks;
      }
    } else if (answerEntry.status === "skipped") {
      subjectTopicData.skippedAnswers++;
    }
  }

  // Calculate accuracy and convert maps to arrays
  const topicAnalysis = Array.from(topicMap.values()).map((data) => ({
    ...data,
    accuracy:
      data.totalQuestions > 0
        ? Math.round((data.correctAnswers / data.totalQuestions) * 100 * 100) / 100
        : 0,
  }));

  const subjectAnalysis = Array.from(subjectMap.values()).map((subjectData) => {
    const topics = Array.from(subjectData.topics.values()).map((topicData) => ({
      ...topicData,
      accuracy:
        topicData.totalQuestions > 0
          ? Math.round((topicData.correctAnswers / topicData.totalQuestions) * 100 * 100) / 100
          : 0,
    }));

    return {
      subject: subjectData.subject,
      totalQuestions: subjectData.totalQuestions,
      correctAnswers: subjectData.correctAnswers,
      wrongAnswers: subjectData.wrongAnswers,
      skippedAnswers: subjectData.skippedAnswers,
      marksObtained: subjectData.marksObtained,
      maxMarks: subjectData.maxMarks,
      accuracy:
        subjectData.totalQuestions > 0
          ? Math.round((subjectData.correctAnswers / subjectData.totalQuestions) * 100 * 100) / 100
          : 0,
      topics: topics.sort((a, b) => b.accuracy - a.accuracy), // Sort by accuracy descending
    };
  });

  // Update session with analysis
  session.topicAnalysis = topicAnalysis;
  session.subjectAnalysis = subjectAnalysis;
  await examSessionRepository.save(session);

  // Automatically update Hall of Fame if this test is part of an event
  try {
    await updateHallOfFameForTest(session.test._id);
  } catch (error) {
    // Don't fail the analysis if Hall of Fame update fails
    console.error("Error updating Hall of Fame:", error.message);
  }

  return {
    overall: {
      score: session.score,
      maxScore: session.maxScore,
      correctCount: session.correctCount,
      wrongCount: session.wrongCount,
      skippedCount: session.skippedCount,
      percentile: session.percentile,
    },
    subjectAnalysis: subjectAnalysis.sort((a, b) => b.accuracy - a.accuracy),
    topicAnalysis: topicAnalysis.sort((a, b) => b.accuracy - a.accuracy),
  };
};

/**
 * Automatically update Hall of Fame when exam scores are calculated
 * This checks if the test belongs to an Olympiad/Tournament/Challenge
 * and updates the Hall of Fame accordingly
 */
const updateHallOfFameForTest = async (testId) => {
  const now = new Date();

  // Check if test belongs to an Olympiad
  const olympiad = await olympiadRepository.findOne({ test: testId, isPublished: true });
  if (olympiad && new Date(olympiad.endTime) <= now) {
    const existing = await hallOfFameRepository.findOne({
      eventType: "olympiad",
      eventId: olympiad._id,
    });

    try {
      await hallOfFameService.autoGenerateHallOfFame("olympiad", olympiad._id, 3);
    } catch (error) {
      // If generation fails (e.g., no participants yet), ignore silently
      // The autoGenerateHallOfFame function handles both create and update
    }
    return;
  }

  // Check if test belongs to a Tournament stage
  const tournament = await tournamentRepository.findOne({
    "stages.test": testId,
    isPublished: true,
  });
  if (tournament) {
    // Find which stage this test belongs to
    const stage = tournament.stages.find(
      (s) => s.test.toString() === testId.toString()
    );
    if (stage && new Date(stage.endTime) <= now) {
      // Only update Hall of Fame for final stage
      const finalStage = tournament.stages[tournament.stages.length - 1];
      if (stage._id.toString() === finalStage._id.toString()) {
      const existing = await hallOfFameRepository.findOne({
        eventType: "tournament",
        eventId: tournament._id,
      });

        try {
          await hallOfFameService.autoGenerateHallOfFame("tournament", tournament._id, 3);
        } catch (error) {
          // If generation fails (e.g., no participants yet), ignore silently
          // The autoGenerateHallOfFame function handles both create and update
        }
      }
    }
    return;
  }

};


/**
 * Helper function to check if answer is correct
 */
const checkAnswerCorrectness = (question, studentAnswer) => {
  if (!question || studentAnswer === null || studentAnswer === undefined) {
    return false;
  }

  const correctAnswer = question.correctAnswer;

  switch (question.questionType) {
    case "single":
      return String(studentAnswer).trim() === String(correctAnswer).trim();

    case "multiple":
      if (!Array.isArray(studentAnswer) || !Array.isArray(correctAnswer)) {
        return false;
      }
      const studentSet = new Set(
        studentAnswer.map((a) => String(a).trim())
      );
      const correctSet = new Set(
        correctAnswer.map((a) => String(a).trim())
      );
      return (
        studentSet.size === correctSet.size &&
        Array.from(studentSet).every((val) => correctSet.has(val))
      );

    case "true_false":
      return Boolean(studentAnswer) === Boolean(correctAnswer);

    default:
      return false;
  }
};

/**
 * Get detailed analysis for a completed exam session
 */
export const getDetailedAnalysis = async (sessionId, studentId) => {
  const session = await examSessionRepository.findOne(
    {
      _id: sessionId,
      student: studentId,
      status: "completed",
    },
    {
      test: { path: "test", select: "title description" },
      student: { path: "student", select: "name email" },
    }
  );

  if (!session) {
    throw new ApiError(404, "Exam session not found or not completed");
  }

  // If analysis already exists, return it
  if (session.topicAnalysis && session.topicAnalysis.length > 0) {
    return {
      session: {
        id: session._id,
        test: session.test,
        student: session.student,
        startTime: session.startTime,
        endTime: session.endTime,
        completedAt: session.completedAt,
      },
      overall: {
        score: session.score,
        maxScore: session.maxScore,
        correctCount: session.correctCount,
        wrongCount: session.wrongCount,
        skippedCount: session.skippedCount,
        percentile: session.percentile,
      },
      subjectAnalysis: session.subjectAnalysis,
      topicAnalysis: session.topicAnalysis,
    };
  }

  // Calculate if not exists
  return await calculateDetailedAnalysis(sessionId);
};

export default {
  calculateDetailedAnalysis,
  getDetailedAnalysis,
};

