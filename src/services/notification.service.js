import notificationRepository from "../repository/notification.repository.js";
import studentRepository from "../repository/student.repository.js";
import teacherRepository from "../repository/teacher.repository.js";
import studentSessionRepository from "../repository/studentSession.repository.js";
import CoursePurchase from "../models/CoursePurchase.js";
import TestPurchase from "../models/TestPurchase.js";
import EventRegistration from "../models/EventRegistration.js";
import CategoryPurchase from "../models/CategoryPurchase.js";
import categoryRepository from "../repository/category.repository.js";
import {
  sendNotificationToDevice,
  sendNotificationToMultipleDevices,
} from "./fcm.service.js";

const PURCHASER_PRODUCT_TYPES = ["Course", "Test", "TestBundle", "Tournament", "Workshop"];

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
 * Send notification to a single teacher (in-app + FCM when token exists)
 */
export const sendNotificationToTeacher = async (teacherId, title, body, data = {}, sentBy) => {
  const teacher = await teacherRepository.findById(teacherId);
  if (!teacher) {
    throw new Error("Teacher not found");
  }

  const notification = await notificationRepository.create({
    title,
    body,
    recipient: teacherId,
    sentBy,
    data,
    type: data.type || "general",
  });

  const fcmToken = teacher.fcmToken?.trim() || null;
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
      console.error("Error sending FCM notification to teacher:", error);
      if (
        error.code === "messaging/invalid-registration-token" ||
        error.code === "messaging/registration-token-not-registered"
      ) {
        await teacherRepository.updateById(teacherId, { fcmToken: null });
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
 * Send notification to multiple teachers
 */
export const sendNotificationToMultipleTeachers = async (
  teacherIds,
  title,
  body,
  data = {},
  sentBy
) => {
  const result = await teacherRepository.findAll(
    { _id: { $in: teacherIds } },
    { limit: 1000 }
  );

  if (!result.teachers || result.teachers.length === 0) {
    throw new Error("No teachers found");
  }

  const notifications = result.teachers.map((teacher) => ({
    title,
    body,
    recipient: teacher._id,
    sentBy,
    data,
    type: data.type || "general",
  }));

  const createdNotifications = await notificationRepository.createMany(notifications);

  const fcmTokens = [];
  const notificationIdsForTokens = [];

  result.teachers.forEach((teacher, index) => {
    const token = teacher.fcmToken?.trim();
    if (token) {
      fcmTokens.push(token);
      notificationIdsForTokens.push(createdNotifications[index]._id);
    }
  });

  let fcmResult = null;
  if (fcmTokens.length > 0) {
    try {
      fcmResult = await sendNotificationToMultipleDevices(fcmTokens, title, body, {
        ...data,
      });

      if (fcmResult.success && fcmResult.responses) {
        const updatePromises = [];
        fcmResult.responses.forEach((response, index) => {
          if (response.success) {
            const notificationId = notificationIdsForTokens[index];
            if (notificationId) {
              updatePromises.push(
                notificationRepository.update(notificationId, {
                  fcmSent: true,
                  fcmSentAt: new Date(),
                })
              );
            }
          }
        });
        await Promise.all(updatePromises);
      }
    } catch (error) {
      console.error("Error sending FCM notifications to teachers:", error);
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
 * Send notification to all teachers
 */
export const sendNotificationToAllTeachers = async (title, body, data = {}, sentBy) => {
  let allTeacherIds = [];
  let page = 1;
  const limit = 100;

  while (true) {
    const result = await teacherRepository.findAll({}, { page, limit });
    if (!result.teachers || result.teachers.length === 0) break;

    allTeacherIds.push(...result.teachers.map((t) => t._id));

    if (result.teachers.length < limit) break;
    page++;
  }

  if (allTeacherIds.length === 0) {
    throw new Error("No teachers found");
  }

  const batchSize = 500;
  const batches = [];
  for (let i = 0; i < allTeacherIds.length; i += batchSize) {
    batches.push(allTeacherIds.slice(i, i + batchSize));
  }

  const results = [];
  for (const batch of batches) {
    const result = await sendNotificationToMultipleTeachers(batch, title, body, data, sentBy);
    results.push(result);
  }

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
 * Persist an in-app notification for a teacher (recipient is Teacher _id).
 */
export const createNotificationForTeacher = async (
  teacherId,
  title,
  body,
  data = {},
  type = "system"
) => {
  return await notificationRepository.create({
    recipient: teacherId,
    title,
    body,
    data,
    type,
    sentBy: null,
  });
};

/**
 * Get notifications for a teacher
 */
export const getTeacherNotifications = async (teacherId, options = {}) => {
  const query = { recipient: teacherId };

  if (options.isRead !== undefined) {
    query.isRead = options.isRead === true || options.isRead === "true";
  }

  return await notificationRepository.findAll(query, options);
};

/**
 * Get unread notification count for a teacher
 */
export const getTeacherUnreadCount = async (teacherId) => {
  return await notificationRepository.getUnreadCount(teacherId);
};

/**
 * Mark one notification read (teacher must own it)
 */
export const markTeacherNotificationAsRead = async (notificationId, teacherId) => {
  const notification = await notificationRepository.findById(notificationId);

  if (!notification) {
    throw new Error("Notification not found");
  }

  if (notification.recipient.toString() !== teacherId.toString()) {
    throw new Error("Unauthorized: This notification does not belong to you");
  }

  return await notificationRepository.markAsRead(notificationId);
};

/**
 * Mark all notifications read for a teacher
 */
export const markAllTeacherNotificationsAsRead = async (teacherId) => {
  return await notificationRepository.markAllAsRead(teacherId);
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

/**
 * Send an upgrade notification to all students who purchased a specific category or any of its ancestors.
 * Used when a new test or subcategory is added.
 */
export const sendUpgradeNotificationForCategory = async (targetCategoryId, contentName, contentType, sentBy) => {
  try {
    if (!targetCategoryId) return;

    // 1. Get ancestors of targetCategoryId
    const ancestors = [];
    const categoryNames = [];
    let currentId = targetCategoryId.toString();
    while (currentId) {
      ancestors.push(currentId);
      const category = await categoryRepository.findById(currentId);
      if (category) {
        categoryNames.unshift(category.name);
      }
      if (category && category.parent) {
        currentId = category.parent._id ? category.parent._id.toString() : category.parent.toString();
      } else {
        currentId = null;
      }
    }

    // 2. Find all unique students who purchased any of these ancestors
    const purchases = await CategoryPurchase.find({
      categoryId: { $in: ancestors },
      paymentStatus: "completed"
    }).select("student").lean();

    const studentIds = [...new Set(purchases.map(p => p.student.toString()))];

    if (studentIds.length === 0) return;

    // 3. Send notification
    const fullPath = categoryNames.length > 0 ? ` (${categoryNames.join(' > ')})` : '';
    const title = contentType === "test" ? "New Test Added!" : "New Category Added!";
    const body = contentType === "test" 
      ? `A new test '${contentName}' has been added in${fullPath}. You can now access it!`
      : `A new subcategory '${contentName}' has been added in${fullPath}. You can now access it!`;

    // sendNotificationToMultipleStudents already exists in this file
    await sendNotificationToMultipleStudents(
      studentIds, 
      title, 
      body, 
      { type: "upgrade", targetCategoryId: targetCategoryId.toString(), contentType }, 
      sentBy
    );
  } catch (error) {
    console.error("Error in sendUpgradeNotificationForCategory:", error);
  }
};

