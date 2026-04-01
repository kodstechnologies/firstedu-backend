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
