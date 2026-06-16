import Joi from 'joi';

// Validation schema for generating questions
export const generateQuestionsSchema = Joi.object({
    topic: Joi.string().required().trim().min(2).max(200).messages({
        'string.empty': 'Topic is required',
        'string.min': 'Topic must be at least 2 characters long',
        'string.max': 'Topic must not exceed 200 characters',
        'any.required': 'Topic is required'
    }),

    subject: Joi.string().required().trim().min(2).max(100).messages({
        'string.empty': 'Subject is required',
        'string.min': 'Subject must be at least 2 characters long',
        'string.max': 'Subject must not exceed 100 characters',
        'any.required': 'Subject is required'
    }),

    classLevel: Joi.string().required().trim().min(2).max(100).messages({
        'string.empty': 'Class level is required',
        'string.min': 'Class level must be at least 2 characters long',
        'string.max': 'Class level must not exceed 100 characters',
        'any.required': 'Class level is required'
    }),

    difficulty: Joi.string()
        .valid('easy', 'medium', 'hard')
        .required()
        .messages({
            'any.only': 'Difficulty must be one of: easy, medium, hard',
            'any.required': 'Difficulty is required'
        }),

    numberOfQuestions: Joi.number()
        .integer()
        .min(1)
        .max(20)
        .required()
        .messages({
            'number.base': 'Number of questions must be a number',
            'number.min': 'Must generate at least 1 question',
            'number.max': 'Cannot generate more than 20 questions at once',
            'any.required': 'Number of questions is required'
        })
});

// Validation schema for saving generated questions
export const saveGeneratedQuestionsSchema = Joi.object({
    questions: Joi.array()
        .items(
            Joi.object({
                topic: Joi.string().required().trim(),
                subject: Joi.string().required().trim(),
                classLevel: Joi.string().required().trim(),
                difficulty: Joi.string().valid('easy', 'medium', 'hard').required(),
                questionText: Joi.string().required().trim().min(5),
                optionA: Joi.string().required().trim(),
                optionB: Joi.string().required().trim(),
                optionC: Joi.string().required().trim(),
                optionD: Joi.string().required().trim(),
                answer: Joi.string().valid('A', 'B', 'C', 'D').required(),
                explanation: Joi.string().optional().trim().allow(''),
                subjectRef: Joi.string().optional().allow(null),
                questionBank: Joi.string().optional().allow(null),
                marks: Joi.number().optional().default(1),
                negativeMarks: Joi.number().optional().default(0)
            })
        )
        .min(1)
        .max(50)
        .required()
        .messages({
            'array.min': 'At least 1 question is required',
            'array.max': 'Cannot save more than 50 questions at once',
            'any.required': 'Questions array is required'
        }),

    questionBankId: Joi.string().optional().allow(null, '')
});

// Question bank AI suggestions (single / multiple / true_false counts)
export const generateQuestionBankSuggestionsSchema = Joi.object({
    topic: Joi.string().required().trim().min(2).max(300).messages({
        'string.empty': 'Topic is required',
        'any.required': 'Topic is required',
    }),
    bankName: Joi.string().trim().max(200).optional().allow(''),
    difficulty: Joi.string()
        .valid('easy', 'medium', 'hard', 'Easy', 'Medium', 'Hard')
        .required()
        .messages({
            'any.only': 'Difficulty must be easy, medium, or hard',
            'any.required': 'Difficulty is required',
        }),
    singleCount: Joi.number().integer().min(0).max(30).default(0),
    multipleCount: Joi.number().integer().min(0).max(30).default(0),
    trueFalseCount: Joi.number().integer().min(0).max(30).default(0),
    /** Stems from prior AI batches in this session — do not repeat */
    excludeQuestionTexts: Joi.array()
        .items(Joi.string().trim().min(3).max(500))
        .max(100)
        .default([]),
})
    .custom((value, helpers) => {
        const total =
            (value.singleCount || 0) +
            (value.multipleCount || 0) +
            (value.trueFalseCount || 0);
        if (total < 1) {
            return helpers.error('any.custom', {
                message: 'Request at least one question (single, multiple, or true/false)',
            });
        }
        if (total > 30) {
            return helpers.error('any.custom', {
                message: 'Cannot generate more than 30 questions per request',
            });
        }
        return value;
    })
    .messages({
        'any.custom': '{{#message}}',
    });

export default {
    generateQuestions: generateQuestionsSchema,
    saveGeneratedQuestions: saveGeneratedQuestionsSchema,
    generateQuestionBankSuggestions: generateQuestionBankSuggestionsSchema,
};
