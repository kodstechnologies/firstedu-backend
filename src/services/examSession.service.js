import { ApiError } from "../utils/ApiError.js";
import examSessionRepository from "../repository/examSession.repository.js";
import orderRepository from "../repository/order.repository.js";
import testRepository from "../repository/test.repository.js";
import olympiadRepository from "../repository/olympiad.repository.js";
import tournamentRepository from "../repository/tournament.repository.js";
import eventRegistrationRepository from "../repository/eventRegistration.repository.js";
import questionBankRepository from "../repository/questionBank.repository.js";
import questionRepository from "../repository/question.repository.js";
import examAnalysisService from "./examAnalysis.service.js";
import pointsService from "./points.service.js";
import everydayChallengeService from "./everydayChallenge.service.js";
import everydayChallengeCompletionRepository from "../repository/everydayChallengeCompletion.repository.js";
import challengeYourselfService from "./challengeYourself.service.js";

const hasCompletedRegistrationForLinkedEventTest = async (testId, studentId) => {
  const [linkedOlympiads, linkedTournaments] = await Promise.all([
    olympiadRepository.find(
      { test: testId, isPublished: true },
      { limit: 1000 }
    ),
    tournamentRepository.find(
      { "stages.test": testId, isPublished: true },
      { limit: 1000 }
    ),
  ]);

  const olympiadIds = linkedOlympiads.map((o) => o?._id).filter(Boolean);
  const tournamentIds = linkedTournaments.map((t) => t?._id).filter(Boolean);

  if (olympiadIds.length > 0) {
    const olympiadRegistration = await eventRegistrationRepository.findOne({
      student: studentId,
      eventType: "olympiad",
      eventId: { $in: olympiadIds },
      paymentStatus: "completed",
    });
    if (olympiadRegistration) return true;
  }

  if (tournamentIds.length > 0) {
    const tournamentRegistration = await eventRegistrationRepository.findOne({
      student: studentId,
      eventType: "tournament",
      eventId: { $in: tournamentIds },
      paymentStatus: "completed",
    });
    if (tournamentRegistration) return true;
  }

  return false;
};

/**
 * Start a new exam session
 */
export const startExamSession = async (testId, studentId) => {
  // Check if test exists and is published
  const test = await examSessionRepository.findTestById(testId, { questionBank: "name" });
  if (!test) {
    throw new ApiError(404, "Test not found");
  }

  if (!test.isPublished) {
    throw new ApiError(403, "Test is not published");
  }

  if (!test.questionBank) {
    throw new ApiError(400, "Test has no question bank configured");
  }

  // Get all questions from the question bank
  const questions = await questionBankRepository.getQuestionsByBankId(test.questionBank._id);
  if (!questions || questions.length === 0) {
    throw new ApiError(400, "Question bank has no questions");
  }

  // Check if student can access paid test:
  // everyday challenge and challenge-yourself tests are always free; otherwise purchase or linked event.
  if (test.price > 0 && test.applicableFor !== "everyday_challenge" && test.applicableFor !== "challenge_yourself") {
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
      const hasLinkedEventAccess =
        await hasCompletedRegistrationForLinkedEventTest(testId, studentId);
      if (!hasLinkedEventAccess) {
        throw new ApiError(403, "You need to purchase this test first");
      }
    }
  }

  // Check if there's an existing in_progress session (resume without pause)
  const inProgressSession = await examSessionRepository.findOne({
    student: studentId,
    test: testId,
    status: "in_progress",
  });

  if (inProgressSession) {
    return await getExamSession(inProgressSession._id, studentId);
  }

  // Check if there's a paused session (resume from pause - timer was stopped)
  const pausedSession = await examSessionRepository.findOne({
    student: studentId,
    test: testId,
    status: "paused",
  });

  if (pausedSession) {
    const now = new Date();
    const remainingMs = pausedSession.remainingTimeAtPause ?? 0;
    const newEndTime = new Date(now.getTime() + remainingMs);

    pausedSession.status = "in_progress";
    pausedSession.endTime = newEndTime;
    pausedSession.pausedAt = null;
    pausedSession.remainingTimeAtPause = null;
    await examSessionRepository.save(pausedSession);

    return await getExamSession(pausedSession._id, studentId);
  }

  // Challenge-yourself layout: check level unlock and allow retakes (full marks required to unlock next; can retake anytime)
  const challengeSlot = await challengeYourselfService.getSlotForTest(testId);
  if (challengeSlot) {
    const unlocked = await challengeYourselfService.isLevelUnlocked(
      studentId,
      challengeSlot.stage,
      challengeSlot.level
    );
    if (!unlocked) {
      throw new ApiError(
        403,
        "This level is not unlocked yet. Score full marks on the previous level to unlock."
      );
    }
    // Allow retakes: no "already completed" block for challenge-yourself
  } else if (test.applicableFor === "everyday_challenge") {
    // Everyday challenge (not in challenge-yourself): one completion per day
    const today = everydayChallengeService.getStartOfDayUTC();
    const alreadyCompletedToday = await everydayChallengeCompletionRepository.findOne({
      student: studentId,
      date: today,
    });
    if (alreadyCompletedToday) {
      throw new ApiError(400, "You have already completed today's everyday challenge");
    }
  } else {
    // Non–everyday challenge: prevent retaking the same test
    const completedSession = await examSessionRepository.findOne({
      student: studentId,
      test: testId,
      status: "completed",
    });
    if (completedSession) {
      throw new ApiError(400, "You have already completed this test");
    }
  }

  // Create new exam session
  const now = new Date();
  const durationMs = test.durationMinutes * 60 * 1000;
  const endTime = new Date(now.getTime() + durationMs);

  // Initialize answers array for all questions from the bank
  const answers = questions.map((question) => ({
    questionId: question._id,
    answer: null,
    status: "not_visited",
    answeredAt: null,
  }));

  const maxScore = questions.reduce((sum, q) => sum + (q.marks || 0), 0);

  const session = await examSessionRepository.create({
    student: studentId,
    test: testId,
    startTime: now,
    endTime: endTime,
    status: "in_progress",
    answers: answers,
    proctoringEvents: [],
    maxScore,
  });

  return await getExamSession(session._id, studentId);
};

