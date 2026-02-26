import { ApiError } from "../utils/ApiError.js";
import workshopRepository from "../repository/workshop.repository.js";
import teacherRepository from "../repository/teacher.repository.js";
import {
  uploadImageToCloudinary,
  deleteFileFromCloudinary,
} from "../utils/cloudinaryUpload.js";

const WORKSHOPS_IMAGE_FOLDER = "workshops";

export const createWorkshop = async (data, adminId, file) => {
  const {
    title,
    description,
    teacherId,
    startTime,
    endTime,
    meetingLink,
    meetingPassword,
    price,
    maxParticipants,
    registrationStartTime,
    registrationEndTime,
    eventType,
  } = data;

  if (!title || !teacherId || !startTime || !endTime || !meetingLink) {
    throw new ApiError(400, "Missing required fields");
  }

  if (!registrationStartTime || !registrationEndTime) {
    throw new ApiError(400, "Registration times are required");
  }

  // Validate teacher exists
  const teacher = await teacherRepository.findById(teacherId);
  if (!teacher) {
    throw new ApiError(404, "Teacher not found");
  }

  // Validate time ranges
  if (new Date(startTime) >= new Date(endTime)) {
    throw new ApiError(400, "End time must be after start time");
  }

  if (new Date(registrationStartTime) >= new Date(registrationEndTime)) {
    throw new ApiError(400, "Registration end time must be after start time");
  }

  if (new Date(registrationEndTime) > new Date(startTime)) {
    throw new ApiError(400, "Registration must end before event starts");
  }

  let imageUrl = null;
  if (file) {
    imageUrl = await uploadImageToCloudinary(
      file.buffer,
      file.originalname,
      WORKSHOPS_IMAGE_FOLDER,
      file.mimetype
    );
  }

  return await workshopRepository.create({
    title,
    description,
    imageUrl,
    teacher: teacherId,
    startTime,
    endTime,
    meetingLink,
    meetingPassword: meetingPassword || null,
    price: price || 0,
    maxParticipants: maxParticipants || null,
    registrationStartTime,
    registrationEndTime,
    eventType: eventType || "workshop",
    createdBy: adminId,
  });
};

export const getWorkshops = async (options = {}) => {
  const { page = 1, limit = 10, search, isPublished, eventType, teacherId } = options;

  const query = {};
  if (search) {
    query.$or = [
      { title: { $regex: search, $options: "i" } },
      { description: { $regex: search, $options: "i" } },
    ];
  }
  if (isPublished !== undefined) {
    query.isPublished = isPublished === "true" || isPublished === true;
  }
  if (eventType) {
    query.eventType = eventType;
  }
  if (teacherId) {
    query.teacher = teacherId;
  }

  const pageNum = parseInt(page);
  const limitNum = parseInt(limit);
  const skip = (pageNum - 1) * limitNum;

  const [workshops, total] = await Promise.all([
    workshopRepository.find(query, {
      populate: [
        { path: "teacher", select: "name email skills" },
        { path: "createdBy", select: "name email" },
      ],
      sort: { createdAt: -1 },
      skip,
      limit: limitNum,
    }),
    workshopRepository.count(query),
  ]);

  return {
    workshops,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      pages: Math.ceil(total / limitNum) || 1,
    },
  };
};

export const getWorkshopById = async (id) => {
  const workshop = await workshopRepository.findById(id, [
    { path: "teacher", select: "name email skills perMinuteRate" },
    { path: "createdBy", select: "name email" },
  ]);

  if (!workshop) {
    throw new ApiError(404, "Workshop not found");
  }
  return workshop;
};

export const updateWorkshop = async (id, updateData, file) => {
  const workshop = await workshopRepository.findById(id);
  if (!workshop) {
    throw new ApiError(404, "Workshop not found");
  }

  if (file) {
    if (workshop.imageUrl) {
      await deleteFileFromCloudinary(workshop.imageUrl);
    }
    updateData.imageUrl = await uploadImageToCloudinary(
      file.buffer,
      file.originalname,
      WORKSHOPS_IMAGE_FOLDER,
      file.mimetype
    );
  }

  // Validate teacher if provided
  if (updateData.teacherId) {
    const teacher = await teacherRepository.findById(updateData.teacherId);
    if (!teacher) {
      throw new ApiError(404, "Teacher not found");
    }
    updateData.teacher = updateData.teacherId;
    delete updateData.teacherId;
  }

  // Validate time ranges if provided
  if (updateData.startTime && updateData.endTime) {
    if (new Date(updateData.startTime) >= new Date(updateData.endTime)) {
      throw new ApiError(400, "End time must be after start time");
    }
  }

  return await workshopRepository.updateById(id, updateData);
};

export const deleteWorkshop = async (id) => {
  const workshop = await workshopRepository.findById(id);
  if (!workshop) {
    throw new ApiError(404, "Workshop not found");
  }
  if (workshop.imageUrl) {
    await deleteFileFromCloudinary(workshop.imageUrl);
  }
  return await workshopRepository.deleteById(id);
};

export default {
  createWorkshop,
  getWorkshops,
  getWorkshopById,
  updateWorkshop,
  deleteWorkshop,
};

