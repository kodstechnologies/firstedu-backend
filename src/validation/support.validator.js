import Joi from "joi";

const createTicket = Joi.object({
  subject: Joi.string().trim().required().min(3).max(200),
  description: Joi.string().trim().required().min(10).max(2000),
  category: Joi.string()
    .valid("technical", "billing", "course", "account", "other")
    .optional(),
  priority: Joi.string().valid("low", "medium", "high", "urgent").optional(),
});

const sendMessage = Joi.object({
  message: Joi.string().trim().required().min(1).max(5000),
  attachments: Joi.array()
    .items(
      Joi.object({
        url: Joi.string().uri().required(),
        fileName: Joi.string().required(),
        fileType: Joi.string().optional(),
      })
    )
    .optional(),
});

const updateTicketStatus = Joi.object({
  status: Joi.string()
    .valid("open", "in_progress", "resolved", "closed")
    .required(),
});

const assignTicket = Joi.object({
  adminId: Joi.string().required(),
});

const addInternalNote = Joi.object({
  note: Joi.string().trim().required().min(1).max(1000),
});

export default {
  createTicket,
  sendMessage,
  updateTicketStatus,
  assignTicket,
  addInternalNote,
};

