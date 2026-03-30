import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import * as notificationService from "../services/notification.service.js";
import studentSessionRepository from "../repository/studentSession.repository.js";

// ==================== ADMIN CONTROLLERS ====================

/**
 * Send notification to a single student or teacher (Admin).
 * Use one of: studentId | teacherId | recipientType + recipientId (recipientType: "student" | "teacher").
 */
export const sendNotificationToStudent = asyncHandler(async (req, res) => {
  const { studentId, teacherId, recipientType, recipientId, title, body, type, data } = req.body;
  const sentBy = req.user._id;

  if (!title || !body) {
    throw new ApiError(400, "Title and body are required");
  }

  let targetKind;
  let targetId;

  if (recipientType && recipientId) {
    targetKind = recipientType;
    targetId = recipientId;
  } else if (studentId && !teacherId) {
    targetKind = "student";
    targetId = studentId;
  } else if (teacherId && !studentId) {
    targetKind = "teacher";
    targetId = teacherId;
  } else {
    throw new ApiError(
      400,
      "Provide studentId, or teacherId, or recipientType + recipientId (student | teacher)"
    );
  }

  if (!["student", "teacher"].includes(targetKind)) {
    throw new ApiError(400, "recipientType must be 'student' or 'teacher'");
  }

  const payload = { ...data, type: type || "general" };

  const result =
    targetKind === "student"
      ? await notificationService.sendNotificationToStudent(
          targetId,
          title,
          body,
          payload,
          sentBy
        )
      : await notificationService.sendNotificationToTeacher(
          targetId,
          title,
          body,
          payload,
          sentBy
        );

  return res.status(200).json(
    ApiResponse.success(result, "Notification sent successfully")
  );
});

/**
 * Send notification to multiple students or multiple teachers (Admin).
 * Pass exactly one of: studentIds | teacherIds
 */
export const sendNotificationToMultipleStudents = asyncHandler(async (req, res) => {
  const { studentIds, teacherIds, title, body, type, data } = req.body;
  const sentBy = req.user._id;

  if (!title || !body) {
    throw new ApiError(400, "Title and body are required");
  }

  const hasStudents =
    Array.isArray(studentIds) && studentIds.length > 0;
  const hasTeachers =
    Array.isArray(teacherIds) && teacherIds.length > 0;

  if (hasStudents && hasTeachers) {
    throw new ApiError(400, "Send only one of studentIds or teacherIds");
  }

  if (!hasStudents && !hasTeachers) {
    throw new ApiError(400, "studentIds or teacherIds array is required");
  }

  const payload = { ...data, type: type || "general" };

  const result = hasStudents
    ? await notificationService.sendNotificationToMultipleStudents(
        studentIds,
        title,
        body,
        payload,
        sentBy
      )
    : await notificationService.sendNotificationToMultipleTeachers(
        teacherIds,
        title,
        body,
        payload,
        sentBy
      );

  const label = hasStudents ? "students" : "teachers";

  return res.status(200).json(
    ApiResponse.success(
      result,
      `Notification sent to ${result.totalSent} ${label}`
    )
  );
});

/**
 * Send notification to students who purchased any item of the given type (Admin)
 * e.g. select Test → all users who purchased any test get the notification
 */
export const sendNotificationToPurchasers = asyncHandler(async (req, res) => {
  const { productType, title, body, type, data } = req.body;
  const sentBy = req.user._id;

  if (!productType) {
    throw new ApiError(400, "productType is required");
  }

  const validTypes = ["Course", "Test", "TestBundle", "Olympiad", "Tournament", "Workshop"];
  if (!validTypes.includes(productType)) {
    throw new ApiError(
      400,
      `productType must be one of: ${validTypes.join(", ")}`
    );
  }

  if (!title || !body) {
    throw new ApiError(400, "Title and body are required");
  }

  const result = await notificationService.sendNotificationToPurchasers(
    productType,
    title,
    body,
    { ...data, type: type || "general" },
    sentBy
  );

  const message =
    result.totalSent === 0
      ? result.message || "No purchasers found for this product"
      : `Notification sent to ${result.totalSent} purchasers`;

  return res.status(200).json(ApiResponse.success(result, message));
});

/**
 * Broadcast to all students, all teachers, or both (Admin).
 * Body: audience — "students" | "teachers" | "both" (default "students" for backward compatibility).
 */
