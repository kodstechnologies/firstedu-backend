import { ApiError } from "../utils/ApiError.js";
import courseRepository from "../repository/course.repository.js";
import courseTestLinkRepository from "../repository/courseTestLink.repository.js";
import testRepository from "../repository/test.repository.js";
import {
  uploadPDFToCloudinary,
  uploadImageToCloudinary,
  uploadVideoToCloudinary,
  uploadAudioToCloudinary,
  deleteFileFromCloudinary,
} from "../utils/s3Upload.js";

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
    isCertification:
      data.isCertification === true || data.isCertification === "true",
    categoryIds: data.categoryIds || [],
    createdBy: adminId,
  });
  // Handle optional certification test links
  if (
    course.isCertification &&
    Array.isArray(data.certificationTestIds) &&
    data.certificationTestIds.length > 0
  ) {
    await syncCertificationTestsForCourse(
      course._id,
      data.certificationTestIds,
      adminId
    );
  }
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
  if (data.isCertification !== undefined) {
    updateData.isCertification =
      data.isCertification === true || data.isCertification === "true";
  }

  const updatedCourse = await courseRepository.updateById(id, updateData);

  // If certification flag or test list provided, sync links
  if (
    updatedCourse.isCertification &&
    Array.isArray(data.certificationTestIds)
  ) {
    await syncCertificationTestsForCourse(
      updatedCourse._id,
      data.certificationTestIds,
      existingCourse.createdBy || null
    );
  } else if (!updatedCourse.isCertification) {
    // If course is no longer certification, remove all links
    await courseTestLinkRepository.deleteMany?.({ course: updatedCourse._id });
  }

  return updatedCourse;
};

/**
 * Ensure CourseTestLink rows match the provided certificationTestIds.
 * Validates that each test exists, is published, and applicableFor === "certificate".
 */
const syncCertificationTestsForCourse = async (courseId, testIds, adminId) => {
  const uniqueIds = [...new Set(testIds.map((id) => id.toString()))];

  const tests = await Promise.all(
    uniqueIds.map((id) => testRepository.findTestById(id))
  );

  for (let i = 0; i < uniqueIds.length; i++) {
    const test = tests[i];
    const id = uniqueIds[i];
    if (!test) {
      throw new ApiError(404, `Certification test not found: ${id}`);
    }
    if (test.applicableFor !== "certificate") {
      throw new ApiError(
        400,
        `Test ${test.title} is not marked as applicableFor=\"certificate\"`
      );
    }
    if (!test.isPublished) {
      throw new ApiError(
        400,
        `Test ${test.title} must be published before linking as certification test`
      );
    }
  }

  // Remove existing links not in the new list, and create missing ones
  const existingLinks = await courseTestLinkRepository.findAll({
    course: courseId,
  });

  const existingTestIdSet = new Set(
    existingLinks.map((l) => l.test.toString())
  );

  const toRemove = existingLinks.filter(
    (l) => !uniqueIds.includes(l.test.toString())
  );
  const toAdd = uniqueIds.filter((id) => !existingTestIdSet.has(id));

  for (const link of toRemove) {
    await courseTestLinkRepository.deleteById(link._id);
  }

  let order = 0;
  for (const testId of uniqueIds) {
    if (!toAdd.includes(testId)) continue;
    await courseTestLinkRepository.create({
      course: courseId,
      test: testId,
      order,
      isRequired: true,
      createdBy: adminId,
    });
    order += 1;
  }
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


