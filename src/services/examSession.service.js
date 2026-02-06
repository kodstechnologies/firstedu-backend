import { ApiError } from "../utils/ApiError.js";
import examSessionRepository from "../repository/examSession.repository.js";
import orderRepository from "../repository/order.repository.js";
import testRepository from "../repository/test.repository.js";
import examAnalysisService from "./examAnalysis.service.js";
import pointsService from "./points.service.js";

/**
 * Start a new exam session
 */
export const startExamSession = async (testId, studentId) => {
  // Check if test exists and is published
  const test = await examSessionRepository.findTestById(testId, { questions: "" });
  if (!test) {
    throw new ApiError(404, "Test not found");
  }

  if (!test.isPublished) {
    throw new ApiError(403, "Test is not published");
  }

  // Check if student has purchased the test (if test is paid): direct purchase OR bundle purchase
  if (test.price > 0) {
    let purchase = await orderRepository.findTestPurchase({
      student: studentId,
      test: testId,
      paymentStatus: "completed",
    });
    if (!purchase) {
      const bundleIdsContainingTest =
        await testRepository.findBundleIdsContainingTest(testId);
      if (bundleIdsContainingTest.length > 0) {
        purchase = await orderRepository.findTestPurchase({
          student: studentId,
          testBundle: { $in: bundleIdsContainingTest },
          paymentStatus: "completed",
        });
      }
    }
    if (!purchase) {
      throw new ApiError(403, "You need to purchase this test first");
    }
  }

  // Check if there's an existing active session
  const existingSession = await examSessionRepository.findOne({
    student: studentId,
    test: testId,
    status: "in_progress",
  });

  if (existingSession) {
    // Return existing session
    return await getExamSession(existingSession._id, studentId);
  }

  // Check if there's a completed session (prevent retaking)
  const completedSession = await examSessionRepository.findOne({
    student: studentId,
    test: testId,
    status: "completed",
  });

  if (completedSession) {
    throw new ApiError(400, "You have already completed this test");
  }

  // Create new exam session
  const now = new Date();
  const durationMs = test.durationMinutes * 60 * 1000;
  const endTime = new Date(now.getTime() + durationMs);

  // Initialize answers array for all questions
  const answers = test.questions.map((question) => ({
    questionId: question._id,
    answer: null,
    status: "not_visited",
    answeredAt: null,
  }));

  const session = await examSessionRepository.create({
    student: studentId,
    test: testId,
    startTime: now,
    endTime: endTime,
    status: "in_progress",
    answers: answers,
    proctoringEvents: [],
    maxScore: test.totalMarks,
  });

  return await getExamSession(session._id, studentId);
};

/**
 * Get exam session with questions (without correct answers)
 */
