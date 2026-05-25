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

function normaliseCourseFiles(files) {
  if (!Array.isArray(files)) return files || {};
  return files.reduce((acc, file) => {
    if (!acc[file.fieldname]) acc[file.fieldname] = [];
    acc[file.fieldname].push(file);
    return acc;
  }, {});
}

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

function parseModules(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

/** Normalise certificationTestIds — multer may deliver a single string instead of an array */
function normaliseCertTestIds(raw) {
  if (!raw) return null;
  return Array.isArray(raw) ? raw : [raw];
}

async function validateCertificationTests(testIds) {
  const uniqueIds = [...new Set(testIds.map((id) => id?.toString?.() ?? id).filter(Boolean))];
  const tests = await Promise.all(uniqueIds.map((id) => testRepository.findTestById(id)));

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

  return uniqueIds;
}

async function buildCertificationModules(rawModules, files, existingModules = []) {
  const parsedModules = parseModules(rawModules);
  const modules = [];

  for (let index = 0; index < parsedModules.length; index += 1) {
    const moduleInput = parsedModules[index] || {};
    const title = String(moduleInput.title || "").trim();
    if (!title) continue;

    const existing = existingModules.find(
      (module) =>
        moduleInput._id &&
        (module._id?.toString?.() ?? module._id) === moduleInput._id
    );
    const existingContents = Array.isArray(moduleInput.existingContents)
      ? moduleInput.existingContents.filter((content) => content?.url && content?.type)
      : existing?.contents || [];
    const uploadedContents = [];
    const moduleFiles = files?.[`moduleFiles_${index}`] || [];
    for (const file of moduleFiles) {
      const result = await uploadStudyMaterialFile(file);
      uploadedContents.push({
        url: result.url,
        type: result.contentType,
        originalName: result.originalName,
      });
    }

    modules.push({
      ...(moduleInput._id ? { _id: moduleInput._id } : {}),
      title,
      description: String(moduleInput.description || "").trim(),
      contents: [...existingContents, ...uploadedContents],
      test: moduleInput.test || null,
      order: index,
    });
  }

  return modules;
}

function getModuleTestIds(modules) {
  return modules.map((module) => module.test).filter(Boolean);
}

export const createCourse = async (data, adminId, files) => {
  files = normaliseCourseFiles(files);
  const isCertification =
    data.isCertification === true || data.isCertification === "true";
  const studyFiles = files?.pdf || [];
  if (!isCertification && studyFiles.length === 0) {
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
  const modules = isCertification
    ? await buildCertificationModules(data.modules, files)
    : [];
  const moduleTestIds = getModuleTestIds(modules);

  if (isCertification) {
    if (modules.length === 0) {
      throw new ApiError(400, "Add at least one certification module");
    }
    if (moduleTestIds.length !== modules.length) {
      throw new ApiError(400, "Each certification module must have a linked test");
    }
    if (modules.some((module) => !module.contents?.length)) {
      throw new ApiError(400, "Each certification module must include study material");
    }
    await validateCertificationTests(moduleTestIds);
  }

  const course = await courseRepository.create({
    title: data.title,
    description: data.description,
    syllabus: isCertification ? modules.map((module) => module.title) : syllabus,
    imageUrl,
    contents: isCertification ? [] : uploadedContents,
    modules,
    price: data.price || 0,
    isPublished: data.isPublished === true || data.isPublished === "true",
    isCertification,
    categoryIds: data.categoryIds || [],
    createdBy: adminId,
  });

  const certTestIds = isCertification
    ? moduleTestIds
    : normaliseCertTestIds(data.certificationTestIds);
  // Handle optional certification test links
  if (
    course.isCertification &&
    certTestIds &&
    certTestIds.length > 0
  ) {
    await syncCertificationTestsForCourse(
      course._id,
      certTestIds,
      adminId,
      course.modules || modules
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
  files = normaliseCourseFiles(files);
  const existingCourse = await courseRepository.findById(id);
  if (!existingCourse) {
    throw new ApiError(404, "Course not found");
  }
  const isCertification =
    data.isCertification !== undefined
      ? data.isCertification === true || data.isCertification === "true"
      : Boolean(existingCourse.isCertification);

  let imageUrl = existingCourse.imageUrl || null;

  // Handle new study material files
  const studyFiles = files?.pdf || [];
  let contents = existingCourse.contents || [];

  if (!isCertification && studyFiles.length > 0) {
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
    contents: isCertification ? [] : contents,
    imageUrl,
  };

  let modules = existingCourse.modules || [];
  if (isCertification && data.modules !== undefined) {
    modules = await buildCertificationModules(data.modules, files, existingCourse.modules || []);
    const moduleTestIds = getModuleTestIds(modules);
    if (modules.length === 0) {
      throw new ApiError(400, "Add at least one certification module");
    }
    if (moduleTestIds.length !== modules.length) {
      throw new ApiError(400, "Each certification module must have a linked test");
    }
    if (modules.some((module) => !module.contents?.length)) {
      throw new ApiError(400, "Each certification module must include study material");
    }
    await validateCertificationTests(moduleTestIds);
    const retainedUrls = new Set(
      modules
        .flatMap((module) => module.contents || [])
        .map((content) => content.url)
        .filter(Boolean)
    );
    for (const oldModule of existingCourse.modules || []) {
      for (const oldContent of oldModule.contents || []) {
        if (oldContent.url && !retainedUrls.has(oldContent.url)) {
          await deleteFileFromCloudinary(oldContent.url);
        }
      }
    }
    updateData.modules = modules;
    updateData.syllabus = modules.map((module) => module.title);
  } else if (!isCertification) {
    updateData.modules = [];
  }

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
    updateData.isCertification = isCertification;
  }

  const updatedCourse = await courseRepository.updateById(id, updateData);

  const certTestIds =
    isCertification && data.modules !== undefined
      ? getModuleTestIds(modules)
      : normaliseCertTestIds(data.certificationTestIds);
  // If certification flag or test list provided, sync links
  if (
    updatedCourse.isCertification &&
    certTestIds
  ) {
    await syncCertificationTestsForCourse(
      updatedCourse._id,
      certTestIds,
      existingCourse.createdBy || null,
      updatedCourse.modules || modules
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
const syncCertificationTestsForCourse = async (
  courseId,
  testIds,
  adminId,
  modules = []
) => {
  const uniqueIds = await validateCertificationTests(testIds);
  const moduleByTestId = new Map(
    modules
      .filter((module) => module.test)
      .map((module) => [
        module.test.toString(),
        {
          moduleId: module._id || null,
          moduleTitle: module.title || "",
          order: Number.isFinite(module.order) ? module.order : 0,
        },
      ])
  );

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
    const moduleMeta = moduleByTestId.get(testId) || {};
    if (toAdd.includes(testId)) {
      await courseTestLinkRepository.create({
        course: courseId,
        test: testId,
        order: moduleMeta.order ?? order,
        moduleId: moduleMeta.moduleId,
        moduleTitle: moduleMeta.moduleTitle,
        isRequired: true,
        createdBy: adminId,
      });
    } else {
      const existingLink = existingLinks.find((link) => getTestIdStr(link) === testId);
      if (existingLink) {
        await courseTestLinkRepository.updateById(existingLink._id, {
          order: moduleMeta.order ?? order,
          moduleId: moduleMeta.moduleId,
          moduleTitle: moduleMeta.moduleTitle,
        });
      }
    }
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
  for (const module of course.modules || []) {
    for (const content of module.contents || []) {
      if (content.url) {
        await deleteFileFromCloudinary(content.url);
      }
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
