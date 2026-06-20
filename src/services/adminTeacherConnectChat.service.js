import { ApiError } from "../utils/ApiError.js";
import teacherChatMessageRepository from "../repository/teacherChatMessage.repository.js";
import teacherSessionRepository from "../repository/teacherSession.repository.js";
import teacherRepository from "../repository/teacher.repository.js";
import Student from "../models/Student.js";
import teacherConnectService from "./teacherConnect.service.js";
export const getStudentsWithChatLogs = async (page = 1, limit = 20, search = null) => {
  return teacherChatMessageRepository.findStudentsWithChats({ page, limit, search });
};

export const getTeachersWithChatLogs = async (page = 1, limit = 20, search = null) => {
  return teacherChatMessageRepository.findTeachersWithChats({ page, limit, search });
};

export const getStudentTeacherConversations = async (
  studentId,
  page = 1,
  limit = 20,
  search = null
) => {
  const student = await Student.findById(studentId).select("name").lean();
  if (!student) {
    throw new ApiError(404, "Student not found");
  }

  return teacherChatMessageRepository.findConversationsByStudent(studentId, {
    page,
    limit,
    search,
  });
};

export const getTeacherStudentConversations = async (
  teacherId,
  page = 1,
  limit = 20,
  search = null
) => {
  const teacher = await teacherRepository.findById(teacherId);
  if (!teacher) {
    throw new ApiError(404, "Teacher not found");
  }

  return teacherChatMessageRepository.findConversationsByTeacher(teacherId, {
    page,
    limit,
    search,
  });
};

export const getAdminChatMessages = async (
  studentId,
  teacherId,
  page = 1,
  limit = 200
) => {
  const [student, teacher] = await Promise.all([
    Student.findById(studentId).select("name").lean(),
    teacherRepository.findById(teacherId),
  ]);

  if (!student) {
    throw new ApiError(404, "Student not found");
  }
  if (!teacher) {
    throw new ApiError(404, "Teacher not found");
  }

  const result = await teacherChatMessageRepository.findByStudentAndTeacher(
    studentId,
    teacherId,
    { page, limit, sortOrder: "asc" }
  );

  if (result.messages.length === 0) {
    throw new ApiError(404, "No chat messages found for this conversation");
  }

  return {
    ...result,
    student: {
      _id: student._id,
      name: student.name,
    },
    teacher: {
      _id: teacher._id,
      name: teacher.name,
      profileImage: teacher.profileImage,
      skills: teacher.skills,
    },
  };
};

export const getStudentsWithCallLogs = async (page = 1, limit = 20, search = null) => {
  return teacherSessionRepository.findStudentsWithCallLogs({ page, limit, search });
};

export const getTeachersWithCallLogs = async (page = 1, limit = 20, search = null) => {
  return teacherSessionRepository.findTeachersWithCallLogs({ page, limit, search });
};

export const getStudentTeacherCallConversations = async (
  studentId,
  page = 1,
  limit = 20,
  search = null
) => {
  const student = await Student.findById(studentId).select("name").lean();
  if (!student) {
    throw new ApiError(404, "Student not found");
  }

  return teacherSessionRepository.findCallConversationsByStudent(studentId, {
    page,
    limit,
    search,
    requireRecording: false,
  });
};

export const getTeacherStudentCallConversations = async (
  teacherId,
  page = 1,
  limit = 20,
  search = null
) => {
  const teacher = await teacherRepository.findById(teacherId);
  if (!teacher) {
    throw new ApiError(404, "Teacher not found");
  }

  return teacherSessionRepository.findCallConversationsByTeacher(teacherId, {
    page,
    limit,
    search,
  });
};

export const getAdminCallSessions = async (
  studentId,
  teacherId,
  page = 1,
  limit = 50
) => {
  const [student, teacher] = await Promise.all([
    Student.findById(studentId).select("name email phone profileImage").lean(),
    teacherRepository.findById(teacherId),
  ]);

  if (!student) {
    throw new ApiError(404, "Student not found");
  }
  if (!teacher) {
    throw new ApiError(404, "Teacher not found");
  }

  const result = await teacherSessionRepository.findCallSessionsByStudentAndTeacher(
    studentId,
    teacherId,
    { page, limit }
  );

  if (result.calls.length === 0) {
    throw new ApiError(404, "No call sessions found for this pair");
  }

  const calls = await teacherConnectService.hydrateCallRecordingsAsMp3(result.calls);

  return {
    calls,
    pagination: result.pagination,
    student: {
      _id: student._id,
      name: student.name,
      email: student.email,
      phone: student.phone,
      profileImage: student.profileImage,
    },
    teacher: {
      _id: teacher._id,
      name: teacher.name,
      profileImage: teacher.profileImage,
      skills: teacher.skills,
    },
  };
};

export const getAdminCallRecordingDownload = async (sessionId) => {
  const session = await teacherSessionRepository.findById(sessionId);
  if (!session || session.sessionKind !== "call") {
    throw new ApiError(404, "Call session not found");
  }
  if (!session.recordingUrl) {
    throw new ApiError(404, "No recording available for this call");
  }

  const studentId = session.student?._id ?? session.student;
  return teacherConnectService.getCallRecordingMp3Download(studentId, sessionId);
};

export default {
  getStudentsWithChatLogs,
  getTeachersWithChatLogs,
  getStudentTeacherConversations,
  getTeacherStudentConversations,
  getAdminChatMessages,
  getStudentsWithCallLogs,
  getTeachersWithCallLogs,
  getStudentTeacherCallConversations,
  getTeacherStudentCallConversations,
  getAdminCallSessions,
  getAdminCallRecordingDownload,
};
