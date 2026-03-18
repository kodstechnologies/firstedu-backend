import { ApiError } from "../utils/ApiError.js";
import courseRepository from "../repository/course.repository.js";
import {
  uploadPDFToCloudinary,
  uploadImageToCloudinary,
  uploadVideoToCloudinary,
  uploadAudioToCloudinary,
  deleteFileFromCloudinary,
} from "../utils/cloudinaryUpload.js";

const isVideo = (m) => m && m.startsWith("video/");
const isAudio = (m) => m && m.startsWith("audio/");

/** Study material only: PDF, video, or audio (no image) */
async function uploadStudyMaterialFile(file) {
  const { mimetype, buffer, originalname } = file;
  const folder = "courses";
  if (mimetype === "application/pdf") {
    return { url: await uploadPDFToCloudinary(buffer, originalname, folder), contentType: "pdf" };
  }
  if (isVideo(mimetype)) {
    return { url: await uploadVideoToCloudinary(buffer, originalname, folder), contentType: "video" };
  }
  if (isAudio(mimetype)) {
    return { url: await uploadAudioToCloudinary(buffer, originalname, folder), contentType: "audio" };
  }
  throw new ApiError(400, "Study material must be PDF, video, or audio");
}

export const createCourse = async (data, adminId, files) => {
  const studyFile = files?.pdf?.[0];
  if (!studyFile) {
    throw new ApiError(400, "Study material file is required (PDF, video, or audio)");
  }

  const { url: contentUrl, contentType } = await uploadStudyMaterialFile(studyFile);

  let imageUrl = null;
  const imageFile = files?.image?.[0];
  if (imageFile) {
    imageUrl = await uploadImageToCloudinary(
      imageFile.buffer,
      imageFile.originalname,
      "courses",
      imageFile.mimetype
    );
  }

  const course = await courseRepository.create({
    title: data.title,
    description: data.description,
    imageUrl,
    contentUrl,
    contentType: contentType || "pdf",
    price: data.price || 0,
    isPublished: data.isPublished === true || data.isPublished === "true",
    categoryIds: data.categoryIds || [],
    createdBy: adminId,
  });
  return course;
};

export const getCourses = async (options = {}) => {
  return await courseRepository.findAll({}, options);
};

export const getCourseById = async (id) => {
  const course = await courseRepository.findById(id);
  if (!course) {
    throw new ApiError(404, "Course not found");
  }
  return course;
};

export const updateCourse = async (id, data, files) => {
  const existingCourse = await courseRepository.findById(id);
  if (!existingCourse) {
    throw new ApiError(404, "Course not found");
  }

  let contentUrl = data.contentUrl || existingCourse.contentUrl;
  let contentType = existingCourse.contentType || "pdf";
  let imageUrl = existingCourse.imageUrl || null;

  const studyFile = files?.pdf?.[0];
  if (studyFile) {
    if (existingCourse.contentUrl) {
      await deleteFileFromCloudinary(existingCourse.contentUrl);
    }
    const result = await uploadStudyMaterialFile(studyFile);
    contentUrl = result.url;
    contentType = result.contentType;
  }

  const imageFile = files?.image?.[0];
  if (imageFile) {
    if (existingCourse.imageUrl) {
      await deleteFileFromCloudinary(existingCourse.imageUrl);
    }
    imageUrl = await uploadImageToCloudinary(
      imageFile.buffer,
      imageFile.originalname,
      "courses",
      imageFile.mimetype
    );
  }

  const updateData = {
    ...data,
    contentUrl,
    contentType,
    imageUrl,
  };
  if (data.price !== undefined) {
    updateData.price = data.price;
  }
  if (data.categoryIds !== undefined) {
    updateData.categoryIds = data.categoryIds;
  }

  return await courseRepository.updateById(id, updateData);
};

export const deleteCourse = async (id) => {
  const course = await courseRepository.findById(id);
  if (!course) {
    throw new ApiError(404, "Course not found");
  }

  if (course.imageUrl) {
    await deleteFileFromCloudinary(course.imageUrl);
  }
  if (course.contentUrl) {
    await deleteFileFromCloudinary(course.contentUrl);
  }

  await courseRepository.deleteById(id);
  return true;
};

export default {
  createCourse,
  getCourses,
  getCourseById,
  updateCourse,
  deleteCourse,
};


