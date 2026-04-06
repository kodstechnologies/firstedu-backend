/**
 * Map a Mongo ObjectId to a stable Agora RTC uid (32-bit unsigned, non-zero).
 * Each distinct id should map to a distinct uid with very low collision probability in practice.
 */
export function agoraUidFromObjectId(id) {
  const s = String(id);
  let hash = 2166136261;
  for (let i = 0; i < s.length; i++) {
    hash ^= s.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  let uid = hash >>> 0;
  if (uid === 0) uid = 1;
  return uid;
}
