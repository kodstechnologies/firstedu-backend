/**
 * OTP Generator
 * Uses Node.js built-in `crypto.randomInt` for cryptographically secure random numbers.
 * Generates a 4-digit OTP to match the DLT-registered SMS template.
 */

import { randomInt } from 'crypto';

/**
 * Generates a cryptographically secure 4-digit OTP.
 * @returns {string} e.g. "4729"
 */
export const generateOTP = () => {
  // randomInt(min, max) → integer in [min, max)
  // 1000–9999 guarantees exactly 4 digits (no leading zeros)
  return randomInt(1000, 10000).toString();
};