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
    return { url: await uploadPDFToCloudinary(buffer, originalname, folder), contentType: "pdf", originalName: originalname };
  }
  if (isVideo(mimetype)) {
    return { url: await uploadVideoToCloudinary(buffer, originalname, folder), contentType: "video", originalName: originalname };
  }
  if (isAudio(mimetype)) {
    return { url: await uploadAudioToCloudinary(buffer, originalname, folder), contentType: "audio", originalName: originalname };
  }
  throw new ApiError(400, "Study material must be PDF, video, or audio");
}

/**
 * Parse syllabus from FormData. It comes as a JSON string via FormData,
 * or as a direct array when sent as JSON body.
 */
function parseSyllabus(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.filter((s) => typeof s === "string" && s.trim());
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.filter((s) => typeof s === "string" && s.trim());
    } catch {
      // Not JSON — treat as single point
      return raw.trim() ? [raw.trim()] : [];
    }
  }
  return [];
}

/** Normalise certificationTestIds — multer may deliver a single string instead of an array */
function normaliseCertTestIds(raw) {
  if (!raw) return null;
  return Array.isArray(raw) ? raw : [raw];
}

export const createCourse = async (data, adminId, files) => {
  const studyFiles = files?.pdf || [];
  if (studyFiles.length === 0) {
    throw new ApiError(400, "At least one study material file is required (PDF, video, or audio)");
  }

  // Upload all study material files
  const uploadedContents = [];
  for (const file of studyFiles) {
    const result = await uploadStudyMaterialFile(file);
    uploadedContents.push({
      url: result.url,
      type: result.contentType,
      originalName: result.originalName,
    });
  }

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

  const syllabus = parseSyllabus(data.syllabus);

  const course = await courseRepository.create({
    title: data.title,
    description: data.description,
    syllabus,
    imageUrl,
    contents: uploadedContents,
    price: data.price || 0,
    isPublished: data.isPublished === true || data.isPublished === "true",
    isCertification:
      data.isCertification === true || data.isCertification === "true",
    categoryIds: data.categoryIds || [],
    createdBy: adminId,
  });

  const certTestIds = normaliseCertTestIds(data.certificationTestIds);
  // Handle optional certification test links
  if (
    course.isCertification &&
    certTestIds &&
    certTestIds.length > 0
  ) {
    await syncCertificationTestsForCourse(
      course._id,
      certTestIds,
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

  const courseObj = course.toObject ? course.toObject() : course;

  if (course.isCertification) {
    const links = await courseTestLinkRepository.findAll({ course: id });
    courseObj.certificationTestIds = links.map((link) => link.test?._id || link.test);
  }

  return courseObj;
};

export const updateCourse = async (id, data, files) => {
  const existingCourse = await courseRepository.findById(id);
  if (!existingCourse) {
    throw new ApiError(404, "Course not found");
  }

  let imageUrl = existingCourse.imageUrl || null;

  // Handle new study material files
  const studyFiles = files?.pdf || [];
  let contents = existingCourse.contents || [];

  if (studyFiles.length > 0) {
    // Delete all old content files
    for (const c of existingCourse.contents || []) {
      if (c.url) {
        await deleteFileFromCloudinary(c.url);
      }
    }

    // Upload all new files
    const uploadedContents = [];
    for (const file of studyFiles) {
      const result = await uploadStudyMaterialFile(file);
      uploadedContents.push({
        url: result.url,
        type: result.contentType,
        originalName: result.originalName,
      });
    }
    contents = uploadedContents;
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
    contents,
    imageUrl,
  };

  // Parse syllabus if provided
  if (data.syllabus !== undefined) {
    updateData.syllabus = parseSyllabus(data.syllabus);
  }

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

  const certTestIds = normaliseCertTestIds(data.certificationTestIds);
  // If certification flag or test list provided, sync links
  if (
    updatedCourse.isCertification &&
    certTestIds
  ) {
    await syncCertificationTestsForCourse(
      updatedCourse._id,
      certTestIds,
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

  const getTestIdStr = (l) => (l.test?._id || l.test).toString();

  const existingTestIdSet = new Set(
    existingLinks.map(getTestIdStr)
  );

  const toRemove = existingLinks.filter(
    (l) => !uniqueIds.includes(getTestIdStr(l))
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
  // Delete all content files
  for (const c of course.contents || []) {
    if (c.url) {
      await deleteFileFromCloudinary(c.url);
    }
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
