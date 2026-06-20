import agoraToken from "agora-token";
import { ApiError } from "../utils/ApiError.js";
import {
  getAgoraRtcConfig,
  getAgoraRecordingConfig,
  getAgoraRecordingDisableReasons,
} from "../config/agora.config.js";
import { buildAgoraChannelName } from "./agoraRtc.service.js";
import teacherSessionRepository from "../repository/teacherSession.repository.js";
import { ensureMp3RecordingUrl } from "./callRecordingMp3.service.js";

const { RtcTokenBuilder, RtcRole } = agoraToken;

const AGORA_API_BASE = "https://api.agora.io/v1";
const QUERY_RETRY_MS = 2000;
const QUERY_MAX_ATTEMPTS = 6;

/** In-flight / active recording handles — survives session doc races on fast hang-ups. */
const pendingRecordingStarts = new Map();
const activeRecordingHandles = new Map();

const recordingKey = (sessionId) => sessionId?.toString?.() ?? String(sessionId || "");

export async function waitForRecordingReady(sessionId, maxWaitMs = 5000) {
  const key = recordingKey(sessionId);
  if (!key) return null;
  if (activeRecordingHandles.has(key)) {
    return activeRecordingHandles.get(key);
  }
  const pending = pendingRecordingStarts.get(key);
  if (!pending) return null;
  return Promise.race([
    pending,
    sleep(maxWaitMs).then(() => activeRecordingHandles.get(key) ?? null),
  ]);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function buildBasicAuth(customerId, customerSecret) {
  return Buffer.from(`${customerId}:${customerSecret}`).toString("base64");
}

async function agoraRecordingRequest(appId, customerId, customerSecret, path, body) {
  const url = `${AGORA_API_BASE}/apps/${appId}/cloud_recording${path}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${buildBasicAuth(customerId, customerSecret)}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      data?.message ||
      data?.reason ||
      data?.error ||
      data?.code ||
      `Agora recording API error (${res.status})`;
    throw new ApiError(res.status >= 500 ? 502 : 400, String(msg));
  }
  return data;
}

/** Log once at startup why recording is off (no secrets). */
let recordingStatusLogged = false;
export function logAgoraRecordingStatus() {
  if (recordingStatusLogged) return;
  recordingStatusLogged = true;
  const cfg = getAgoraRecordingConfig();
  if (cfg.enabled) {
    console.info(
      "[Agora Recording] Enabled — calls will be recorded to S3 bucket:",
      process.env.AWS_S3_BUCKET_NAME
    );
    return;
  }
  const reasons = getAgoraRecordingDisableReasons();
  console.warn(
    "[Agora Recording] DISABLED — recordings will NOT be saved.",
    reasons.length ? `Missing: ${reasons.join(", ")}` : ""
  );
}

function buildS3RecordingUrl(fileName) {
  if (!fileName || typeof fileName !== "string") return null;
  const trimmed = fileName.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;

  const bucket = (process.env.AWS_S3_BUCKET_NAME || "").trim();
  const region = (process.env.AWS_REGION || "us-east-1").trim();
  if (!bucket) return trimmed;

  const key = trimmed.replace(/^\//, "");
  return `https://${bucket}.s3.${region}.amazonaws.com/${encodeURI(key)}`;
}

function pickBestRecordingFile(fileList) {
  if (!Array.isArray(fileList) || fileList.length === 0) return null;

  const mp3 = fileList.find((f) => {
    const name = String(f?.fileName || f?.filename || "").toLowerCase();
    return name.endsWith(".mp3");
  });
  if (mp3) return mp3;

  const mp4 = fileList.find((f) => {
    const name = String(f?.fileName || f?.filename || "").toLowerCase();
    return name.endsWith(".mp4");
  });
  if (mp4) return mp4;

  const aac = fileList.find((f) => {
    const name = String(f?.fileName || f?.filename || "").toLowerCase();
    return name.endsWith(".aac");
  });
  if (aac) return aac;

  const m3u8 = fileList.find((f) => {
    const name = String(f?.fileName || f?.filename || "").toLowerCase();
    return name.endsWith(".m3u8");
  });
  if (m3u8) return m3u8;

  return fileList[0];
}

function extractRecordingUrl(response) {
  const serverResponse = response?.serverResponse || response;
  const fileList =
    serverResponse?.fileList ||
    serverResponse?.uploadingStatus?.fileList ||
    [];
  const picked = pickBestRecordingFile(fileList);
  if (!picked) return null;

  const raw =
    picked?.fileName || picked?.filename || picked?.url || null;
  return buildS3RecordingUrl(raw);
}

function buildRecordingToken(channelName, recordingUid, ttlSeconds) {
  const cfg = getAgoraRtcConfig();
  const privilegeExpiredTs = Math.floor(Date.now() / 1000) + ttlSeconds;
  return RtcTokenBuilder.buildTokenWithUid(
    cfg.appId,
    cfg.appCertificate,
    channelName,
    Number(recordingUid),
    RtcRole.SUBSCRIBER,
    privilegeExpiredTs
  );
}

async function queryRecordingFiles({
  appId,
  customerId,
  customerSecret,
  resourceId,
  sid,
  channelName,
  recordingUid,
}) {
  return agoraRecordingRequest(
    appId,
    customerId,
    customerSecret,
    `/resourceid/${resourceId}/sid/${sid}/mode/mix/query`,
    {
      cname: channelName,
      uid: recordingUid,
      clientRequest: {},
    }
  );
}

async function resolveRecordingUrlAfterStop({
  appId,
  customerId,
  customerSecret,
  resourceId,
  sid,
  channelName,
  recordingUid,
  stopResponse,
}) {
  let url = extractRecordingUrl(stopResponse);
  if (url) return url;

  const uploadingStatus = stopResponse?.serverResponse?.uploadingStatus;
  if (uploadingStatus === "uploaded") {
    return extractRecordingUrl(stopResponse);
  }

  for (let attempt = 0; attempt < QUERY_MAX_ATTEMPTS; attempt += 1) {
    await sleep(QUERY_RETRY_MS);
    try {
      const queryRes = await queryRecordingFiles({
        appId,
        customerId,
        customerSecret,
        resourceId,
        sid,
        channelName,
        recordingUid,
      });
      url = extractRecordingUrl(queryRes);
      if (url) return url;

      const status = queryRes?.serverResponse?.status;
      if (status === 0 || queryRes?.serverResponse?.uploadingStatus === "uploaded") {
        url = extractRecordingUrl(queryRes);
        if (url) return url;
      }
    } catch (err) {
      console.error("[Agora Recording] query after stop failed:", err.message);
    }
  }

  return null;
}

/**
 * Start Agora Cloud Recording for an ongoing call session.
 * Stores resourceId + sid on the session document.
 */
export async function startCallRecording(sessionId) {
  const key = recordingKey(sessionId);
  if (!key) return null;

  if (activeRecordingHandles.has(key)) {
    return activeRecordingHandles.get(key);
  }
  if (pendingRecordingStarts.has(key)) {
    return pendingRecordingStarts.get(key);
  }

  const startPromise = (async () => {
  const cfg = getAgoraRecordingConfig();
  if (!cfg.enabled) {
    console.warn(
      "[Agora Recording] Skipped start — not configured:",
      getAgoraRecordingDisableReasons().join(", ") || "unknown"
    );
    return null;
  }

  const session = await teacherSessionRepository.findById(sessionId);
  if (!session || session.sessionKind !== "call") return null;
  if (session.status !== "ongoing") {
    console.warn(
      `[Agora Recording] Skipped start for ${sessionId} — session status is ${session.status}`
    );
    return null;
  }
  if (session.agoraRecordingResourceId && session.agoraRecordingId) {
    const existing = {
      resourceId: session.agoraRecordingResourceId,
      sid: session.agoraRecordingId,
    };
    activeRecordingHandles.set(key, existing);
    return existing;
  }

  const channelName = buildAgoraChannelName(session._id);
  const recordingUid = cfg.recordingUid;
  const rtcCfg = getAgoraRtcConfig();

  const acquireRes = await agoraRecordingRequest(
    rtcCfg.appId,
    cfg.customerId,
    cfg.customerSecret,
    "/acquire",
    {
      cname: channelName,
      uid: recordingUid,
      clientRequest: {},
    }
  );
  const resourceId = acquireRes?.resourceId;
  if (!resourceId) {
    throw new ApiError(502, "Agora acquire did not return resourceId");
  }

  const token = buildRecordingToken(channelName, recordingUid, rtcCfg.tokenTtlSeconds);
  const startRes = await agoraRecordingRequest(
    rtcCfg.appId,
    cfg.customerId,
    cfg.customerSecret,
    `/resourceid/${resourceId}/mode/mix/start`,
    {
      cname: channelName,
      uid: recordingUid,
      clientRequest: {
        token,
        recordingConfig: {
          channelType: 0,
          streamTypes: 0,
          audioProfile: 1,
          maxIdleTime: 120,
        },
        recordingFileConfig: {
          avFileType: ["hls", "mp4"],
        },
        storageConfig: cfg.storageConfig,
      },
    }
  );
  const sid = startRes?.sid;
  if (!sid) {
    throw new ApiError(502, "Agora start recording did not return sid");
  }

  await teacherSessionRepository.updateById(sessionId, {
    agoraRecordingResourceId: resourceId,
    agoraRecordingId: sid,
  });

  const handle = { resourceId, sid };
  activeRecordingHandles.set(key, handle);
  console.info(`[Agora Recording] Started for session ${sessionId} (sid=${sid})`);
  return handle;
  })();

  pendingRecordingStarts.set(key, startPromise);
  try {
    return await startPromise;
  } catch (err) {
    activeRecordingHandles.delete(key);
    throw err;
  } finally {
    pendingRecordingStarts.delete(key);
  }
}

/**
 * Stop Agora Cloud Recording and return the playable file URL when available.
 * @param {string} sessionId
 * @param {{ resourceId?: string, sid?: string }} [snapshot] — optional in-memory/db snapshot if session doc was already completed
 */
export async function stopCallRecording(sessionId, snapshot = null) {
  const cfg = getAgoraRecordingConfig();
  if (!cfg.enabled) {
    return { recordingUrl: null, agoraRecordingId: null };
  }

  const key = recordingKey(sessionId);
  const session = await teacherSessionRepository.findById(sessionId);

  const cached = key ? activeRecordingHandles.get(key) : null;
  let resourceId =
    snapshot?.resourceId ||
    cached?.resourceId ||
    session?.agoraRecordingResourceId;
  let sid =
    snapshot?.sid ||
    cached?.sid ||
    session?.agoraRecordingId;

  if (!session && !resourceId && !sid) {
    return { recordingUrl: null, agoraRecordingId: null };
  }

  if (!resourceId || !sid) {
    console.warn(
      `[Agora Recording] No active recording for session ${sessionId} — start may have failed or call was too short`
    );
    return {
      recordingUrl: session?.recordingUrl || null,
      agoraRecordingId: sid || null,
    };
  }

  const channelName = buildAgoraChannelName(session?._id ?? sessionId);
  const recordingUid = cfg.recordingUid;
  const rtcCfg = getAgoraRtcConfig();

  let recordingUrl = session?.recordingUrl || null;
  try {
    const stopRes = await agoraRecordingRequest(
      rtcCfg.appId,
      cfg.customerId,
      cfg.customerSecret,
      `/resourceid/${resourceId}/sid/${sid}/mode/mix/stop`,
      {
        cname: channelName,
        uid: recordingUid,
        clientRequest: {
          async_stop: false,
        },
      }
    );
    recordingUrl =
      (await resolveRecordingUrlAfterStop({
        appId: rtcCfg.appId,
        customerId: cfg.customerId,
        customerSecret: cfg.customerSecret,
        resourceId,
        sid,
        channelName,
        recordingUid,
        stopResponse: stopRes,
      })) || recordingUrl;

    if (recordingUrl) {
      try {
        const mp3Url = await ensureMp3RecordingUrl(recordingUrl, sessionId);
        if (mp3Url) recordingUrl = mp3Url;
      } catch (err) {
        console.error(
          `[Agora Recording] MP3 conversion failed for session ${sessionId}:`,
          err.message
        );
      }
    }

    if (recordingUrl) {
      console.info(`[Agora Recording] Saved MP3 URL for session ${sessionId}`);
    } else {
      console.warn(
        `[Agora Recording] Stop OK but no file URL yet for session ${sessionId} — check S3 bucket policy`
      );
    }
  } catch (err) {
    console.error(`[Agora Recording] Stop failed for session ${sessionId}:`, err.message);
  }

  if (key) activeRecordingHandles.delete(key);

  return { recordingUrl, agoraRecordingId: sid };
}

export function clearActiveRecordingHandle(sessionId) {
  const key = recordingKey(sessionId);
  if (key) activeRecordingHandles.delete(key);
}

export default {
  startCallRecording,
  stopCallRecording,
  waitForRecordingReady,
  clearActiveRecordingHandle,
  logAgoraRecordingStatus,
};
