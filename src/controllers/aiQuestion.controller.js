import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import aiQuestionValidator from '../validation/aiQuestion.validator.js';
import aiQuestionService from '../services/aiQuestion.service.js';
import questionService from '../services/question.service.js';

/**
 * Generate questions using AI
 * @route POST /api/admin/generate-questions
 * @access Admin/Teacher
 */
export const generateQuestions = asyncHandler(async (req, res) => {
    // Validate request body
    const { error, value } = aiQuestionValidator.generateQuestions.validate(req.body);

    if (error) {
        throw new ApiError(
            400,
            'Validation Error',
            error.details.map((x) => x.message)
        );
    }

    // Generate questions using AI
    const questions = await aiQuestionService.generateQuestionsWithAI(value);

    return res
        .status(200)
        .json(
            ApiResponse.success(
                { questions, count: questions.length },
                'Questions generated successfully. Review and save them.'
            )
        );
});

/**
 * Save AI-generated questions to database
 * @route POST /api/admin/save-generated-questions
 * @access Admin/Teacher
 */
export const saveGeneratedQuestions = asyncHandler(async (req, res) => {
    // Validate request body
    const { error, value } = aiQuestionValidator.saveGeneratedQuestions.validate(req.body);

    if (error) {
        throw new ApiError(
            400,
            'Validation Error',
            error.details.map((x) => x.message)
        );
    }

    const { questions, questionBankId } = value;
    const createdBy = req.user._id;

    // Transform questions to match Question model schema
    const questionsToSave = questions.map((q) => ({
        questionText: q.questionText,
        questionType: 'single', // AI generates single-choice MCQs
        options: [
            { text: q.optionA, isCorrect: q.answer === 'A' },
            { text: q.optionB, isCorrect: q.answer === 'B' },
            { text: q.optionC, isCorrect: q.answer === 'C' },
            { text: q.optionD, isCorrect: q.answer === 'D' }
        ],
        correctAnswer: q.answer,
        explanation: q.explanation || '',
        subject: q.subject,
        subjectRef: q.subjectRef || null,
        topic: q.topic,
        difficulty: q.difficulty,
        marks: q.marks || 1,
        negativeMarks: q.negativeMarks || 0,
        questionBank: questionBankId || q.questionBank || null,
        createdBy,
        isActive: true
    }));

    // Save questions to database
    const savedQuestions = [];
    const errors = [];

    for (let i = 0; i < questionsToSave.length; i++) {
        try {
            const savedQuestion = await questionService.createQuestion(
                questionsToSave[i],
                createdBy
            );
            savedQuestions.push(savedQuestion);
        } catch (err) {
            errors.push({
                index: i,
                questionText: questionsToSave[i].questionText.substring(0, 50) + '...',
                error: err.message
            });
        }
    }

    // Return response with saved questions and any errors
    const response = {
        saved: savedQuestions,
        savedCount: savedQuestions.length,
        totalCount: questionsToSave.length,
        errors: errors.length > 0 ? errors : undefined
    };

    const message = errors.length > 0
        ? `${savedQuestions.length} of ${questionsToSave.length} questions saved successfully. ${errors.length} failed.`
        : `All ${savedQuestions.length} questions saved successfully`;

    return res
        .status(201)
        .json(ApiResponse.success(response, message));
});

export default {
    generateQuestions,
    saveGeneratedQuestions
};
