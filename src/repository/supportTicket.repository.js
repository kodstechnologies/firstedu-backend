import SupportTicket from "../models/SupportTicket.js";
import { ApiError } from "../utils/ApiError.js";

const create = async (ticketData) => {
  try {
    const ticket = await SupportTicket.create(ticketData);
    return await SupportTicket.findById(ticket._id)
      .populate("student", "name email")
      .populate("assignedTo", "name email");
  } catch (error) {
    throw new ApiError(500, "Failed to create support ticket", error.message);
  }
};

const findById = async (ticketId) => {
  try {
    return await SupportTicket.findById(ticketId)
      .populate("student", "name email")
      .populate("assignedTo", "name email")
      .populate("internalNotes.addedBy", "name email");
  } catch (error) {
    throw new ApiError(500, "Failed to fetch ticket", error.message);
  }
};

const findByTicketNumber = async (ticketNumber) => {
  try {
    return await SupportTicket.findOne({ ticketNumber })
      .populate("student", "name email")
      .populate("assignedTo", "name email")
      .populate("internalNotes.addedBy", "name email");
  } catch (error) {
    throw new ApiError(500, "Failed to fetch ticket", error.message);
  }
};

const updateById = async (ticketId, updateData) => {
  try {
    return await SupportTicket.findByIdAndUpdate(
      ticketId,
      { $set: updateData },
      { new: true, runValidators: true }
    )
      .populate("student", "name email")
      .populate("assignedTo", "name email")
      .populate("internalNotes.addedBy", "name email");
  } catch (error) {
    throw new ApiError(500, "Failed to update ticket", error.message);
  }
};

const findStudentTickets = async (studentId, options = {}) => {
  try {
    const {
      page = 1,
      limit = 10,
      status,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = options;

    const query = { student: studentId };
    if (status) {
      query.status = status;
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;
    const sort = { [sortBy]: sortOrder === "desc" ? -1 : 1 };

    const [tickets, total] = await Promise.all([
      SupportTicket.find(query)
        .populate("assignedTo", "name email")
        .sort(sort)
        .skip(skip)
        .limit(limitNum),
      SupportTicket.countDocuments(query),
    ]);

    return {
      tickets,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum) || 1,
      },
    };
  } catch (error) {
    throw new ApiError(500, "Failed to fetch student tickets", error.message);
  }
};

const findAllTickets = async (options = {}) => {
  try {
    const {
      page = 1,
      limit = 10,
      status,
      category,
      priority,
      assignedTo,
      search,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = options;

    const query = {};

    if (status) {
      query.status = status;
    }
    if (category) {
      query.category = category;
    }
    if (priority) {
      query.priority = priority;
    }
    if (assignedTo) {
      query.assignedTo = assignedTo;
    }
    if (search) {
      const regex = { $regex: search, $options: "i" };
      query.$or = [
        { ticketNumber: regex },
        { subject: regex },
        { description: regex },
      ];
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;
    const sort = { [sortBy]: sortOrder === "desc" ? -1 : 1 };

    const [tickets, total] = await Promise.all([
      SupportTicket.find(query)
        .populate("student", "name email")
        .populate("assignedTo", "name email")
        .sort(sort)
        .skip(skip)
        .limit(limitNum),
      SupportTicket.countDocuments(query),
    ]);

    return {
      tickets,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum) || 1,
      },
    };
  } catch (error) {
    throw new ApiError(500, "Failed to fetch tickets", error.message);
  }
};

const addInternalNote = async (ticketId, note, adminId) => {
  try {
    return await SupportTicket.findByIdAndUpdate(
      ticketId,
      {
        $push: {
          internalNotes: {
            note,
            addedBy: adminId,
            addedAt: new Date(),
          },
        },
      },
      { new: true }
    )
      .populate("student", "name email")
      .populate("assignedTo", "name email")
      .populate("internalNotes.addedBy", "name email");
  } catch (error) {
    throw new ApiError(500, "Failed to add internal note", error.message);
  }
};

const updateLastMessageAt = async (ticketId) => {
  try {
    return await SupportTicket.findByIdAndUpdate(
      ticketId,
      { lastMessageAt: new Date() },
      { new: true }
    );
  } catch (error) {
    throw new ApiError(500, "Failed to update last message time", error.message);
  }
};

export default {
  create,
  findById,
  findByTicketNumber,
  updateById,
  findStudentTickets,
  findAllTickets,
  addInternalNote,
  updateLastMessageAt,
};