export const getExamSession = async (sessionId, studentId) => {
  const session = await examSessionRepository.findOne(
    {
      _id: sessionId,
      student: studentId,
    },
    {
      test: "title description durationMinutes totalMarks proctoringInstructions",
      answers: {
        select: "questionText questionType options subject topic marks negativeMarks isParent passage parentQuestionId childQuestions",
        populate: {
          path: "childQuestions",
          select: "questionText questionType options marks negativeMarks",
        },
      },
    }
  );

  if (!session) {
    throw new ApiError(404, "Exam session not found");
  }

  // Check if session has expired and auto-submit if needed
  const now = new Date();
  if (session.status === "in_progress" && new Date(session.endTime) < now) {
    // Auto-submit expired session
    try {
      await autoSubmitExam(session._id, studentId, "time_expired");
      // Reload session after auto-submission
      session = await examSessionRepository.findOne(
        {
          _id: sessionId,
          student: studentId,
        },
        {
          test: "title description durationMinutes totalMarks proctoringInstructions",
          answers: {
            select: "questionText questionType options subject topic marks negativeMarks isParent passage parentQuestionId childQuestions",
            populate: {
              path: "childQuestions",
              select: "questionText questionType options marks negativeMarks",
            },
          },
        }
      );
    } catch (error) {
      console.error("Error auto-submitting expired session:", error);
      // Fallback: just mark as expired
      session.status = "expired";
      await examSessionRepository.save(session);
    }
  }

  // Calculate remaining time
  const remainingTime = Math.max(0, new Date(session.endTime).getTime() - now.getTime());

  // Remove correct answers from questions (for security)
  const questions = session.answers.map((answer) => {
    const question = answer.questionId;
    if (!question) return null;

    // For connected questions, also remove correct answers from child questions
    if (question.isParent && question.childQuestions) {
      question.childQuestions = question.childQuestions.map((child) => {
        const childObj = child.toObject ? child.toObject() : child;
        delete childObj.correctAnswer;
        return childObj;
      });
    }

    const questionObj = question.toObject ? question.toObject() : question;
    delete questionObj.correctAnswer;

    return {
      questionId: questionObj._id,
      question: questionObj,
      answer: answer.answer,
      status: answer.status,
      answeredAt: answer.answeredAt,
    };
  }).filter((q) => q !== null);

  // Build palette (navigation grid)
  const palette = {
    answered: session.answers.filter((a) => a.status === "answered").length,
    skipped: session.answers.filter((a) => a.status === "skipped").length,
    markedForReview: session.answers.filter((a) => a.status === "marked_for_review").length,
    notVisited: session.answers.filter((a) => a.status === "not_visited").length,
    total: session.answers.length,
  };

  return {
    session: {
      id: session._id,
      test: session.test,
      startTime: session.startTime,
      endTime: session.endTime,
      status: session.status,
      remainingTime, // in milliseconds
      remainingTimeFormatted: formatTime(remainingTime),
    },
    questions,
    palette,
  };
};

/**
 * Save answer for a question
 */
export const saveAnswer = async (sessionId, questionId, answer, studentId, status = "answered") => {
  const session = await examSessionRepository.findOne({
    _id: sessionId,
    student: studentId,
    status: "in_progress",
  });

  if (!session) {
    throw new ApiError(404, "Exam session not found or already completed");
  }

  // Check if session has expired
  const now = new Date();
  if (new Date(session.endTime) < now) {
    session.status = "expired";
    await examSessionRepository.save(session);
    throw new ApiError(400, "Exam session has expired");
  }

  // Find the answer entry
  const answerEntry = session.answers.find(
    (a) => a.questionId.toString() === questionId.toString()
  );

  if (!answerEntry) {
    throw new ApiError(404, "Question not found in this exam session");
  }

  // Update answer
  answerEntry.answer = answer;
  answerEntry.status = status;
  if (status === "answered") {
    answerEntry.answeredAt = now;
  }

  await examSessionRepository.save(session);

  return await getExamSession(sessionId, studentId);
};

/**
 * Mark question for review
 */
export const markForReview = async (sessionId, questionId, studentId) => {
  const session = await examSessionRepository.findOne({
    _id: sessionId,
    student: studentId,
    status: "in_progress",
  });

  if (!session) {
    throw new ApiError(404, "Exam session not found or already completed");
  }

  const answerEntry = session.answers.find(
    (a) => a.questionId.toString() === questionId.toString()
  );

  if (!answerEntry) {
    throw new ApiError(404, "Question not found in this exam session");
  }

  answerEntry.status = "marked_for_review";
  await examSessionRepository.save(session);

  return await getExamSession(sessionId, studentId);
};

/**
 * Skip question
 */
export const skipQuestion = async (sessionId, questionId, studentId) => {
  return await saveAnswer(sessionId, questionId, null, studentId, "skipped");
};

/**
 * Auto-submit exam (internal function for time expiration or proctoring violations)
 */
