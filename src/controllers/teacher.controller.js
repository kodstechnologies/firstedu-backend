import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import bcrypt from "bcrypt";
import teacherRepository from "../repository/teacher.repository.js";
import teacherValidator from "../validation/teacher.validator.js";
import { uploadImageToCloudinary } from "../utils/cloudinaryUpload.js";
import { sendTeacherApprovalWithCredentialsEmail } from "../utils/sendEmail.js";

function parseSkills(skills) {
  if (Array.isArray(skills)) return skills;
  if (typeof skills === "string") {
    try {
      const parsed = JSON.parse(skills);
      return Array.isArray(parsed) ? parsed : skills.split(",").map((s) => s.trim()).filter(Boolean);
    } catch {
      return skills.split(",").map((s) => s.trim()).filter(Boolean);
    }
  }
  return [];
}

// Create Teacher (Admin only) – name, about, experience, salaryPerMinute, language, profileImage, skills, hiringFor, email, gender, password
export const createTeacher = asyncHandler(async (req, res) => {
  const body = { ...req.body };
  if (typeof body.skills === "string") {
    try {
      body.skills = JSON.parse(body.skills);
    } catch {
      body.skills = body.skills ? body.skills.split(",").map((s) => s.trim()).filter(Boolean) : [];
    }
  }
  const { error, value } = teacherValidator.adminCreateTeacher.validate(body);
  if (error) {
    throw new ApiError(400, "Validation Error", error.details.map((x) => x.message));
  }

  let profileImageUrl = null;
  const profileImageFile = req.file;
  if (profileImageFile && profileImageFile.buffer) {
    if (!profileImageFile.mimetype.startsWith("image/")) {
      throw new ApiError(400, "Profile image must be an image file");
    }
    profileImageUrl = await uploadImageToCloudinary(
      profileImageFile.buffer,
      profileImageFile.originalname,
      "teacher-profile-images",
      profileImageFile.mimetype
    );
  }

  const teacherData = {
    name: value.name,
    email: value.email,
    password: value.password,
    gender: value.gender,
    about: value.about || null,
    experience: value.experience || null,
    language: value.language || null,
    hiringFor: value.hiringFor || null,
    perMinuteRate: value.salaryPerMinute != null ? Number(value.salaryPerMinute) : 0,
    skills: parseSkills(value.skills || []),
    profileImage: profileImageUrl,
    status: "approved",
  };

  const teacher = await teacherRepository.create(teacherData);
  return res
    .status(201)
    .json(ApiResponse.success(teacher, "Teacher created successfully"));
});

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

// Update Teacher (Admin: name, about, experience, salaryPerMinute, language, profileImage, skills, hiringFor, email, gender, password)
export const updateTeacher = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const body = { ...req.body };
  if (typeof body.skills === "string") {
    try {
      body.skills = JSON.parse(body.skills);
    } catch {
      body.skills = body.skills ? body.skills.split(",").map((s) => s.trim()).filter(Boolean) : [];
    }
  }
  const { error, value } = teacherValidator.adminUpdateTeacher.validate(body);
  if (error) {
    throw new ApiError(400, "Validation Error", error.details.map((x) => x.message));
  }

  const updateData = {};
  if (value.name !== undefined) updateData.name = value.name;
  if (value.email !== undefined) updateData.email = value.email;
  if (value.password !== undefined) updateData.password = value.password;
  if (value.gender !== undefined) updateData.gender = value.gender;
  if (value.about !== undefined) updateData.about = value.about;
  if (value.experience !== undefined) updateData.experience = value.experience;
  if (value.language !== undefined) updateData.language = value.language;
  if (value.hiringFor !== undefined) updateData.hiringFor = value.hiringFor;
  if (value.salaryPerMinute !== undefined) updateData.perMinuteRate = Number(value.salaryPerMinute);
  if (value.skills !== undefined) updateData.skills = parseSkills(value.skills);
  if (value.password !== undefined) {
    const salt = await bcrypt.genSalt(10);
    updateData.password = await bcrypt.hash(value.password, salt);
  }

  const profileImageFile = req.file;
  if (profileImageFile && profileImageFile.buffer) {
    if (!profileImageFile.mimetype.startsWith("image/")) {
      throw new ApiError(400, "Profile image must be an image file");
    }
    updateData.profileImage = await uploadImageToCloudinary(
      profileImageFile.buffer,
      profileImageFile.originalname,
      "teacher-profile-images",
      profileImageFile.mimetype
    );
  }

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

// Send login credentials to teacher email (Admin only) – uses password from request body (e.g. admin-created password)
export const sendLoginCredentials = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { error, value } = teacherValidator.sendCredentials.validate(req.body);
  if (error) {
    throw new ApiError(400, "Validation Error", error.details.map((x) => x.message));
  }

  const teacher = await teacherRepository.findById(id, true);
  if (!teacher) {
    throw new ApiError(404, "Teacher not found");
  }

  teacher.password = value.password;
  await teacherRepository.save(teacher);

  await sendTeacherApprovalWithCredentialsEmail({
    toEmail: teacher.email,
    teacherName: teacher.name,
    email: teacher.email,
    password: value.password,
  });

  return res
    .status(200)
    .json(ApiResponse.success(null, "Login credentials sent to teacher email"));
});

export default {
  createTeacher,
  getTeachers,
  getTeacherById,
  approveTeacher,
  rejectTeacher,
  updatePerMinuteRate,
  updateTeacher,
  deleteTeacher,
  sendLoginCredentials,
};

