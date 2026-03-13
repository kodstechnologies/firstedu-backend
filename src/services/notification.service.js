import notificationRepository from "../repository/notification.repository.js";
import studentRepository from "../repository/student.repository.js";
import studentSessionRepository from "../repository/studentSession.repository.js";
import CoursePurchase from "../models/CoursePurchase.js";
import TestPurchase from "../models/TestPurchase.js";
import EventRegistration from "../models/EventRegistration.js";
import {
  sendNotificationToDevice,
  sendNotificationToMultipleDevices,
} from "./fcm.service.js";

const PURCHASER_PRODUCT_TYPES = ["Course", "Test", "TestBundle", "Olympiad", "Tournament", "Workshop"];

/**
 * Send notification to a single student
 */
export const sendNotificationToStudent = async (studentId, title, body, data = {}, sentBy) => {
  const student = await studentRepository.findById(studentId);
  if (!student) {
    throw new Error("Student not found");
  }

  const session = await studentSessionRepository.findByStudentId(studentId);
  const fcmToken = session?.fcmToken || null;

  const notification = await notificationRepository.create({
    title,
    body,
    recipient: studentId,
    sentBy,
    data,
    type: data.type || "general",
  });

  let fcmResult = null;
  if (fcmToken) {
    try {
      fcmResult = await sendNotificationToDevice(
        fcmToken,
        title,
        body,
        {
          ...data,
          notificationId: notification._id.toString(),
        }
      );

      if (fcmResult.success) {
        await notificationRepository.update(notification._id, {
          fcmSent: true,
          fcmSentAt: new Date(),
        });
      }
    } catch (error) {
      console.error("Error sending FCM notification:", error);
      if (error.code === "messaging/invalid-registration-token" ||
          error.code === "messaging/registration-token-not-registered") {
        await studentSessionRepository.updateFcmToken(studentId, null);
      }
    }
  }

  return {
    notification,
    fcmSent: fcmResult?.success || false,
  };
};

/**
 * Send notification to multiple students
 */
export const sendNotificationToMultipleStudents = async (
  studentIds,
  title,
  body,
  data = {},
  sentBy
) => {
  const students = await studentRepository.findAll(
    { _id: { $in: studentIds } },
    { limit: 1000 }
  );

  if (!students.students || students.students.length === 0) {
    throw new Error("No students found");
  }

  const notifications = students.students.map((student) => ({
    title,
    body,
    recipient: student._id,
    sentBy,
    data,
    type: data.type || "general",
  }));

  const createdNotifications = await notificationRepository.createMany(notifications);

  const sessionMap = await studentSessionRepository.findByStudentIds(studentIds);
  const fcmTokens = [];
  const tokenToNotificationMap = new Map();

  students.students.forEach((student, index) => {
    const session = sessionMap.get(student._id.toString());
    const token = session?.fcmToken;
    if (token) {
      fcmTokens.push(token);
      tokenToNotificationMap.set(token, createdNotifications[index]._id);
    }
  });

  // Send FCM notifications
  let fcmResult = null;
  if (fcmTokens.length > 0) {
    try {
      fcmResult = await sendNotificationToMultipleDevices(
        fcmTokens,
        title,
        body,
        {
          ...data,
        }
      );

      // Update notifications with FCM status for successful sends
      if (fcmResult.success && fcmResult.responses) {
        const updatePromises = [];
        fcmResult.responses.forEach((response, index) => {
          if (response.success) {
            const notificationId = Array.from(tokenToNotificationMap.values())[index];
            updatePromises.push(
              notificationRepository.update(notificationId, {
                fcmSent: true,
                fcmSentAt: new Date(),
              })
            );
          }
        });
        await Promise.all(updatePromises);
      }
    } catch (error) {
      console.error("Error sending FCM notifications:", error);
    }
  }

  return {
    notifications: createdNotifications,
    totalSent: createdNotifications.length,
    fcmSent: fcmResult?.successCount || 0,
    fcmFailed: fcmResult?.failureCount || 0,
  };
};

/**
 * Send notification to students who purchased any item of the given product type
 * (e.g. all test purchasers, all course purchasers, etc.)
 */