const autoSubmitExam = async (sessionId, studentId, reason = "time_expired") => {
  const session = await examSessionRepository.findOne({
    _id: sessionId,
    student: studentId,
  });

  if (!session) {
    console.error(`Exam session ${sessionId} not found for auto-submission`);
    return;
  }

  if (session.status === "completed") {
    console.log(`Exam session ${sessionId} already completed, skipping auto-submission`);
    return;
  }

  // Mark as completed
  session.status = "completed";
  session.completedAt = new Date();

  // Add auto-submission reason to metadata if needed
  if (reason) {
    session.autoSubmitted = true;
    session.autoSubmitReason = reason;
  }

  // Calculate score
  await calculateScore(session);

  await examSessionRepository.save(session);

  // Calculate detailed analysis
  try {
    await examAnalysisService.calculateDetailedAnalysis(sessionId);
  } catch (error) {
    console.error("Error calculating detailed analysis:", error);
    // Don't fail submission if analysis fails
  }

  // Award points for test completion
  try {
    const test = await examSessionRepository.findTestById(session.test);
    if (test) {
      await pointsService.awardTestCompletionPoints(
        studentId,
        session.test,
        test.title || "Test"
      );
    }
  } catch (error) {
    console.error("Error awarding points for test completion:", error);
    // Don't fail submission if points awarding fails
  }

  console.log(`Exam session ${sessionId} auto-submitted successfully. Reason: ${reason}`);
};

/**
 * Log proctoring event
 */
export const logProctoringEvent = async (sessionId, eventType, metadata, studentId) => {
  const session = await examSessionRepository.findOne({
    _id: sessionId,
    student: studentId,
    status: "in_progress",
  });

  if (!session) {
    throw new ApiError(404, "Exam session not found or already completed");
  }

  const validEventTypes = ["window_blur", "tab_switch", "fullscreen_exit", "visibility_change"];
  if (!validEventTypes.includes(eventType)) {
    throw new ApiError(400, "Invalid proctoring event type");
  }

  session.proctoringEvents.push({
    type: eventType,
    timestamp: new Date(),
    metadata: metadata || {},
  });

  await examSessionRepository.save(session);

  // Auto-submit if proctoring violation detected
  // Check if violation threshold is exceeded (e.g., more than 3 violations)
  const violationCount = session.proctoringEvents.length;
  const VIOLATION_THRESHOLD = 3; // Configurable threshold

  if (violationCount >= VIOLATION_THRESHOLD) {
    console.log(`Auto-submitting exam session ${sessionId} due to proctoring violations (${violationCount} violations)`);
    try {
      await autoSubmitExam(sessionId, studentId, "proctoring_violation");
      return { 
        success: true, 
        message: "Proctoring event logged. Exam auto-submitted due to proctoring violations.",
        autoSubmitted: true 
      };
    } catch (error) {
      console.error("Error auto-submitting exam due to proctoring violation:", error);
      // Continue even if auto-submit fails
    }
  }

  return { success: true, message: "Proctoring event logged", autoSubmitted: false };
};

/**
 * Submit exam
 */
export const submitExam = async (sessionId, studentId) => {
  const session = await examSessionRepository.findOne({
    _id: sessionId,
    student: studentId,
  });

  if (!session) {
    throw new ApiError(404, "Exam session not found");
  }

  if (session.status === "completed") {
    throw new ApiError(400, "Exam has already been submitted");
  }

  if (session.status === "expired") {
    throw new ApiError(400, "Exam session has expired");
  }

  // Mark as completed
  session.status = "completed";
  session.completedAt = new Date();

  // Calculate score
  await calculateScore(session);

  await examSessionRepository.save(session);

  // Calculate detailed analysis
  try {
    await examAnalysisService.calculateDetailedAnalysis(sessionId);
  } catch (error) {
    console.error("Error calculating detailed analysis:", error);
    // Don't fail submission if analysis fails
  }

  // Award points for test completion
  try {
    const test = await examSessionRepository.findTestById(session.test);
    if (test) {
      await pointsService.awardTestCompletionPoints(
        studentId,
        session.test,
        test.title || "Test"
      );
    }
  } catch (error) {
    console.error("Error awarding points for test completion:", error);
    // Don't fail submission if points awarding fails
  }

  return await getExamResults(sessionId, studentId);
};

