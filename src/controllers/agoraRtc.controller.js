import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import * as agoraRtcService from "../services/agoraRtc.service.js";

/**
 * POST /teacher/sessions/:sessionId/agora-token
 * RTC token for the logged-in teacher (join Agora channel for this session).
 */
export const postTeacherAgoraRtcToken = asyncHandler(async (req, res) => {
  const { sessionId } = req.params;
  const data = await agoraRtcService.issueRtcTokenForSession({
    sessionId,
    requesterId: req.user._id,
    role: "teacher",
  });
  return res.status(200).json(ApiResponse.success(data, "Agora RTC token issued"));
});

/**
 * POST /student/teacher-sessions/:sessionId/agora-token
 * RTC token for the logged-in student.
 */
export const postStudentAgoraRtcToken = asyncHandler(async (req, res) => {
  const { sessionId } = req.params;
  const data = await agoraRtcService.issueRtcTokenForSession({
    sessionId,
    requesterId: req.user._id,
    role: "student",
  });
  return res.status(200).json(ApiResponse.success(data, "Agora RTC token issued"));
});
