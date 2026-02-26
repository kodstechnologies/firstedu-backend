import { v2 as cloudinary } from "cloudinary";
import { Readable } from "stream";
import { nanoid } from "nanoid";
import dotenv from "dotenv";

dotenv.config();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * Upload buffer via stream to Cloudinary (promisified upload_stream).
 * @param {Buffer} fileBuffer
 * @param {Object} options - { folder, resource_type, ... }
 * @returns {Promise<{ url: string, public_id: string }>}
 */
function uploadBufferToCloudinary(fileBuffer, options = {}) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      options,
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      }
    );
    Readable.from(fileBuffer).pipe(stream);
  });
}

/**
 * Upload image to Cloudinary.
 * @param {Buffer} fileBuffer - File buffer from multer
 * @param {String} originalName - Original filename
 * @param {String} folder - Folder in Cloudinary (e.g. "student-profile-images")
 * @param {String} contentType - MIME type (e.g. "image/jpeg")
 * @returns {Promise<String>} Secure URL of uploaded image
 */
export const uploadImageToCloudinary = async (
  fileBuffer,
  originalName,
  folder = "profile-images",
  contentType = "image/jpeg"
) => {
  if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
    throw new Error("Cloudinary credentials not configured (CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET)");
  }
  if (!fileBuffer) {
    throw new Error("File buffer is required");
  }

  const publicId = `${folder}/${nanoid()}-${Date.now()}`;

  const result = await uploadBufferToCloudinary(fileBuffer, {
    folder,
    resource_type: "image",
    public_id: publicId,
  });

  return result.secure_url;
};

/**
 * Upload PDF (or any raw file) to Cloudinary.
 * @param {Buffer} fileBuffer - File buffer from multer
 * @param {String} originalName - Original filename
 * @param {String} folder - Folder in Cloudinary (e.g. "courses", "teacher-resumes")
 * @returns {Promise<String>} Secure URL of uploaded file
 */
export const uploadPDFToCloudinary = async (fileBuffer, originalName, folder = "courses") => {
  if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
    throw new Error("Cloudinary credentials not configured (CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET)");
  }
  if (!fileBuffer) {
    throw new Error("File buffer is required");
  }

  const publicId = `${folder}/${nanoid()}-${Date.now()}`;

  const result = await uploadBufferToCloudinary(fileBuffer, {
    folder,
    resource_type: "raw",
    public_id: publicId,
  });

  return result.secure_url;
};

/**
 * Extract public_id and resource_type from a Cloudinary URL for deletion.
 * URL formats: .../image/upload/v123/folder/id  or  .../raw/upload/v123/folder/id.pdf
 */
function parseCloudinaryUrl(cloudinaryUrl) {
  if (!cloudinaryUrl || !cloudinaryUrl.includes("cloudinary.com")) {
    return null;
  }
  const isRaw = cloudinaryUrl.includes("/raw/upload/");
  const isVideo = cloudinaryUrl.includes("/video/upload/");
  const resourceType = isRaw ? "raw" : isVideo ? "video" : "image";
  const match = cloudinaryUrl.match(/\/upload\/(?:v\d+\/)?(.+)$/);
  if (!match) return null;
  // For image, public_id has no extension; for raw and video, it may include extension
  const publicId = (isRaw || isVideo) ? match[1] : match[1].replace(/\.[^.]+$/, "");
  return { public_id: publicId, resource_type: resourceType };
}

/**
 * Upload audio to Cloudinary (as raw resource).
 * @param {Buffer} fileBuffer - File buffer from multer
 * @param {String} originalName - Original filename
 * @param {String} folder - Folder in Cloudinary (e.g. "courses")
 * @returns {Promise<String>} Secure URL of uploaded file
 */
export const uploadAudioToCloudinary = async (fileBuffer, originalName, folder = "courses") => {
  if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
    throw new Error("Cloudinary credentials not configured (CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET)");
  }
  if (!fileBuffer) {
    throw new Error("File buffer is required");
  }
  const publicId = `${folder}/${nanoid()}-${Date.now()}`;
  const result = await uploadBufferToCloudinary(fileBuffer, {
    folder,
    resource_type: "raw",
    public_id: publicId,
  });
  return result.secure_url;
};

/**
 * Upload video to Cloudinary.
 * @param {Buffer} fileBuffer - File buffer from multer
 * @param {String} originalName - Original filename
 * @param {String} folder - Folder in Cloudinary (e.g. "success-stories")
 * @returns {Promise<String>} Secure URL of uploaded video
 */
export const uploadVideoToCloudinary = async (fileBuffer, originalName, folder = "videos") => {
  if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
    throw new Error("Cloudinary credentials not configured (CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET)");
  }
  if (!fileBuffer) {
    throw new Error("File buffer is required");
  }

  const publicId = `${folder}/${nanoid()}-${Date.now()}`;

  const result = await uploadBufferToCloudinary(fileBuffer, {
    folder,
    resource_type: "video",
    public_id: publicId,
  });

  return result.secure_url;
};

/**
 * Delete file from Cloudinary by URL.
 * @param {String} cloudinaryUrl - Full Cloudinary URL (secure_url)
 * @returns {Promise<Boolean>}
 */
export const deleteFileFromCloudinary = async (cloudinaryUrl) => {
  if (!cloudinaryUrl) return false;

  const parsed = parseCloudinaryUrl(cloudinaryUrl);
  if (!parsed) return false;

  try {
    const result = await cloudinary.uploader.destroy(parsed.public_id, {
      resource_type: parsed.resource_type,
    });
    return result.result === "ok";
  } catch (err) {
    console.error("Cloudinary delete error:", err.message);
    return false;
  }
};

export default {
  uploadImageToCloudinary,
  uploadPDFToCloudinary,
  uploadVideoToCloudinary,
  uploadAudioToCloudinary,
  deleteFileFromCloudinary,
};
