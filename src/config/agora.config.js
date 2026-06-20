/**
 * Agora RTC — env-driven config. App Certificate must never be exposed to clients.
 * @see https://docs.agora.io/en/video-calling/get-started/get-started-sdk
 */

const DEFAULT_TOKEN_TTL_SECONDS = 3600;
const MAX_TOKEN_TTL_SECONDS = 86400;

function parsePositiveInt(value, fallback) {
  const n = parseInt(String(value), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/**
 * @returns {{ appId: string, appCertificate: string, tokenTtlSeconds: number, enabled: boolean }}
 */
export function getAgoraRtcConfig() {
  const appId = (process.env.AGORA_APP_ID || "").trim();
  const appCertificate = (process.env.AGORA_APP_CERTIFICATE || "").trim();
  const tokenTtlSeconds = Math.min(
    MAX_TOKEN_TTL_SECONDS,
    Math.max(
      60,
      parsePositiveInt(process.env.AGORA_TOKEN_TTL_SECONDS, DEFAULT_TOKEN_TTL_SECONDS)
    )
  );

  const enabled = Boolean(appId && appCertificate);

  return {
    appId,
    appCertificate,
    tokenTtlSeconds,
    enabled,
  };
}

/** Agora Cloud Recording — requires REST API customer credentials + S3 storage. */
const AWS_REGION_TO_AGORA = {
  "us-east-1": 0,
  "us-east-2": 1,
  "us-west-1": 2,
  "us-west-2": 3,
  "eu-west-1": 4,
  "eu-west-2": 5,
  "eu-west-3": 6,
  "eu-central-1": 7,
  "ap-southeast-1": 8,
  "ap-southeast-2": 9,
  "ap-northeast-1": 10,
  "ap-northeast-2": 11,
  "sa-east-1": 12,
  "ca-central-1": 13,
  "ap-south-1": 14,
};

/**
 * @returns {{
 *   enabled: boolean,
 *   customerId: string,
 *   customerSecret: string,
 *   recordingUid: string,
 *   storageConfig: object | null,
 * }}
 */
export function getAgoraRecordingConfig() {
  const rtc = getAgoraRtcConfig();
  const customerId = (process.env.AGORA_CUSTOMER_ID || "").trim();
  const customerSecret = (process.env.AGORA_CUSTOMER_SECRET || "").trim();
  const recordingUid = (process.env.AGORA_RECORDING_UID || "999000001").trim();

  const bucket = (process.env.AWS_S3_BUCKET_NAME || "").trim();
  const accessKey = (process.env.AWS_ACCESS_KEY_ID || "").trim();
  const secretKey = (process.env.AWS_SECRET_ACCESS_KEY || "").trim();
  const awsRegion = (process.env.AWS_REGION || "us-east-1").trim().toLowerCase();
  const agoraRegion = AWS_REGION_TO_AGORA[awsRegion] ?? 0;

  const hasStorage = Boolean(bucket && accessKey && secretKey);
  const enabled = Boolean(
    rtc.enabled && customerId && customerSecret && hasStorage
  );

  const storageConfig = hasStorage
    ? {
        vendor: 1,
        region: agoraRegion,
        bucket,
        accessKey,
        secretKey,
        fileNamePrefix: ["teacher-call-recordings"],
      }
    : null;

  return {
    enabled,
    customerId,
    customerSecret,
    recordingUid,
    storageConfig,
  };
}

/** Human-readable list of missing config (for logs, no secrets). */
export function getAgoraRecordingDisableReasons() {
  const rtc = getAgoraRtcConfig();
  const reasons = [];
  if (!rtc.appId) reasons.push("AGORA_APP_ID");
  if (!rtc.appCertificate) reasons.push("AGORA_APP_CERTIFICATE");
  if (!(process.env.AGORA_CUSTOMER_ID || "").trim()) reasons.push("AGORA_CUSTOMER_ID");
  if (!(process.env.AGORA_CUSTOMER_SECRET || "").trim()) {
    reasons.push("AGORA_CUSTOMER_SECRET");
  }
  if (!(process.env.AWS_S3_BUCKET_NAME || "").trim()) reasons.push("AWS_S3_BUCKET_NAME");
  if (!(process.env.AWS_ACCESS_KEY_ID || "").trim()) reasons.push("AWS_ACCESS_KEY_ID");
  if (!(process.env.AWS_SECRET_ACCESS_KEY || "").trim()) {
    reasons.push("AWS_SECRET_ACCESS_KEY");
  }
  return reasons;
}
