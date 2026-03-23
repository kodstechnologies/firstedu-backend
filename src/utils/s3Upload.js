import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { nanoid } from "nanoid";
import dotenv from "dotenv";

dotenv.config();

const requiredEnv = ["AWS_REGION", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_S3_BUCKET_NAME"];
const hasS3Config = requiredEnv.every((key) => Boolean(process.env[key]));

const s3Client = hasS3Config
  ? new S3Client({
      region: process.env.AWS_REGION,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
    })
  : null;

/**
 * Ensure S3 credentials are configured.
 */
function ensureS3Configured() {
  if (s3Client) return;
  throw new Error(
    "S3 credentials not configured (AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_S3_BUCKET_NAME)"
  );
}

function sanitizeFileName(name = "") {
  return String(name)
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9._-]/g, "")
    .toLowerCase();
}

function getFileExtension(originalName = "", fallback = "") {
  const clean = sanitizeFileName(originalName);
  const dotIndex = clean.lastIndexOf(".");
  if (dotIndex > -1 && dotIndex < clean.length - 1) {
    return clean.slice(dotIndex);
  }
  return fallback;
}

function buildS3ObjectKey(folder, originalName, fallbackExt = "") {
  const ext = getFileExtension(originalName, fallbackExt);
  return `${folder}/${Date.now()}-${nanoid()}${ext}`;
}

function getS3PublicUrl(key) {
  const bucket = process.env.AWS_S3_BUCKET_NAME;
  const region = process.env.AWS_REGION;
  return `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
}

async function uploadBufferToS3(fileBuffer, { folder, originalName, contentType, fallbackExt }) {
  ensureS3Configured();
  if (!fileBuffer) throw new Error("File buffer is required");

  const Key = buildS3ObjectKey(folder, originalName, fallbackExt);
  await s3Client.send(
    new PutObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET_NAME,
      Key,
      Body: fileBuffer,
      ContentType: contentType,
    })
  );

  return getS3PublicUrl(Key);
}

/**
 * Upload image to S3.
 * @param {Buffer} fileBuffer - File buffer from multer
 * @param {String} originalName - Original filename
 * @param {String} folder - Folder path in S3 bucket
 * @param {String} contentType - MIME type (e.g. "image/jpeg")
 * @returns {Promise<String>} Public URL of uploaded image
 */
export const uploadImageToCloudinary = async (
  fileBuffer,
  originalName,
  folder = "profile-images",
  contentType = "image/jpeg"
) => {
  return uploadBufferToS3(fileBuffer, {
    folder,
    originalName,
    contentType,
    fallbackExt: ".jpg",
  });
};

/**
 * Upload PDF (or any raw file) to S3.
 * @param {Buffer} fileBuffer - File buffer from multer
 * @param {String} originalName - Original filename
 * @param {String} folder - Folder path in S3 bucket
 * @returns {Promise<String>} Public URL of uploaded file
 */
export const uploadPDFToCloudinary = async (fileBuffer, originalName, folder = "courses") => {
  return uploadBufferToS3(fileBuffer, {
    folder,
    originalName,
    contentType: "application/pdf",
    fallbackExt: ".pdf",
  });
};

/**
 * Extract S3 object key from a direct S3 URL.
 */
function parseS3KeyFromUrl(fileUrl) {
  if (!fileUrl || typeof fileUrl !== "string") return null;
  try {
    const url = new URL(fileUrl);
    const host = url.hostname;
    const bucket = process.env.AWS_S3_BUCKET_NAME;
    const region = process.env.AWS_REGION;
    const virtualHosted = `${bucket}.s3.${region}.amazonaws.com`;
    const virtualHostedLegacy = `${bucket}.s3.amazonaws.com`;

    if (host === virtualHosted || host === virtualHostedLegacy) {
      return decodeURIComponent(url.pathname.replace(/^\/+/, ""));
    }

    // path-style URL fallback: s3.<region>.amazonaws.com/<bucket>/<key>
    if (host.startsWith("s3.") || host === "s3.amazonaws.com") {
      const path = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
      if (path.startsWith(`${bucket}/`)) {
        return path.slice(bucket.length + 1);
      }
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Upload audio to S3.
 * @param {Buffer} fileBuffer - File buffer from multer
 * @param {String} originalName - Original filename
 * @param {String} folder - Folder path in S3 bucket
 * @returns {Promise<String>} Public URL of uploaded file
 */
export const uploadAudioToCloudinary = async (fileBuffer, originalName, folder = "courses") => {
  return uploadBufferToS3(fileBuffer, {
    folder,
    originalName,
    contentType: "audio/mpeg",
    fallbackExt: ".mp3",
  });
};

/**
 * Upload video to S3.
 * @param {Buffer} fileBuffer - File buffer from multer
 * @param {String} originalName - Original filename
 * @param {String} folder - Folder path in S3 bucket
 * @returns {Promise<String>} Public URL of uploaded video
 */
export const uploadVideoToCloudinary = async (fileBuffer, originalName, folder = "videos") => {
  return uploadBufferToS3(fileBuffer, {
    folder,
    originalName,
    contentType: "video/mp4",
    fallbackExt: ".mp4",
  });
};

/**
 * Delete file from S3 by URL.
 * @param {String} fileUrl - Full S3 URL
 * @returns {Promise<Boolean>}
 */
export const deleteFileFromCloudinary = async (fileUrl) => {
  if (!fileUrl) return false;
  ensureS3Configured();
  const key = parseS3KeyFromUrl(fileUrl);
  if (!key) return false;

  try {
    await s3Client.send(
      new DeleteObjectCommand({
        Bucket: process.env.AWS_S3_BUCKET_NAME,
        Key: key,
      })
    );
    return true;
  } catch (err) {
    console.error("S3 delete error:", err.message);
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
