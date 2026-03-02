import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import studentRoutes from "./routes/student.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import teacherRoutes from "./routes/teacher.routes.js";
import webhooksRoutes from "./routes/webhooks.routes.js";
import ApiError from "./utils/ApiError.js";

dotenv.config();
const app = express();

// CORS
app.use(
  cors({
    origin: (origin, callback) => {
      const allowedOrigins = process.env.CORS_ORIGIN?.split(",").map((o) =>
        o.trim()
      ) || [
          "http://localhost:3000",
          "http://localhost:5173",
          "http://localhost:5174",
        ];
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  })
);

// Webhooks: raw body required for signature verification (must be before express.json)
app.use(
  "/webhooks/razorpay",
  express.raw({ type: "application/json", limit: "64kb" }),
  webhooksRoutes
);

app.use(express.json({ limit: "16kb" }));

// Routes
app.use("/user", studentRoutes);
app.use("/admin", adminRoutes);
app.use("/teacher", teacherRoutes);
// Test Route
app.get("/test", (req, res) => {

  // Send it in the response
  res.json({
    success: true,
    message: `Server is working!!🚀`,
    timestamp: new Date().toISOString(),
  });
});

// Basic Error Handler
app.use((err, req, res, next) => {
  // Handle multer file size errors
  if (err.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({
      success: false,
      message: "File too large. Maximum file size is 500MB",
      data: null,
    });
  }

  // Handle multer file type errors
  if (err.message && (err.message.includes("video files") || err.message.includes("Only video files"))) {
    return res.status(400).json({
      success: false,
      message: err.message,
      data: null,
    });
  }

  // Handle multer "Unexpected field" error (wrong field name)
  if (err.code === "LIMIT_UNEXPECTED_FILE") {
    return res.status(400).json({
      success: false,
      message: "Invalid field name. Use 'video' as the field name for file upload.",
      data: null,
    });
  }

  // If it's an instance of ApiError → use its structure
  if (err instanceof ApiError) {
    return res.status(err.statusCode).json(err.toJSON());
  }

  // Otherwise, fallback to generic
  res.status(500).json({
    success: false,
    message: err.message || "Internal Server Error",
    data: null,
  });
});

export default app;
