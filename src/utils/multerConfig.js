import multer from 'multer';

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only JPEG, PNG, and PDF files are allowed'), false);
  }
};

export const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB limit
});

// PDF-only upload for courses (larger file size)
const pdfFileFilter = (req, file, cb) => {
  if (file.mimetype === "application/pdf") {
    cb(null, true);
  } else {
    cb(new Error("Only PDF files are allowed"), false);
  }
};

export const uploadPDF = multer({
  storage,
  fileFilter: pdfFileFilter,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB limit for PDFs
});

// Image-only file filter
const imageFileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only JPEG and PNG image files are allowed'), false);
  }
};

export const uploadImage = multer({
  storage,
  fileFilter: imageFileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit for images
});

// Combined file filter for PDF and images (for teacher signup with resume and profileImage)
const pdfAndImageFileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only JPEG, PNG images and PDF files are allowed'), false);
  }
};

export const uploadPDFAndImage = multer({
  storage,
  fileFilter: pdfAndImageFileFilter,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB limit
});

// Video file filter
const imageAndVideoFileFilter = (req, file, cb) => {
  const allowedTypes = [
    // Images
    "image/jpeg",
    "image/png",
    "image/jpg",
    "image/webp",

    // Videos
    "video/mp4",
    "video/mpeg",
    "video/quicktime",
    "video/x-msvideo",
    "video/webm",
    "video/x-ms-wmv",
    "video/3gpp",
  ];

  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new Error(
        "Only image (JPEG, PNG, WEBP) and video (MP4, MOV, AVI, WEBM, etc.) files are allowed"
      ),
      false
    );
  }
};

export const uploadSuccessStory = multer({
  storage,
  fileFilter: imageAndVideoFileFilter,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB
});