/**
 * Auto-submit expired exam sessions (called by cron job)
 */
export const autoSubmitExpiredSessions = async () => {
  try {
    const expiredSessions = await examSessionRepository.findExpiredInProgressSessions();
    
    if (expiredSessions.length === 0) {
      return { processed: 0, message: "No expired sessions found" };
    }

    console.log(`Found ${expiredSessions.length} expired exam session(s) to auto-submit`);

    const results = await Promise.allSettled(
      expiredSessions.map(async (session) => {
        try {
          await autoSubmitExam(session._id, session.student, "time_expired");
          return { 
            sessionId: session._id.toString(), 
            studentId: session.student.toString(),
            success: true 
          };
        } catch (error) {
          console.error(`Error auto-submitting session ${session._id}:`, error);
          return { 
            sessionId: session._id.toString(), 
            success: false, 
            error: error.message 
          };
        }
      })
    );

    const successful = results.filter((r) => r.status === "fulfilled" && r.value.success).length;
    const failed = results.length - successful;
    const autoSubmittedSessions = results
      .filter((r) => r.status === "fulfilled" && r.value.success)
      .map((r) => r.value);

    return {
      processed: expiredSessions.length,
      successful,
      failed,
      autoSubmittedSessions, // Array of { sessionId, studentId }
      message: `Auto-submitted ${successful} expired session(s), ${failed} failed`,
    };
  } catch (error) {
    console.error("Error in autoSubmitExpiredSessions:", error);
    throw error;
  }
};

/**
 * Calculate score for exam session
 */
const calculateScore = async (session) => {
  const test = await examSessionRepository.findTestById(session.test, { questions: "" });
  if (!test) return;

  let totalScore = 0;
  let correctCount = 0;
  let wrongCount = 0;
  let skippedCount = 0;

  for (const answerEntry of session.answers) {
    const question = test.questions.find(
      (q) => q._id.toString() === answerEntry.questionId.toString()
    );

    if (!question) continue;

    if (answerEntry.status === "skipped" || answerEntry.answer === null) {
      skippedCount++;
      continue;
    }

    // Check if answer is correct
    const isCorrect = checkAnswerCorrectness(question, answerEntry.answer);

    if (isCorrect) {
      totalScore += question.marks || 0;
      correctCount++;
    } else {
      totalScore -= question.negativeMarks || 0;
      wrongCount++;
    }
  }

  // Ensure score doesn't go negative
  totalScore = Math.max(0, totalScore);

  session.score = totalScore;
  session.correctCount = correctCount;
  session.wrongCount = wrongCount;
  session.skippedCount = skippedCount;
  session.maxScore = test.totalMarks;

  // Calculate percentile
  await calculatePercentile(session);
  
  // Save session with updated score
  await examSessionRepository.save(session);
};

/**
 * Check if answer is correct
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
      const studentSet = new Set(studentAnswer.map((a) => String(a).trim()));
      const correctSet = new Set(correctAnswer.map((a) => String(a).trim()));
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
 * Get exam results (with correct answers and explanations)
 */
