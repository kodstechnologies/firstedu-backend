import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import studentRepository from "../repository/student.repository.js";
import examSessionRepository from "../repository/examSession.repository.js";

// List Students with pagination/search
export const getStudents = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10, search, status } = req.query;

  const filter = {};
  if (status && ["active", "banned"].includes(status)) {
    filter.status = status;
  }

  const [result, counts] = await Promise.all([
    studentRepository.findAll(filter, {
      page,
      limit,
      search,
      sortBy: "createdAt",
      sortOrder: "desc",
    }),
    studentRepository.getCounts(),
  ]);

  const meta = {
    ...result.pagination,
    totalUsers: counts.totalUsers,
    totalBannedUsers: counts.totalBannedUsers,
  };

  return res.status(200).json(
    ApiResponse.success(result.students, "Students fetched successfully", meta)
  );
});


// Get Student by ID
export const getStudentById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const student = await studentRepository.findById(id);

  if (!student) {
    throw new ApiError(404, "Student not found");
  }

  return res.status(200).json(
    ApiResponse.success(student, "Student fetched successfully")
  );
});

// Get a student's test (exam) history
export const getStudentTestHistory = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { page = 1, limit = 10, status } = req.query;

  const student = await studentRepository.findById(id);
  if (!student) {
    throw new ApiError(404, "Student not found");
  }

  const query = { student: id };
  if (status) {
    query.status = status;
  }

  const result = await examSessionRepository.findAll(query, {
    page,
    limit,
    sortBy: "createdAt",
    sortOrder: "desc",
  });

  // Populate test field
  const sessions = await Promise.all(
    result.sessions.map(async (session) => {
      const populated = await examSessionRepository.findById(session._id, {
        test: "title durationMinutes questionBank",
      });
      return populated;
    })
  );

  return res.status(200).json(
    ApiResponse.success(sessions, "Test history fetched successfully", result.pagination)
  );
});

// Update student status (ban/unban)
export const updateStudentStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!status || !["active", "banned"].includes(status)) {
    throw new ApiError(400, "status must be 'active' or 'banned'");
  }

  const student = await studentRepository.findById(id);
  if (!student) {
    throw new ApiError(404, "Student not found");
  }

  const updateData =
    status === "banned"
      ? { $set: { status: "banned" }, $unset: { refreshToken: 1 } }
      : { $set: { status: "active" } };

  const updated = await studentRepository.updateById(id, updateData);
  return res.status(200).json(
    ApiResponse.success(updated, `Student ${status === "banned" ? "banned" : "activated"} successfully`)
  );
});

// Get proctor logs for a specific exam session
export const getProctorLogs = asyncHandler(async (req, res) => {
  const { sessionId } = req.params;

  const session = await examSessionRepository.findById(sessionId, {
    student: "name email phone",
    test: "title",
  });

  if (!session) {
    throw new ApiError(404, "Exam session not found");
  }

  return res.status(200).json(
    ApiResponse.success(
      {
        sessionId: session._id,
        student: session.student,
        test: session.test,
        proctoringEvents: session.proctoringEvents || [],
      },
      "Proctor logs fetched successfully"
    )
  );
});

export default {
  getStudents,
  getStudentById,
  getStudentTestHistory,
  getProctorLogs,
  updateStudentStatus,
};


