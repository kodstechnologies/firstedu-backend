const PRIVATE_LAN_HOST =
  /^(localhost|127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3})$/;

const DEFAULT_ORIGINS = [
  "https://iscorre.com",
  "https://app.iscorre.com",
  "http://localhost:3000",
  "http://localhost:5174",
  "http://localhost:5173",
];

export function getAllowedCorsOrigins() {
  const fromEnv = process.env.CORS_ORIGIN?.split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  return fromEnv?.length ? fromEnv : DEFAULT_ORIGINS;
}

/** Allow explicit list + any private-LAN origin in non-production (Wi‑Fi device testing). */
export function isCorsOriginAllowed(origin) {
  if (!origin) return true;

  const allowed = getAllowedCorsOrigins();
  if (allowed.includes(origin)) return true;

  if (process.env.NODE_ENV === "production") return false;

  try {
    const { hostname, protocol } = new URL(origin);
    if (protocol !== "http:" && protocol !== "https:") return false;
    return PRIVATE_LAN_HOST.test(hostname);
  } catch {
    return false;
  }
}
