import Notification from "../models/Notification.js";

class NotificationRepository {
  /**
   * Create a new notification
   */
  async create(data) {
    return await Notification.create(data);
  }

  /**
   * Find notification by ID
   */
  async findById(id, populate = {}) {
    const query = Notification.findById(id);
    
    if (populate.recipient) {
      query.populate("recipient", populate.recipient);
    }
    if (populate.sentBy) {
      query.populate("sentBy", populate.sentBy);
    }
    
    return await query;
  }

  /**
   * Find all notifications with pagination
   */
  async findAll(query = {}, options = {}) {
    const {
      page = 1,
      limit = 10,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = options;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const sort = { [sortBy]: sortOrder === "desc" ? -1 : 1 };

    const notifications = await Notification.find(query)
      .populate("sentBy", "name email")
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Notification.countDocuments(query);

    return {
      notifications,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    };
  }

  /**
   * Update notification
   */
  async update(id, data) {
    return await Notification.findByIdAndUpdate(id, data, { new: true });
  }

  /**
   * Mark notification as read
   */
  async markAsRead(id) {
    return await Notification.findByIdAndUpdate(
      id,
      { isRead: true, readAt: new Date() },
      { new: true }
    );
  }

  /**
   * Mark all notifications as read for a user
   */
  async markAllAsRead(recipientId) {
    return await Notification.updateMany(
      { recipient: recipientId, isRead: false },
      { isRead: true, readAt: new Date() }
    );
  }

  /**
   * Get unread count for a user
   */
  async getUnreadCount(recipientId) {
    return await Notification.countDocuments({
      recipient: recipientId,
      isRead: false,
    });
  }

  /**
   * Delete notification
   */
  async delete(id) {
    return await Notification.findByIdAndDelete(id);
  }

  /**
   * Create multiple notifications
   */
  async createMany(notifications) {
    return await Notification.insertMany(notifications);
  }
}

export default new NotificationRepository();

