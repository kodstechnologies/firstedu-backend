import Joi from "joi";

const QNA_SUBJECTS = ["general", "test_and_exams", "teacher_connect", "payment"];

const submitQnARequest = Joi.object({
  question: Joi.string().trim().required().messages({
    "string.empty": "Question is required",
    "any.required": "Question is required",
  }),
  subject: Joi.string()
    .valid(...QNA_SUBJECTS)
    .required()
    .messages({
      "any.only": `Subject must be one of: ${QNA_SUBJECTS.join(", ")}`,
      "any.required": "Subject is required",
    }),
});

export default { submitQnARequest };
