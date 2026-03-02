import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import * as notificationService from "../services/notification.service.js";
import studentSessionRepository from "../repository/studentSession.repository.js";

// ==================== ADMIN CONTROLLERS ====================

/**
 * Send notification to a single student (Admin)
 */
export const sendNotificationToStudent = asyncHandler(async (req, res) => {
  const { studentId, title, body, type, data } = req.body;
  const sentBy = req.user._id;

  if (!studentId || !title || !body) {
    throw new ApiError(400, "Student ID, title, and body are required");
  }

  const result = await notificationService.sendNotificationToStudent(
    studentId,
    title,
    body,
    { ...data, type: type || "general" },
    sentBy
  );

  return res.status(200).json(
    ApiResponse.success(
      result,
      "Notification sent successfully"
    )
  );
});

/**
 * Send notification to multiple students (Admin)
 */
export const sendNotificationToMultipleStudents = asyncHandler(async (req, res) => {
  const { studentIds, title, body, type, data } = req.body;
  const sentBy = req.user._id;

  if (!studentIds || !Array.isArray(studentIds) || studentIds.length === 0) {
    throw new ApiError(400, "Student IDs array is required");
  }

  if (!title || !body) {
    throw new ApiError(400, "Title and body are required");
  }

  const result = await notificationService.sendNotificationToMultipleStudents(
    studentIds,
    title,
    body,
    { ...data, type: type || "general" },
    sentBy
  );

  return res.status(200).json(
    ApiResponse.success(
      result,
      `Notification sent to ${result.totalSent} students`
    )
  );
});

/**
 * Send notification to all students (Admin)
 */
export const sendNotificationToAllStudents = asyncHandler(async (req, res) => {
  const { title, body, type, data } = req.body;
  const sentBy = req.user._id;

  if (!title || !body) {
    throw new ApiError(400, "Title and body are required");
  }

  const result = await notificationService.sendNotificationToAllStudents(
    title,
    body,
    { ...data, type: type || "general" },
    sentBy
  );

  return res.status(200).json(
    ApiResponse.success(
      result,
      `Notification sent to all students`
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

