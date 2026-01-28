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

// Video file filter
const videoFileFilter = (req, file, cb) => {
  const allowedTypes = [
    'video/mp4',
    'video/mpeg',
    'video/quicktime',
    'video/x-msvideo',
    'video/webm',
    'video/x-ms-wmv',
    'video/3gpp',
  ];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only video files (MP4, MPEG, MOV, AVI, WEBM, WMV, 3GP) are allowed'), false);
  }
};

// Video upload configuration with larger file size limit
export const uploadVideo = multer({
  storage,
  fileFilter: (req, file, cb) => {
    // If no file is provided (sending JSON with URL), allow it
    if (!file) {
      cb(null, false);
      return;
    }
    // Otherwise use video file filter
    videoFileFilter(req, file, cb);
  },
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB limit for videos
});