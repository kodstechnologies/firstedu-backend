import { ApiError } from "../utils/ApiError.js";
import supportTicketRepository from "../repository/supportTicket.repository.js";
import supportMessageRepository from "../repository/supportMessage.repository.js";

/**
 * Create a new support ticket
 */
export const createTicket = async (studentId, ticketData) => {
  const ticket = await supportTicketRepository.create({
    student: studentId,
    subject: ticketData.subject,
    description: ticketData.description,
    category: ticketData.category || "other",
    priority: ticketData.priority || "medium",
    status: "open",
  });

  return ticket;
};

/**
 * Get student's tickets
 */
export const getStudentTickets = async (studentId, page = 1, limit = 10, status = null) => {
  return await supportTicketRepository.findStudentTickets(studentId, {
    page,
    limit,
    status,
  });
};

/**
 * Get ticket by ID (with authorization check)
 */
export const getTicketById = async (ticketId, userId, userType) => {
  const ticket = await supportTicketRepository.findById(ticketId);

  if (!ticket) {
    throw new ApiError(404, "Ticket not found");
  }

  // Check authorization
  if (userType === "User" && ticket.student._id.toString() !== userId.toString()) {
    throw new ApiError(403, "Unauthorized to access this ticket");
  }

  return ticket;
};

/**
 * Get all tickets (admin)
 */
export const getAllTickets = async (options = {}) => {
  const {
    page = 1,
    limit = 10,
    status,
    category,
    priority,
    assignedTo,
    search,
  } = options;

  return await supportTicketRepository.findAllTickets({
    page,
    limit,
    status,
    category,
    priority,
    assignedTo,
    search,
  });
};

/**
 * Assign ticket to admin
 */
export const assignTicket = async (ticketId, adminId) => {
  const ticket = await supportTicketRepository.findById(ticketId);

  if (!ticket) {
    throw new ApiError(404, "Ticket not found");
  }

  const updatedTicket = await supportTicketRepository.updateById(ticketId, {
    assignedTo: adminId,
    status: ticket.status === "open" ? "in_progress" : ticket.status,
  });

  return updatedTicket;
};

/**
 * Update ticket status
 */
export const updateTicketStatus = async (ticketId, status, adminId = null) => {
  const validStatuses = ["open", "in_progress", "resolved", "closed"];
  if (!validStatuses.includes(status)) {
    throw new ApiError(400, "Invalid status");
  }

  const ticket = await supportTicketRepository.findById(ticketId);

  if (!ticket) {
    throw new ApiError(404, "Ticket not found");
  }

  const updateData = { status };

  if (status === "resolved" && !ticket.resolvedAt) {
    updateData.resolvedAt = new Date();
  }

  if (status === "closed" && !ticket.closedAt) {
    updateData.closedAt = new Date();
  }

  if (status === "open" && ticket.resolvedAt) {
    updateData.resolvedAt = null;
  }

  if (status === "open" && ticket.closedAt) {
    updateData.closedAt = null;
  }

  const updatedTicket = await supportTicketRepository.updateById(ticketId, updateData);

  return updatedTicket;
};

/**
 * Add internal note (admin only)
 */
export const addInternalNote = async (ticketId, note, adminId) => {
  const ticket = await supportTicketRepository.findById(ticketId);

  if (!ticket) {
    throw new ApiError(404, "Ticket not found");
  }

  const updatedTicket = await supportTicketRepository.addInternalNote(
    ticketId,
    note,
    adminId
  );

  return updatedTicket;
};

/**
 * Send message in ticket
 */
export const sendMessage = async (ticketId, senderId, senderType, message, attachments = []) => {
  const ticket = await supportTicketRepository.findById(ticketId);

  if (!ticket) {
    throw new ApiError(404, "Ticket not found");
  }

  // Check authorization
  if (senderType === "User" && ticket.student._id.toString() !== senderId.toString()) {
    throw new ApiError(403, "Unauthorized to send message in this ticket");
  }

  // Create message
  const messageData = {
    ticket: ticketId,
    sender: senderId,
    senderType: senderType === "admin" ? "Admin" : "User",
    message,
    attachments,
  };

  const newMessage = await supportMessageRepository.create(messageData);

  // Update ticket's last message time
  await supportTicketRepository.updateLastMessageAt(ticketId);

  // If ticket is closed/resolved and new message comes, reopen it
  if (ticket.status === "closed" || ticket.status === "resolved") {
    await supportTicketRepository.updateById(ticketId, {
      status: "in_progress",
      resolvedAt: null,
      closedAt: null,
    });
  }

  return newMessage;
};

/**
 * Get ticket messages
 */
export const getTicketMessages = async (ticketId, userId, userType, page = 1, limit = 50) => {
  const ticket = await supportTicketRepository.findById(ticketId);

  if (!ticket) {
    throw new ApiError(404, "Ticket not found");
  }

  // Check authorization
  if (userType === "User" && ticket.student._id.toString() !== userId.toString()) {
    throw new ApiError(403, "Unauthorized to access messages in this ticket");
  }

  const result = await supportMessageRepository.findTicketMessages(ticketId, {
    page,
    limit,
    sortBy: "createdAt",
    sortOrder: "asc",
  });

  // Mark messages as read
  await supportMessageRepository.markTicketMessagesAsRead(ticketId, userId, userType);

  return result;
};

/**
 * Get unread message count for a ticket
 */
export const getUnreadCount = async (ticketId, userId, userType) => {
  return await supportMessageRepository.getUnreadCount(ticketId, userId, userType);
};

export default {
  createTicket,
  getStudentTickets,
  getTicketById,
  getAllTickets,
  assignTicket,
  updateTicketStatus,
  addInternalNote,
  sendMessage,
  getTicketMessages,
  getUnreadCount,
};

