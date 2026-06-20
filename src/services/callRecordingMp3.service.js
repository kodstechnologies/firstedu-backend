import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";
import os from "os";
import ffmpegStatic from "ffmpeg-static";
import { uploadAudioToCloudinary } from "../utils/s3Upload.js";
import teacherSessionRepository from "../repository/teacherSession.repository.js";

const execFileAsync = promisify(execFile);
const FOLDER = "teacher-call-recordings";

export function isMp3RecordingUrl(url) {
  return typeof url === "string" && /\.mp3(\?|$)/i.test(url.trim());
}

function inferInputExtension(url) {
  const lower = String(url).toLowerCase();
  if (lower.includes(".m3u8")) return ".m3u8";
  if (lower.includes(".aac")) return ".aac";
  if (lower.includes(".mp3")) return ".mp3";
  return ".mp4";
}

/**
 * Download Agora recording (mp4/aac/m3u8), convert to mp3, upload to S3, return public mp3 URL.
 */
export async function ensureMp3RecordingUrl(sourceUrl, sessionId) {
  if (!sourceUrl || typeof sourceUrl !== "string") return null;
  const trimmed = sourceUrl.trim();
  if (isMp3RecordingUrl(trimmed)) return trimmed;

  const ffmpegBin = ffmpegStatic || "ffmpeg";
  if (!ffmpegBin) {
    throw new Error("ffmpeg is not available for MP3 conversion");
  }

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "call-rec-"));
  const inputExt = inferInputExtension(trimmed);
  const inputPath = path.join(tmpDir, `input${inputExt}`);
  const outputPath = path.join(tmpDir, "output.mp3");

  try {
    const res = await fetch(trimmed);
    if (!res.ok) {
      throw new Error(`Failed to download recording (${res.status})`);
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    if (!buffer.length) {
      throw new Error("Downloaded recording file is empty");
    }
    await fs.writeFile(inputPath, buffer);

    await execFileAsync(
      ffmpegBin,
      [
        "-y",
        "-i",
        inputPath,
        "-vn",
        "-acodec",
        "libmp3lame",
        "-b:a",
        "128k",
        "-ar",
        "44100",
        outputPath,
      ],
      { timeout: 180_000, maxBuffer: 20 * 1024 * 1024 }
    );

    const mp3Buffer = await fs.readFile(outputPath);
    if (!mp3Buffer.length) {
      throw new Error("MP3 conversion produced an empty file");
    }

    const fileName = `call-${String(sessionId)}.mp3`;
    const mp3Url = await uploadAudioToCloudinary(mp3Buffer, fileName, FOLDER);
    if (!isMp3RecordingUrl(mp3Url)) {
      console.warn(
        `[MP3] Uploaded URL may not end with .mp3: ${mp3Url} (session ${sessionId})`
      );
    }
    return mp3Url;
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Ensure session recordingUrl points to an mp3 file; updates DB when converted.
 */
export async function resolveSessionRecordingMp3(session) {
  if (!session?.recordingUrl) return null;
  const sessionId = session._id;
  if (isMp3RecordingUrl(session.recordingUrl)) {
    return session.recordingUrl;
  }

  const mp3Url = await ensureMp3RecordingUrl(session.recordingUrl, sessionId);
  if (mp3Url && mp3Url !== session.recordingUrl) {
    await teacherSessionRepository.updateById(sessionId, { recordingUrl: mp3Url });
  }
  return mp3Url;
}

export function buildCallRecordingDownloadName(teacherName, callEndTime) {
  const safe = (teacherName || "teacher").replace(/[^\w\-]+/g, "_");
  const stamp = callEndTime
    ? new Date(callEndTime).toISOString().slice(0, 10)
    : "recording";
  return `call_${safe}_${stamp}.mp3`;
}

export default {
  ensureMp3RecordingUrl,
  resolveSessionRecordingMp3,
  isMp3RecordingUrl,
  buildCallRecordingDownloadName,
};
