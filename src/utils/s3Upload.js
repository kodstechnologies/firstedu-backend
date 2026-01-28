import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { nanoid } from "nanoid";

const s3Client = new S3Client({
  region: process.env.AWS_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const BUCKET_NAME = process.env.AWS_S3_BUCKET_NAME;

/**
 * Upload PDF file to S3
 * @param {Buffer} fileBuffer - File buffer from multer
 * @param {String} originalName - Original filename
 * @param {String} folder - Folder path in S3 (e.g., "courses")
 * @returns {Promise<String>} S3 URL of uploaded file
 */
export const uploadPDFToS3 = async (fileBuffer, originalName, folder = "courses") => {
  if (!BUCKET_NAME) {
    throw new Error("AWS_S3_BUCKET_NAME is not configured");
  }

  if (!fileBuffer) {
    throw new Error("File buffer is required");
  }

  // Generate unique filename
  const fileExtension = originalName.split(".").pop();
  const fileName = `${folder}/${nanoid()}-${Date.now()}.${fileExtension}`;

  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: fileName,
    Body: fileBuffer,
    ContentType: "application/pdf",
    ACL: "public-read", // Make file publicly accessible
  });

  try {
    await s3Client.send(command);
    
    // Return public URL
    const url = `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION || "us-east-1"}.amazonaws.com/${fileName}`;
    return url;
  } catch (error) {
    console.error("S3 Upload Error:", error);
    throw new Error(`Failed to upload file to S3: ${error.message}`);
  }
};

/**
 * Upload image file to S3
 * @param {Buffer} fileBuffer - File buffer from multer
 * @param {String} originalName - Original filename
 * @param {String} folder - Folder path in S3 (e.g., "profile-images")
 * @param {String} contentType - MIME type of the image (e.g., "image/jpeg", "image/png")
 * @returns {Promise<String>} S3 URL of uploaded file
 */
export const uploadImageToS3 = async (fileBuffer, originalName, folder = "profile-images", contentType = "image/jpeg") => {
  if (!BUCKET_NAME) {
    throw new Error("AWS_S3_BUCKET_NAME is not configured");
  }

  if (!fileBuffer) {
    throw new Error("File buffer is required");
  }

  // Generate unique filename
  const fileExtension = originalName.split(".").pop();
  const fileName = `${folder}/${nanoid()}-${Date.now()}.${fileExtension}`;

  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: fileName,
    Body: fileBuffer,
    ContentType: contentType,
    ACL: "public-read", // Make file publicly accessible
  });

  try {
    await s3Client.send(command);
    
    // Return public URL
    const url = `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION || "us-east-1"}.amazonaws.com/${fileName}`;
    return url;
  } catch (error) {
    console.error("S3 Upload Error:", error);
    throw new Error(`Failed to upload image to S3: ${error.message}`);
  }
};

/**
 * Delete file from S3
 * @param {String} s3Url - Full S3 URL of the file
 * @returns {Promise<Boolean>}
 */
export const deleteFileFromS3 = async (s3Url) => {
  if (!BUCKET_NAME || !s3Url) {
    return false;
  }

  try {
    // Extract key from URL
    // URL format: https://bucket-name.s3.region.amazonaws.com/folder/filename.pdf
    const urlParts = s3Url.split(".amazonaws.com/");
    if (urlParts.length < 2) {
      return false;
    }
    const key = urlParts[1];

    const command = new DeleteObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    });

    await s3Client.send(command);
    return true;
  } catch (error) {
    console.error("S3 Delete Error:", error);
    return false;
  }
};

export default {
  uploadPDFToS3,
  uploadImageToS3,
  deleteFileFromS3,
};