export const sendNotificationToPurchasers = async (
  productType,
  title,
  body,
  data = {},
  sentBy
) => {
  let studentIds = [];

  switch (productType) {
    case "Course":
      studentIds = await CoursePurchase.find({ paymentStatus: "completed" }).distinct("student");
      break;
    case "Test":
      studentIds = await TestPurchase.find({
        test: { $exists: true, $ne: null },
        paymentStatus: "completed",
      }).distinct("student");
      break;
    case "TestBundle":
      studentIds = await TestPurchase.find({
        testBundle: { $exists: true, $ne: null },
        paymentStatus: "completed",
      }).distinct("student");
      break;
    case "Olympiad":
      studentIds = await EventRegistration.find({
        eventType: "olympiad",
        paymentStatus: "completed",
      }).distinct("student");
      break;
    case "Tournament":
      studentIds = await EventRegistration.find({
        eventType: "tournament",
        paymentStatus: "completed",
      }).distinct("student");
      break;
    case "Workshop":
      studentIds = await EventRegistration.find({
        eventType: "workshop",
        paymentStatus: "completed",
      }).distinct("student");
      break;
    default:
      throw new Error(
        `Invalid productType. Must be one of: ${PURCHASER_PRODUCT_TYPES.join(", ")}`
      );
  }

  // Remove duplicates (a student may have purchased multiple items of same type)
  studentIds = [...new Set(studentIds.map((id) => id.toString()))];

  if (!studentIds || studentIds.length === 0) {
    return {
      notifications: [],
      totalSent: 0,
      fcmSent: 0,
      fcmFailed: 0,
      message: `No purchasers found for ${productType}`,
    };
  }

  const result = await sendNotificationToMultipleStudents(
    studentIds,
    title,
    body,
    { ...data, productType },
    sentBy
  );

  return {
    ...result,
    productType,
  };
};

/**
 * Send notification to all students
 */
export const sendNotificationToAllStudents = async (title, body, data = {}, sentBy) => {
  // Get all students with pagination
  let allStudentIds = [];
  let page = 1;
  const limit = 100;

  while (true) {
    const result = await studentRepository.findAll({}, { page, limit });
    if (!result.students || result.students.length === 0) break;

    allStudentIds.push(...result.students.map((s) => s._id));
    
    if (result.students.length < limit) break;
    page++;
  }

  if (allStudentIds.length === 0) {
    throw new Error("No students found");
  }

  // Send in batches to avoid overwhelming the system
  const batchSize = 500;
  const batches = [];
  
  for (let i = 0; i < allStudentIds.length; i += batchSize) {
    batches.push(allStudentIds.slice(i, i + batchSize));
  }

  const results = [];
  for (const batch of batches) {
    const result = await sendNotificationToMultipleStudents(
      batch,
      title,
      body,
      data,
      sentBy
    );
    results.push(result);
  }

  // Aggregate results
  return {
    totalSent: results.reduce((sum, r) => sum + r.totalSent, 0),
    fcmSent: results.reduce((sum, r) => sum + r.fcmSent, 0),
    fcmFailed: results.reduce((sum, r) => sum + r.fcmFailed, 0),
  };
};

/**
 * Get notifications for a student
 */
export const getStudentNotifications = async (studentId, options = {}) => {
  const query = { recipient: studentId };
  
  // Add isRead filter if provided
  if (options.isRead !== undefined) {
    query.isRead = options.isRead === true || options.isRead === "true";
  }
  
  return await notificationRepository.findAll(query, options);
};

/**
 * Mark notification as read
 */
export const markNotificationAsRead = async (notificationId, studentId) => {
  const notification = await notificationRepository.findById(notificationId);
  
  if (!notification) {
    throw new Error("Notification not found");
  }

  if (notification.recipient.toString() !== studentId.toString()) {
    throw new Error("Unauthorized: This notification does not belong to you");
  }

  return await notificationRepository.markAsRead(notificationId);
};

/**
 * Mark all notifications as read for a student
 */
export const markAllNotificationsAsRead = async (studentId) => {
  return await notificationRepository.markAllAsRead(studentId);
};

/**
 * Get unread notification count
 */
export const getUnreadCount = async (studentId) => {
  const count = await notificationRepository.getUnreadCount(studentId);
  return count;
};

