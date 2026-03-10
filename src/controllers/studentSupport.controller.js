import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import supportService from "../services/support.service.js";
import supportValidator from "../validation/support.validator.js";

/**
 * Create a new support ticket
 */
export const createTicket = asyncHandler(async (req, res) => {
  const { error, value } = supportValidator.createTicket.validate(req.body);

  if (error) {
    throw new ApiError(
      400,
      "Validation Error",
      error.details.map((x) => x.message)
    );
  }

  const studentId = req.user._id;
  const ticket = await supportService.createTicket(studentId, value);

  return res
    .status(201)
    .json(ApiResponse.success(ticket, "Support ticket created successfully"));
});

/**
 * Get student's tickets
 */
export const getMyTickets = asyncHandler(async (req, res) => {
  const studentId = req.user._id;
  const { page = 1, limit = 10, status } = req.query;

  const result = await supportService.getStudentTickets(
    studentId,
    parseInt(page),
    parseInt(limit),
    status || null
  );

  return res.status(200).json(
    ApiResponse.success(
      result.tickets,
      "Tickets fetched successfully",
      result.pagination
    )
  );
});

/**
 * Get ticket by ID
 */
export const getTicketById = asyncHandler(async (req, res) => {
  const studentId = req.user._id;
  const { ticketId } = req.params;

  const ticket = await supportService.getTicketById(ticketId, studentId, "User");

  return res
    .status(200)
    .json(ApiResponse.success(ticket, "Ticket fetched successfully"));
});

/**
 * Get ticket messages
 */
export const getTicketMessages = asyncHandler(async (req, res) => {
  const studentId = req.user._id;
  const { ticketId } = req.params;
  const { page = 1, limit = 50 } = req.query;

  const result = await supportService.getTicketMessages(
    ticketId,
    studentId,
    "User",
    parseInt(page),
    parseInt(limit)
  );

  return res.status(200).json(
    ApiResponse.success(
      result.messages,
      "Messages fetched successfully",
      result.pagination
    )
  );
});

/**
 * Send message in ticket
 */
export const sendMessage = asyncHandler(async (req, res) => {
  const { error, value } = supportValidator.sendMessage.validate(req.body);

  if (error) {
    throw new ApiError(
      400,
      "Validation Error",
      error.details.map((x) => x.message)
    );
  }

  const studentId = req.user._id;
  const { ticketId } = req.params;
  const { message, attachments = [] } = value;

  const newMessage = await supportService.sendMessage(
    ticketId,
    studentId,
    "User",
    message,
    attachments
  );

  return res
    .status(201)
    .json(ApiResponse.success(newMessage, "Message sent successfully"));
});

/**
 * Get all ticket categories
 */
export const getTicketCategories = asyncHandler(async (req, res) => {
  const categories = await supportService.getTicketCategories();
  return res
    .status(200)
    .json(
      ApiResponse.success(categories, "Ticket categories fetched successfully")
    );
});

export default {
  createTicket,
  getMyTickets,
  getTicketById,
  getTicketMessages,
  sendMessage,
  getTicketCategories,
};

