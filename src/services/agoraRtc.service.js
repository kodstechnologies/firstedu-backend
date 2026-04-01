import agoraToken from "agora-token";
import { ApiError } from "../utils/ApiError.js";
import { getAgoraRtcConfig } from "../config/agora.config.js";
import { agoraUidFromObjectId } from "../utils/agoraUid.util.js";
import teacherSessionRepository from "../repository/teacherSession.repository.js";

const { RtcTokenBuilder, RtcRole } = agoraToken;

/** Agora channel name: lowercase letters, digits, underscore; max 64 bytes. */
export function buildAgoraChannelName(sessionId) {
  const id = String(sessionId);
  if (!id || id.length > 48) {
    throw new ApiError(400, "Invalid session id for Agora channel");
  }
  return `edu_${id}`;
}

/**
 * Issue an RTC token for the teacher–student voice/video call for this session.
 * @param {object} params
 * @param {string} params.sessionId
 * @param {import("mongoose").Types.ObjectId|string} params.requesterId — logged-in user
 * @param {"teacher"|"student"} params.role
 */
export async function issueRtcTokenForSession({ sessionId, requesterId, role }) {
  const cfg = getAgoraRtcConfig();
  if (!cfg.enabled) {
    throw new ApiError(
      503,
      "Agora is not configured. Set AGORA_APP_ID and AGORA_APP_CERTIFICATE on the server."
    );
  }

  if (role !== "teacher" && role !== "student") {
    throw new ApiError(400, "Invalid role for Agora token");
  }

  const session = await teacherSessionRepository.findById(sessionId);
  if (!session) {
    throw new ApiError(404, "Session not found");
  }

  if (session.sessionKind !== "call") {
    throw new ApiError(400, "Agora RTC applies to call sessions only");
  }

  if (session.status !== "accepted" && session.status !== "ongoing") {
    throw new ApiError(
      400,
      "Session must be accepted or ongoing to join the call channel"
    );
  }

  const studentId = session.student._id?.toString?.() ?? String(session.student);
  const teacherId = session.teacher._id?.toString?.() ?? String(session.teacher);
  const reqId = String(requesterId);

  if (role === "student" && reqId !== studentId) {
    throw new ApiError(403, "You are not the student for this session");
  }
  if (role === "teacher" && reqId !== teacherId) {
    throw new ApiError(403, "You are not the teacher for this session");
  }

  const channelName = buildAgoraChannelName(session._id);
  const uid = agoraUidFromObjectId(reqId);
  const ttl = cfg.tokenTtlSeconds;
  const privilegeTtl = ttl;

  let token;
  try {
    token = RtcTokenBuilder.buildTokenWithUid(
      cfg.appId,
      cfg.appCertificate,
      channelName,
      uid,
      RtcRole.PUBLISHER,
      ttl,
      privilegeTtl
    );
  } catch (e) {
    console.error("Agora RtcTokenBuilder.buildTokenWithUid failed:", e?.message || e);
    throw new ApiError(500, "Failed to generate Agora token");
  }

  const expiresAt = new Date(Date.now() + ttl * 1000).toISOString();

  return {
    appId: cfg.appId,
    channelName,
    token,
    uid,
    role,
    expiresInSeconds: ttl,
    expiresAt,
  };
}

export default {
  issueRtcTokenForSession,
  buildAgoraChannelName,
};
