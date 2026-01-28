import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import supportService from "../services/support.service.js";
import supportValidator from "../validation/support.validator.js";

/**
 * Get all tickets (admin)
 */
export const getAllTickets = asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 10,
    status,
    category,
    priority,
    assignedTo,
    search,
  } = req.query;

  const result = await supportService.getAllTickets({
    page: parseInt(page),
    limit: parseInt(limit),
    status,
    category,
    priority,
    assignedTo,
    search,
  });

  return res.status(200).json(
    ApiResponse.success(
      result.tickets,
      "Tickets fetched successfully",
      result.pagination
    )
  );
});

/**
 * Get ticket by ID (admin)
 */
export const getTicketById = asyncHandler(async (req, res) => {
  const adminId = req.user._id;
  const { ticketId } = req.params;

  const ticket = await supportService.getTicketById(ticketId, adminId, "admin");

  return res
    .status(200)
    .json(ApiResponse.success(ticket, "Ticket fetched successfully"));
});

/**
 * Assign ticket to admin
 */
export const assignTicket = asyncHandler(async (req, res) => {
  const { error, value } = supportValidator.assignTicket.validate(req.body);

  if (error) {
    throw new ApiError(
      400,
      "Validation Error",
      error.details.map((x) => x.message)
    );
  }

  const { ticketId } = req.params;
  const { adminId } = value;

  const ticket = await supportService.assignTicket(ticketId, adminId);

  return res
    .status(200)
    .json(ApiResponse.success(ticket, "Ticket assigned successfully"));
});

/**
 * Update ticket status
 */
export const updateTicketStatus = asyncHandler(async (req, res) => {
  const { error, value } = supportValidator.updateTicketStatus.validate(req.body);

  if (error) {
    throw new ApiError(
      400,
      "Validation Error",
      error.details.map((x) => x.message)
    );
  }

  const { ticketId } = req.params;
  const { status } = value;

  const ticket = await supportService.updateTicketStatus(ticketId, status);

  return res
    .status(200)
    .json(ApiResponse.success(ticket, "Ticket status updated successfully"));
});

/**
 * Add internal note
 */
export const addInternalNote = asyncHandler(async (req, res) => {
  const { error, value } = supportValidator.addInternalNote.validate(req.body);

  if (error) {
    throw new ApiError(
      400,
      "Validation Error",
      error.details.map((x) => x.message)
    );
  }

  const adminId = req.user._id;
  const { ticketId } = req.params;
  const { note } = value;

  const ticket = await supportService.addInternalNote(ticketId, note, adminId);

  return res
    .status(200)
    .json(ApiResponse.success(ticket, "Internal note added successfully"));
});

/**
 * Get ticket messages (admin)
 */
export const getTicketMessages = asyncHandler(async (req, res) => {
  const adminId = req.user._id;
  const { ticketId } = req.params;
  const { page = 1, limit = 50 } = req.query;

  const result = await supportService.getTicketMessages(
    ticketId,
    adminId,
    "admin",
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
 * Send message in ticket (admin)
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

  const adminId = req.user._id;
  const { ticketId } = req.params;
  const { message, attachments = [] } = value;

  const newMessage = await supportService.sendMessage(
    ticketId,
    adminId,
    "admin",
    message,
    attachments
  );

  return res
    .status(201)
    .json(ApiResponse.success(newMessage, "Message sent successfully"));
});

export default {
  getAllTickets,
  getTicketById,
  assignTicket,
  updateTicketStatus,
  addInternalNote,
  getTicketMessages,
  sendMessage,
};

