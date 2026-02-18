import { GoogleGenAI } from "@google/genai";
import { ApiError } from "../utils/ApiError.js";

// Initialize Gemini 2.5 Flash
const genAI = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

/**
 * Build a structured prompt for AI question generation
 */
const buildPrompt = ({ topic, subject, classLevel, difficulty, numberOfQuestions }) => {
    return `You are an expert educator creating multiple-choice questions for competitive exams.

Generate exactly ${numberOfQuestions} high-quality MCQ questions with the following specifications:

**Topic:** ${topic}
**Subject:** ${subject}
**Class/Level:** ${classLevel}
**Difficulty:** ${difficulty}

**CRITICAL INSTRUCTIONS:**
1. Return ONLY a valid JSON array, no markdown, no code blocks, no extra text
2. Each question must have exactly 4 options (A, B, C, D)
3. Each question must have exactly ONE correct answer
4. Include a clear explanation for the correct answer
5. Questions should be appropriate for ${classLevel} level
6. Difficulty should match "${difficulty}" level

**Required JSON Format:**
[
  {
    "questionText": "The complete question text here",
    "optionA": "First option text",
    "optionB": "Second option text",
    "optionC": "Third option text",
    "optionD": "Fourth option text",
    "answer": "A",
    "explanation": "Detailed explanation of why this is correct"
  }
]

**IMPORTANT:** 
- The "answer" field must be ONLY the letter: "A", "B", "C", or "D"
- Do NOT include markdown code blocks like \`\`\`json
- Return ONLY the JSON array, nothing else
- Ensure all questions are unique and relevant to the topic`;
};

/**
 * Clean AI response by removing markdown code blocks and extra whitespace
 */
const cleanAIResponse = (responseText) => {
    let cleaned = responseText.trim();

    // Remove markdown code blocks
    cleaned = cleaned.replace(/```json\s*/gi, '');
    cleaned = cleaned.replace(/```\s*/g, '');

    // Remove any leading/trailing whitespace
    cleaned = cleaned.trim();

    return cleaned;
};

/**
 * Parse and validate the AI-generated questions
 */
const parseAndValidateQuestions = (jsonString) => {
    try {
        const questions = JSON.parse(jsonString);

        if (!Array.isArray(questions)) {
            throw new Error('Response is not an array');
        }

        // Validate each question has required fields
        const validatedQuestions = questions.map((q, index) => {
            const requiredFields = ['questionText', 'optionA', 'optionB', 'optionC', 'optionD', 'answer', 'explanation'];
            const missingFields = requiredFields.filter(field => !q[field]);

            if (missingFields.length > 0) {
                throw new Error(`Question ${index + 1} is missing fields: ${missingFields.join(', ')}`);
            }

            // Validate answer is A, B, C, or D
            const validAnswers = ['A', 'B', 'C', 'D'];
            if (!validAnswers.includes(q.answer.toUpperCase())) {
                throw new Error(`Question ${index + 1} has invalid answer: ${q.answer}. Must be A, B, C, or D`);
            }

            return {
                questionText: q.questionText.trim(),
                optionA: q.optionA.trim(),
                optionB: q.optionB.trim(),
                optionC: q.optionC.trim(),
                optionD: q.optionD.trim(),
                answer: q.answer.toUpperCase(),
                explanation: q.explanation.trim()
            };
        });

        return validatedQuestions;
    } catch (error) {
        throw new ApiError(500, `Failed to parse AI response: ${error.message}`);
    }
};

/**
 * Generate questions using Gemini AI
 */
export const generateQuestionsWithAI = async (params) => {
    const { topic, subject, classLevel, difficulty, numberOfQuestions } = params;

    try {
        // Build the prompt
        const prompt = buildPrompt({
            topic,
            subject,
            classLevel,
            difficulty,
            numberOfQuestions
        });

        // Generate content using Gemini 2.5 Flash
        const result = await genAI.models.generateContent({
            model: "gemini-2.5-flash",
            contents: [
                {
                    role: "user",
                    parts: [{ text: prompt }]
                }
            ]
        });

        const text = result.text || "";

        if (!text) {
            throw new ApiError(500, "AI returned empty response");
        }

        // Clean AI response
        const cleanedResponse = cleanAIResponse(text);

        // Parse and validate JSON
        const questions = parseAndValidateQuestions(cleanedResponse);

        // Add metadata
        const questionsWithMetadata = questions.map(q => ({
            ...q,
            topic,
            subject,
            classLevel,
            difficulty
        }));

        return questionsWithMetadata;

    } catch (error) {

        if (error.message?.includes("API key")) {
            throw new ApiError(500, "Invalid or missing Gemini API key");
        }

        if (
            error.message?.includes("quota") ||
            error.message?.includes("rate limit")
        ) {
            throw new ApiError(
                429,
                "AI service rate limit exceeded. Please try again later."
            );
        }

        if (error instanceof ApiError) {
            throw error;
        }

        throw new ApiError(
            500,
            `AI question generation failed: ${error.message}`
        );
    }
};


export default {
    generateQuestionsWithAI
};