export const getExamResults = async (sessionId, studentId) => {
  const session = await examSessionRepository.findOne(
    {
      _id: sessionId,
      student: studentId,
      status: "completed",
    },
    {
      test: "title description durationMinutes totalMarks",
      answers: {
        select: "questionText questionType options correctAnswer explanation subject topic marks negativeMarks isParent passage parentQuestionId childQuestions",
        populate: {
          path: "childQuestions",
          select: "questionText questionType options correctAnswer explanation marks negativeMarks",
        },
      },
    }
  );

  if (!session) {
    throw new ApiError(404, "Exam session not found or not completed");
  }

  // Build results with correct answers and explanations
  const questions = session.answers.map((answer) => {
    const question = answer.questionId;
    if (!question) return null;

    // For connected questions, include child questions with answers
    let childQuestions = null;
    if (question.isParent && question.childQuestions) {
      childQuestions = question.childQuestions.map((child) => {
        const childObj = child.toObject ? child.toObject() : child;
        return {
          _id: childObj._id,
          questionText: childObj.questionText,
          questionType: childObj.questionType,
          options: childObj.options,
          correctAnswer: childObj.correctAnswer,
          explanation: childObj.explanation,
          marks: childObj.marks,
        };
      });
    }

    const questionObj = question.toObject ? question.toObject() : question;
    const isCorrect = checkAnswerCorrectness(question, answer.answer);

    return {
      questionId: questionObj._id,
      question: {
        ...questionObj,
        childQuestions,
      },
      studentAnswer: answer.answer,
      correctAnswer: questionObj.correctAnswer,
      isCorrect,
      explanation: questionObj.explanation,
      marks: questionObj.marks || 0,
      negativeMarks: questionObj.negativeMarks || 0,
      status: answer.status,
      answeredAt: answer.answeredAt,
    };
  }).filter((q) => q !== null);

  return {
    session: {
      id: session._id,
      test: session.test,
      startTime: session.startTime,
      endTime: session.endTime,
      completedAt: session.completedAt,
      status: session.status,
    },
    results: {
      score: session.score,
      maxScore: session.maxScore,
      correctCount: session.correctCount,
      wrongCount: session.wrongCount,
      skippedCount: session.skippedCount,
      percentile: session.percentile,
      percentage: session.maxScore > 0 
        ? Math.round((session.score / session.maxScore) * 100 * 100) / 100 
        : 0,
    },
    questions,
  };
};

/**
 * Get question palette (navigation grid)
 */
export const getQuestionPalette = async (sessionId, studentId) => {
  const session = await examSessionRepository.findOne(
    {
      _id: sessionId,
      student: studentId,
    },
    {
      answers: {
        select: "_id questionText",
      },
    }
  );

  if (!session) {
    throw new ApiError(404, "Exam session not found");
  }

  const palette = session.answers.map((answer, index) => ({
    questionNumber: index + 1,
    questionId: answer.questionId._id,
    status: answer.status,
    hasAnswer: answer.answer !== null && answer.answer !== undefined,
  }));

  const summary = {
    answered: session.answers.filter((a) => a.status === "answered").length,
    skipped: session.answers.filter((a) => a.status === "skipped").length,
    markedForReview: session.answers.filter((a) => a.status === "marked_for_review").length,
    notVisited: session.answers.filter((a) => a.status === "not_visited").length,
    total: session.answers.length,
  };

  return {
    palette,
    summary,
  };
};

/**
 * Calculate percentile for the exam session
 */
const calculatePercentile = async (session) => {
  // Get all completed sessions for this test
  const allSessions = await examSessionRepository.findAllCompletedSessions(session.test);

  if (allSessions.length === 0) {
    session.percentile = 100; // First person to complete
    return;
  }

  // Count how many people scored less than this student
  const lowerScores = allSessions.filter(
    (s) => s.score < session.score
  ).length;

  // Calculate percentile: (number of people below / total people) * 100
  session.percentile = Math.round((lowerScores / allSessions.length) * 100 * 100) / 100;
};

/**
 * Format time in milliseconds to readable format
 */
const formatTime = (ms) => {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  }
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
};

export default {
  startExamSession,
  getExamSession,
  saveAnswer,
  markForReview,
  skipQuestion,
  logProctoringEvent,
  submitExam,
  getExamResults,
  getQuestionPalette,
  autoSubmitExpiredSessions,
};

