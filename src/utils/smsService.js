/**
 * SMS Service — EduMarc / ComBirds SMS Integration
 *
 * API endpoint: https://smsapi.edumarcsms.com/api/v1/sendsms
 *
 * DLT note: for India, the final `message` must exactly match the approved
 * template with {#var#} replaced by the OTP. Delivery failures such as
 * SMSC 5601 are usually DLT PE-TM chain / sender-header issues on the
 * provider side, not application code.
 */

import axios from 'axios';

const EDUMARC_BASE_URL = 'https://smsapi.edumarcsms.com/api/v1/sendsms';

const DEFAULT_TEMPLATE_MESSAGE =
  'Your login OTP for First Step Edutech TestLadr App is {#var#}. Please do not share it with anyone.';

const normalizeIndianPhone = phone => {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 12 && digits.startsWith('91')) return digits;
  return digits;
};

/**
 * Sends a 4-digit OTP to the given mobile number via EduMarc.
 *
 * @param {string} phone  - 10-digit Indian mobile number (no country code)
 * @param {string} otp    - The 4-digit OTP string to send
 * @returns {Promise<object>}
 */
export const sendOtpSms = async (phone, otp) => {
  const apiKey = process.env.EDUMARC_API_KEY;
  const templateId = process.env.EDUMARC_TEMPLATE_ID;
  const senderId = process.env.EDUMARC_SENDER_ID;
  const templateMsg =
    DEFAULT_TEMPLATE_MESSAGE;

  if (!apiKey || !templateId || !senderId) {
    throw new Error(
      'EduMarc credentials missing. Check EDUMARC_API_KEY, EDUMARC_TEMPLATE_ID, EDUMARC_SENDER_ID in .env'
    );
  }

  const recipient = normalizeIndianPhone(phone);
  const finalMessage = templateMsg.replace('{#var#}', String(otp));

  try {
    const response = await axios.post(
      EDUMARC_BASE_URL,
      {
        message: finalMessage,
        senderId,
        number: [recipient],
        templateId,
        smsType: 'OTP',
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
        },
      }
    );

    const transactionId = response.data?.data?.transactionId;
    console.log(
      `[SMS] OTP queued for ${recipient} via EduMarc.`,
      transactionId ? `transactionId=${transactionId}` : response.data
    );

    return response.data;
  } catch (error) {
    const errorMessage =
      error.response?.data?.message || error.response?.data || error.message;
    console.error(`[SMS Error] Failed to send OTP to ${recipient}:`, errorMessage);
    throw new Error(`EduMarc SMS error: ${JSON.stringify(errorMessage)}`);
  }
};
