import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import teacherRepository from "../repository/teacher.repository.js";

// Get All Teachers (with pagination, search, filters)
export const getTeachers = asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 10,
    search,
    status,
    sortBy = "createdAt",
    sortOrder = "desc",
  } = req.query;

  const result = await teacherRepository.findAll({}, {
    page,
    limit,
    search,
    status,
    sortBy,
    sortOrder,
  });

  return res.status(200).json(
    ApiResponse.success(
      result.teachers,
      "Teachers fetched successfully",
      result.pagination
    )
  );
});

// Get Teacher by ID
export const getTeacherById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const teacher = await teacherRepository.findById(id);

  if (!teacher) {
    throw new ApiError(404, "Teacher not found");
  }

  return res
    .status(200)
    .json(ApiResponse.success(teacher, "Teacher fetched successfully"));
});

// Approve Teacher
export const approveTeacher = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const teacher = await teacherRepository.findById(id, true);

  if (!teacher) {
    throw new ApiError(404, "Teacher not found");
  }

  if (teacher.status === "approved") {
    throw new ApiError(400, "Teacher is already approved");
  }

  teacher.status = "approved";
  await teacherRepository.save(teacher);

  const updatedTeacher = await teacherRepository.findById(id);

  return res
    .status(200)
    .json(
      ApiResponse.success(
        updatedTeacher,
        "Teacher approved successfully"
      )
    );
});

// Reject Teacher
export const rejectTeacher = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const teacher = await teacherRepository.findById(id, true);

  if (!teacher) {
    throw new ApiError(404, "Teacher not found");
  }

  if (teacher.status === "rejected") {
    throw new ApiError(400, "Teacher is already rejected");
  }

  teacher.status = "rejected";
  await teacherRepository.save(teacher);

  const updatedTeacher = await teacherRepository.findById(id);

  return res
    .status(200)
    .json(
      ApiResponse.success(
        updatedTeacher,
        "Teacher rejected successfully"
      )
    );
});

// Set/Update Teacher Per Minute Rate
export const updatePerMinuteRate = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { perMinuteRate } = req.body;

  if (perMinuteRate === undefined || perMinuteRate === null) {
    throw new ApiError(400, "perMinuteRate is required in request body");
  }

  if (typeof perMinuteRate !== "number" && isNaN(parseFloat(perMinuteRate))) {
    throw new ApiError(400, "perMinuteRate must be a valid number");
  }

  const rate = parseFloat(perMinuteRate);
  if (rate < 0) {
    throw new ApiError(400, "perMinuteRate must be >= 0");
  }

  const teacher = await teacherRepository.findById(id, true);

  if (!teacher) {
    throw new ApiError(404, "Teacher not found");
  }

  teacher.perMinuteRate = rate;
  await teacherRepository.save(teacher);

  const updatedTeacher = await teacherRepository.findById(id);

  return res
    .status(200)
    .json(
      ApiResponse.success(
        updatedTeacher,
        "Per minute rate set successfully"
      )
    );
});

// Update Teacher (Admin can update name, phone, skills, perMinuteRate)
export const updateTeacher = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name, phone, skills, perMinuteRate } = req.body;

  const updateData = {};
  if (name !== undefined) updateData.name = name;
  if (phone !== undefined) updateData.phone = phone;
  if (skills !== undefined) updateData.skills = skills;
  if (perMinuteRate !== undefined) updateData.perMinuteRate = parseFloat(perMinuteRate);

  if (Object.keys(updateData).length === 0) {
    throw new ApiError(400, "No valid fields to update");
  }

  const teacher = await teacherRepository.updateById(id, updateData);

  if (!teacher) {
    throw new ApiError(404, "Teacher not found");
  }

  return res
    .status(200)
    .json(ApiResponse.success(teacher, "Teacher updated successfully"));
});

// Delete Teacher
export const deleteTeacher = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const deleted = await teacherRepository.deleteById(id);

  if (!deleted) {
    throw new ApiError(404, "Teacher not found");
  }

  return res
    .status(200)
    .json(ApiResponse.success(null, "Teacher deleted successfully"));
});

// Get Teacher Resume (Admin only)
export const getTeacherResume = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const teacher = await teacherRepository.findById(id);

  if (!teacher) {
    throw new ApiError(404, "Teacher not found");
  }

  if (!teacher.resumeUrl) {
    throw new ApiError(404, "Resume not found for this teacher");
  }

  // Return the resume URL so admin can view/download it
  return res
    .status(200)
    .json(
      ApiResponse.success(
        { resumeUrl: teacher.resumeUrl },
        "Resume URL fetched successfully"
      )
    );
});

export default {
  getTeachers,
  getTeacherById,
  approveTeacher,
  rejectTeacher,
  updatePerMinuteRate,
  updateTeacher,
  deleteTeacher,
  getTeacherResume,
};