/**
 * Get exam session with questions (without correct answers)
 */
export const getExamSession = async (sessionId, studentId) => {
  let session = await examSessionRepository.findOne(
    {
      _id: sessionId,
      student: studentId,
    },
    {
      test: "title description durationMinutes proctoringInstructions",
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
          test: "title description durationMinutes proctoringInstructions",
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
      // Try to recover by re-reading latest persisted state first.
      // This avoids accidentally overwriting a successfully completed session.
      const latestSession = await examSessionRepository.findOne({
        _id: sessionId,
        student: studentId,
      });
      if (latestSession) {
        session = latestSession;
      } else {
        // Fallback only when session cannot be reloaded
        session.status = "expired";
        await examSessionRepository.save(session);
      }
    }
  }

  // Calculate remaining time (use stored value when paused)
  const remainingTime =
    session.status === "paused" && session.remainingTimeAtPause != null
      ? session.remainingTimeAtPause
      : Math.max(0, new Date(session.endTime).getTime() - now.getTime());

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
      maxScore: session.maxScore,
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

  // Award points: everyday challenge uses streak points; other tests use test completion points
  try {
    const test = await examSessionRepository.findTestById(session.test);
    if (test) {
      if (test.applicableFor === "everyday_challenge") {
        await everydayChallengeService.recordCompletion(studentId, session);
      } else {
        await pointsService.awardTestCompletionPoints(
          studentId,
          session.test,
          test.title || "Test"
        );
      }
    }
  } catch (error) {
    console.error("Error awarding points for test completion:", error);
  }
  try {
    await challengeYourselfService.recordProgress(studentId, session);
  } catch (error) {
    console.error("Error recording challenge-yourself progress:", error);
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
 * Pause exam session (stops the timer; call start-exam to resume)
 */
export const pauseExamSession = async (sessionId, studentId) => {
  const session = await examSessionRepository.findOne({
    _id: sessionId,
    student: studentId,
    status: "in_progress",
  });

  if (!session) {
    throw new ApiError(404, "Exam session not found or not in progress");
  }

  const now = new Date();
  const remainingMs = Math.max(0, new Date(session.endTime).getTime() - now.getTime());

  session.status = "paused";
  session.pausedAt = now;
  session.remainingTimeAtPause = remainingMs;
  await examSessionRepository.save(session);

  return {
    success: true,
    message: "Exam paused successfully. Call start-exam to resume.",
    remainingTimeAtPause: remainingMs,
  };
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

  // Award points: everyday challenge uses streak points; other tests use test completion points
  try {
    const test = await examSessionRepository.findTestById(session.test);
    if (test) {
      if (test.applicableFor === "everyday_challenge") {
        await everydayChallengeService.recordCompletion(studentId, session);
      } else {
        await pointsService.awardTestCompletionPoints(
          studentId,
          session.test,
          test.title || "Test"
        );
      }
    }
  } catch (error) {
    console.error("Error awarding points for test completion:", error);
  }
  try {
    await challengeYourselfService.recordProgress(studentId, session);
  } catch (error) {
    console.error("Error recording challenge-yourself progress:", error);
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
  const questionIds = session.answers.map((a) => a.questionId);
  const questions = await questionRepository.findByIds(questionIds);
  const questionMap = new Map(questions.map((q) => [q._id.toString(), q]));

  let totalScore = 0;
  let correctCount = 0;
  let wrongCount = 0;
  let skippedCount = 0;

  for (const answerEntry of session.answers) {
    const question = questionMap.get(answerEntry.questionId.toString());
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
  // maxScore already stored when session was created

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
  const populateOptions = {
    test: "title description durationMinutes",
    answers: {
      select: "questionText questionType options correctAnswer explanation subject topic marks negativeMarks isParent passage parentQuestionId childQuestions",
      populate: {
        path: "childQuestions",
        select: "questionText questionType options correctAnswer explanation marks negativeMarks",
      },
    },
  };

  let session = await examSessionRepository.findOne(
    {
      _id: sessionId,
      student: studentId,
    },
    populateOptions
  );

  if (!session) {
    throw new ApiError(404, "Exam session not found");
  }

  // If time has expired but session is not completed yet, auto-submit on-demand
  const now = new Date();
  const isOverTime = new Date(session.endTime) < now;
  if ((session.status === "in_progress" || session.status === "paused") && isOverTime) {
    try {
      await autoSubmitExam(sessionId, studentId, "time_expired");
      session = await examSessionRepository.findOne(
        {
          _id: sessionId,
          student: studentId,
        },
        populateOptions
      );
    } catch (error) {
      console.error("Error auto-submitting while fetching results:", error);
    }
  }

  if (!session || session.status !== "completed") {
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
  // Build percentile distribution by student best score (not by attempts).
  const allSessions = await examSessionRepository.findAllCompletedSessions(session.test);
  const bestScoreByStudent = new Map();

  for (const s of allSessions) {
    const studentId = s.student?.toString?.();
    if (!studentId) continue;
    const existing = bestScoreByStudent.get(studentId);
    const score = s.score ?? 0;
    if (existing === undefined || score > existing) {
      bestScoreByStudent.set(studentId, score);
    }
  }

  const currentStudentId = session.student?.toString?.();
  const currentScore = session.score ?? 0;
  if (currentStudentId) {
    const existing = bestScoreByStudent.get(currentStudentId);
    if (existing === undefined || currentScore > existing) {
      bestScoreByStudent.set(currentStudentId, currentScore);
    }
  }

  const bestScores = [...bestScoreByStudent.values()];
  if (bestScores.length === 0) {
    session.percentile = 100;
    return;
  }

  // Percentile rank = % students with best score <= current score.
  const atOrBelow = bestScores.filter((score) => score <= currentScore).length;
  session.percentile = Math.round((atOrBelow / bestScores.length) * 100 * 100) / 100;
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

/**
 * Get paused sessions for a student
 */
export const getInProgressSessions = async (studentId, page = 1, limit = 10) => {
  return await examSessionRepository.findAll(
    {
      student: studentId,
      status: "paused",
    },
    {
      page,
      limit,
      sortBy: "startTime",
      sortOrder: "desc",
    }
  );
};

export default {
  startExamSession,
  pauseExamSession,
  getExamSession,
  saveAnswer,
  markForReview,
  skipQuestion,
  logProctoringEvent,
  submitExam,
  getExamResults,
  getQuestionPalette,
  autoSubmitExpiredSessions,
  getInProgressSessions,
};
