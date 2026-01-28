import SupportMessage from "../models/SupportMessage.js";
import { ApiError } from "../utils/ApiError.js";

const create = async (messageData) => {
  try {
    const message = await SupportMessage.create(messageData);
    return await SupportMessage.findById(message._id)
      .populate("sender", "name email")
      .populate("ticket", "ticketNumber subject");
  } catch (error) {
    throw new ApiError(500, "Failed to create message", error.message);
  }
};

const findById = async (messageId) => {
  try {
    return await SupportMessage.findById(messageId)
      .populate("sender", "name email")
      .populate("ticket", "ticketNumber subject");
  } catch (error) {
    throw new ApiError(500, "Failed to fetch message", error.message);
  }
};

const findTicketMessages = async (ticketId, options = {}) => {
  try {
    const {
      page = 1,
      limit = 50,
      sortBy = "createdAt",
      sortOrder = "asc",
    } = options;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;
    const sort = { [sortBy]: sortOrder === "asc" ? 1 : -1 };

    const [messages, total] = await Promise.all([
      SupportMessage.find({ ticket: ticketId })
        .populate("sender", "name email")
        .sort(sort)
        .skip(skip)
        .limit(limitNum),
      SupportMessage.countDocuments({ ticket: ticketId }),
    ]);

    return {
      messages,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum) || 1,
      },
    };
  } catch (error) {
    throw new ApiError(500, "Failed to fetch messages", error.message);
  }
};

const markAsRead = async (messageId) => {
  try {
    return await SupportMessage.findByIdAndUpdate(
      messageId,
      {
        isRead: true,
        readAt: new Date(),
      },
      { new: true }
    );
  } catch (error) {
    throw new ApiError(500, "Failed to mark message as read", error.message);
  }
};

const markTicketMessagesAsRead = async (ticketId, userId, userType) => {
  try {
    // Mark all messages in the ticket as read that are not from the current user
    const senderType = userType === "admin" ? "Admin" : "User";
    return await SupportMessage.updateMany(
      {
        ticket: ticketId,
        sender: { $ne: userId },
        senderType: { $ne: senderType },
        isRead: false,
      },
      {
        isRead: true,
        readAt: new Date(),
      }
    );
  } catch (error) {
    throw new ApiError(500, "Failed to mark messages as read", error.message);
  }
};

const getUnreadCount = async (ticketId, userId, userType) => {
  try {
    const senderType = userType === "admin" ? "Admin" : "User";
    return await SupportMessage.countDocuments({
      ticket: ticketId,
      sender: { $ne: userId },
      senderType: { $ne: senderType },
      isRead: false,
    });
  } catch (error) {
    throw new ApiError(500, "Failed to get unread count", error.message);
  }
};

export default {
  create,
  findById,
  findTicketMessages,
  markAsRead,
  markTicketMessagesAsRead,
  getUnreadCount,
};

