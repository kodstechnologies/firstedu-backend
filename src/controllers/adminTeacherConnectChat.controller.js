import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import adminTeacherConnectChatService from "../services/adminTeacherConnectChat.service.js";

export const getAdminStudentsWithChatLogs = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, search } = req.query;

  const result = await adminTeacherConnectChatService.getStudentsWithChatLogs(
    parseInt(page, 10),
    parseInt(limit, 10),
    search || null
  );

  return res.status(200).json(
    ApiResponse.success(
      result.students,
      "Students with chat logs fetched successfully",
      result.pagination
    )
  );
});

export const getAdminTeachersWithChatLogs = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, search } = req.query;

  const result = await adminTeacherConnectChatService.getTeachersWithChatLogs(
    parseInt(page, 10),
    parseInt(limit, 10),
    search || null
  );

  return res.status(200).json(
    ApiResponse.success(
      result.teachers,
      "Teachers with chat logs fetched successfully",
      result.pagination
    )
  );
});

export const getAdminStudentChatConversations = asyncHandler(async (req, res) => {
  const { studentId } = req.params;
  const { page = 1, limit = 20, search } = req.query;

  const result = await adminTeacherConnectChatService.getStudentTeacherConversations(
    studentId,
    parseInt(page, 10),
    parseInt(limit, 10),
    search || null
  );

  return res.status(200).json(
    ApiResponse.success(
      result.conversations,
      "Student chat conversations fetched successfully",
      result.pagination
    )
  );
});

export const getAdminTeacherChatConversations = asyncHandler(async (req, res) => {
  const { teacherId } = req.params;
  const { page = 1, limit = 20, search } = req.query;

  const result = await adminTeacherConnectChatService.getTeacherStudentConversations(
    teacherId,
    parseInt(page, 10),
    parseInt(limit, 10),
    search || null
  );

  return res.status(200).json(
    ApiResponse.success(
      result.conversations,
      "Teacher chat conversations fetched successfully",
      result.pagination
    )
  );
});

export const getAdminChatMessages = asyncHandler(async (req, res) => {
  const { studentId, teacherId } = req.params;
  const { page = 1, limit = 500 } = req.query;

  const result = await adminTeacherConnectChatService.getAdminChatMessages(
    studentId,
    teacherId,
    parseInt(page, 10),
    parseInt(limit, 10)
  );

  return res.status(200).json(
    ApiResponse.success(
      {
        messages: result.messages,
        sessions: result.sessions || [],
        student: result.student,
        teacher: result.teacher,
      },
      "Chat messages fetched successfully",
      result.pagination
    )
  );
});

export const getAdminStudentsWithCallLogs = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, search } = req.query;

  const result = await adminTeacherConnectChatService.getStudentsWithCallLogs(
    parseInt(page, 10),
    parseInt(limit, 10),
    search || null
  );

  return res.status(200).json(
    ApiResponse.success(
      result.students,
      "Students with call logs fetched successfully",
      result.pagination
    )
  );
});

export const getAdminTeachersWithCallLogs = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, search } = req.query;

  const result = await adminTeacherConnectChatService.getTeachersWithCallLogs(
    parseInt(page, 10),
    parseInt(limit, 10),
    search || null
  );

  return res.status(200).json(
    ApiResponse.success(
      result.teachers,
      "Teachers with call logs fetched successfully",
      result.pagination
    )
  );
});

export const getAdminStudentCallConversations = asyncHandler(async (req, res) => {
  const { studentId } = req.params;
  const { page = 1, limit = 20, search } = req.query;

  const result = await adminTeacherConnectChatService.getStudentTeacherCallConversations(
    studentId,
    parseInt(page, 10),
    parseInt(limit, 10),
    search || null
  );

  return res.status(200).json(
    ApiResponse.success(
      result.conversations,
      "Student call conversations fetched successfully",
      result.pagination
    )
  );
});

export const getAdminTeacherCallConversations = asyncHandler(async (req, res) => {
  const { teacherId } = req.params;
  const { page = 1, limit = 20, search } = req.query;

  const result = await adminTeacherConnectChatService.getTeacherStudentCallConversations(
    teacherId,
    parseInt(page, 10),
    parseInt(limit, 10),
    search || null
  );

  return res.status(200).json(
    ApiResponse.success(
      result.conversations,
      "Teacher call conversations fetched successfully",
      result.pagination
    )
  );
});

export const getAdminCallSessions = asyncHandler(async (req, res) => {
  const { studentId, teacherId } = req.params;
  const { page = 1, limit = 50 } = req.query;

  const result = await adminTeacherConnectChatService.getAdminCallSessions(
    studentId,
    teacherId,
    parseInt(page, 10),
    parseInt(limit, 10)
  );

  return res.status(200).json(
    ApiResponse.success(
      {
        calls: result.calls,
        student: result.student,
        teacher: result.teacher,
      },
      "Call sessions fetched successfully",
      result.pagination
    )
  );
});

export const downloadAdminCallRecording = asyncHandler(async (req, res) => {
  const { sessionId } = req.params;

  const { buffer, fileName } =
    await adminTeacherConnectChatService.getAdminCallRecordingDownload(sessionId);

  res.setHeader("Content-Type", "audio/mpeg");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${fileName.replace(/"/g, "")}"`
  );
  return res.send(buffer);
});

export default {
  getAdminStudentsWithChatLogs,
  getAdminTeachersWithChatLogs,
  getAdminStudentChatConversations,
  getAdminTeacherChatConversations,
  getAdminChatMessages,
  getAdminStudentsWithCallLogs,
  getAdminTeachersWithCallLogs,
  getAdminStudentCallConversations,
  getAdminTeacherCallConversations,
  getAdminCallSessions,
  downloadAdminCallRecording,
};