export const sendNotificationToAllStudents = asyncHandler(async (req, res) => {
  const { title, body, type, data, audience = "students" } = req.body;
  const sentBy = req.user._id;

  if (!title || !body) {
    throw new ApiError(400, "Title and body are required");
  }

  const validAudiences = ["students", "teachers", "both"];
  if (!validAudiences.includes(audience)) {
    throw new ApiError(
      400,
      `audience must be one of: ${validAudiences.join(", ")}`
    );
  }

  const payload = { ...data, type: type || "general" };

  if (audience === "students") {
    const result = await notificationService.sendNotificationToAllStudents(
      title,
      body,
      payload,
      sentBy
    );
    return res.status(200).json(
      ApiResponse.success(result, "Notification sent to all students")
    );
  }

  if (audience === "teachers") {
    const result = await notificationService.sendNotificationToAllTeachers(
      title,
      body,
      payload,
      sentBy
    );
    return res.status(200).json(
      ApiResponse.success(result, "Notification sent to all teachers")
    );
  }

  let studentResult = { totalSent: 0, fcmSent: 0, fcmFailed: 0 };
  let teacherResult = { totalSent: 0, fcmSent: 0, fcmFailed: 0 };

  try {
    studentResult = await notificationService.sendNotificationToAllStudents(
      title,
      body,
      payload,
      sentBy
    );
  } catch (e) {
    if (e.message !== "No students found") throw e;
  }

  try {
    teacherResult = await notificationService.sendNotificationToAllTeachers(
      title,
      body,
      payload,
      sentBy
    );
  } catch (e) {
    if (e.message !== "No teachers found") throw e;
  }

  return res.status(200).json(
    ApiResponse.success(
      {
        students: studentResult,
        teachers: teacherResult,
        totalSent: studentResult.totalSent + teacherResult.totalSent,
        fcmSent: studentResult.fcmSent + teacherResult.fcmSent,
        fcmFailed: studentResult.fcmFailed + teacherResult.fcmFailed,
      },
      "Notification sent to all students and all teachers"
    )
  );
});

// ==================== STUDENT CONTROLLERS ====================

/**
 * Register/Update FCM token for current session (Student)
 */
export const registerFCMToken = asyncHandler(async (req, res) => {
  const { fcmToken } = req.body;
  const studentId = req.user._id;

  if (!fcmToken) {
    throw new ApiError(400, "FCM token is required");
  }

  await studentSessionRepository.updateFcmToken(studentId, fcmToken.trim());

  return res.status(200).json(
    ApiResponse.success(
      null,
      "FCM token registered successfully"
    )
  );
});

/**
 * Get all notifications for a student
 */
export const getMyNotifications = asyncHandler(async (req, res) => {
  const studentId = req.user._id;
  const { page = 1, limit = 20, isRead } = req.query;

  const result = await notificationService.getStudentNotifications(studentId, {
    page,
    limit,
    isRead,
    sortBy: "createdAt",
    sortOrder: "desc",
  });

  return res.status(200).json(
    ApiResponse.success(
      result.notifications,
      "Notifications fetched successfully",
      result.pagination
    )
  );
});

/**
 * Get unread notification count
 */
export const getUnreadCount = asyncHandler(async (req, res) => {
  const studentId = req.user._id;

  const count = await notificationService.getUnreadCount(studentId);

  return res.status(200).json(
    ApiResponse.success(
      { unreadCount: count },
      "Unread count fetched successfully"
    )
  );
});

/**
 * Mark notification as read
 */
export const markNotificationAsRead = asyncHandler(async (req, res) => {
  const { notificationId } = req.params;
  const studentId = req.user._id;

  const notification = await notificationService.markNotificationAsRead(
    notificationId,
    studentId
  );

  return res.status(200).json(
    ApiResponse.success(
      notification,
      "Notification marked as read"
    )
  );
});

/**
 * Mark all notifications as read
 */
export const markAllNotificationsAsRead = asyncHandler(async (req, res) => {
  const studentId = req.user._id;

  const result = await notificationService.markAllNotificationsAsRead(studentId);

  return res.status(200).json(
    ApiResponse.success(
      { modifiedCount: result.modifiedCount },
      "All notifications marked as read"
    )
  );
});

// ==================== TEACHER CONTROLLERS ====================

/**
 * List notifications for the logged-in teacher
 */
export const getTeacherMyNotifications = asyncHandler(async (req, res) => {
  const teacherId = req.user._id;
  const { page = 1, limit = 20, isRead } = req.query;

  const result = await notificationService.getTeacherNotifications(teacherId, {
    page,
    limit,
    isRead,
    sortBy: "createdAt",
    sortOrder: "desc",
  });

  return res.status(200).json(
    ApiResponse.success(
      result.notifications,
      "Notifications fetched successfully",
      result.pagination
    )
  );
});

/**
 * Unread count for teacher
 */
export const getTeacherUnreadCount = asyncHandler(async (req, res) => {
  const teacherId = req.user._id;
  const count = await notificationService.getTeacherUnreadCount(teacherId);

  return res.status(200).json(
    ApiResponse.success({ unreadCount: count }, "Unread count fetched successfully")
  );
});

/**
 * Mark one notification read (teacher)
 */
export const markTeacherNotificationAsRead = asyncHandler(async (req, res) => {
  const { notificationId } = req.params;
  const teacherId = req.user._id;

  let notification;
  try {
    notification = await notificationService.markTeacherNotificationAsRead(
      notificationId,
      teacherId
    );
  } catch (e) {
    const msg = e.message || "Could not update notification";
    if (msg === "Notification not found") throw new ApiError(404, msg);
    if (msg.includes("Unauthorized")) throw new ApiError(403, msg);
    throw new ApiError(400, msg);
  }

  return res
    .status(200)
    .json(ApiResponse.success(notification, "Notification marked as read"));
});

/**
 * Mark all notifications read (teacher)
 */
export const markAllTeacherNotificationsAsRead = asyncHandler(async (req, res) => {
  const teacherId = req.user._id;
  const result = await notificationService.markAllTeacherNotificationsAsRead(teacherId);

  return res.status(200).json(
    ApiResponse.success(
      { modifiedCount: result.modifiedCount },
      "All notifications marked as read"
    )
  );
});

