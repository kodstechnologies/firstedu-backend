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

// Course: image = cover/thumbnail only; pdf = study material (PDF, video, audio only)
const courseImageTypes = ["image/jpeg", "image/png", "image/jpg", "image/webp"];
const courseStudyMaterialTypes = [
  "application/pdf",
  "video/mp4",
  "video/mpeg",
  "video/quicktime",
  "video/x-msvideo",
  "video/webm",
  "video/x-ms-wmv",
  "video/3gpp",
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/webm",
  "audio/ogg",
  "audio/mp4",
  "audio/x-wav",
];

const courseUploadFileFilter = (req, file, cb) => {
  const field = file.fieldname;
  if (field === "image") {
    if (courseImageTypes.includes(file.mimetype)) {
      return cb(null, true);
    }
    return cb(new Error("Course image must be JPEG, PNG, or WEBP"), false);
  }
  if (field === "pdf") {
    if (courseStudyMaterialTypes.includes(file.mimetype)) {
      return cb(null, true);
    }
    return cb(
      new Error("Study material must be PDF, video, or audio (MP4, MP3, WAV, etc.)"),
      false
    );
  }
  cb(new Error("Unexpected field"), false);
};

export const uploadCourseMaterial = multer({
  storage,
  fileFilter: courseUploadFileFilter,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB
}).fields([
  { name: "image", maxCount: 1 },
  { name: "pdf", maxCount: 1 },
]);
