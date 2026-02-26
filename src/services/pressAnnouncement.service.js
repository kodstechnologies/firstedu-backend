import pressAnnouncementRepository from "../repository/pressAnnouncement.repository.js";
import ApiError from "../utils/ApiError.js";
import { uploadImageToCloudinary, deleteFileFromCloudinary } from "../utils/cloudinaryUpload.js";

const PRESS_ANNOUNCEMENT_IMAGE_FOLDER = "press-announcements";

const createPressAnnouncement = async (data, adminId, file) => {
  let imageUrl = null;
  if (file?.buffer) {
    imageUrl = await uploadImageToCloudinary(
      file.buffer,
      file.originalname,
      PRESS_ANNOUNCEMENT_IMAGE_FOLDER,
      file.mimetype
    );
  }
  return await pressAnnouncementRepository.create({
    ...data,
    image: imageUrl,
    createdBy: adminId,
  });
};

const getAllPressAnnouncementsPaginated = async (filters = {}, options = {}) => {
  return await pressAnnouncementRepository.findAllPaginated(filters, options);
};

const getPressAnnouncementById = async (id) => {
  const announcement = await pressAnnouncementRepository.findById(id);
  if (!announcement) {
    throw new ApiError(404, "Press announcement not found");
  }
  return announcement;
};

const updatePressAnnouncement = async (id, data, file) => {
  const announcement = await pressAnnouncementRepository.findById(id);
  if (!announcement) {
    throw new ApiError(404, "Press announcement not found");
  }
  const updateData = { ...data };
  if (file?.buffer) {
    const imageUrl = await uploadImageToCloudinary(
      file.buffer,
      file.originalname,
      PRESS_ANNOUNCEMENT_IMAGE_FOLDER,
      file.mimetype
    );
    if (announcement.image) {
      await deleteFileFromCloudinary(announcement.image);
    }
    updateData.image = imageUrl;
  }
  return await pressAnnouncementRepository.updateById(id, updateData);
};

const deletePressAnnouncement = async (id) => {
  const announcement = await pressAnnouncementRepository.findById(id);
  if (!announcement) {
    throw new ApiError(404, "Press announcement not found");
  }
  if (announcement.image) {
    await deleteFileFromCloudinary(announcement.image);
  }
  return await pressAnnouncementRepository.deleteById(id);
};

export default {
  createPressAnnouncement,
  getAllPressAnnouncementsPaginated,
  getPressAnnouncementById,
  updatePressAnnouncement,
  deletePressAnnouncement,
};
