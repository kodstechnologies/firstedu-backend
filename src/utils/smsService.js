/**
 * SMS Service — EduMarc SMS Integration
 *
 * Always sends a real SMS via EduMarc SMS regardless of environment.
 * Credentials are read from environment variables.
 *
 * API endpoint: https://smsapi.edumarcsms.com/api/v1/sendsms
 */

import axios from 'axios';

const EDUMARC_BASE_URL = 'https://smsapi.edumarcsms.com/api/v1/sendsms';

/**
 * Sends a 4-digit OTP to the given mobile number via EduMarc.
 *
 * @param {string} phone  - 10-digit Indian mobile number (no country code)
 * @param {string} otp    - The 4-digit OTP string to send
 * @returns {Promise<void>}
 * @throws  {Error}        if credentials are missing or EduMarc returns an error
 */
export const sendOtpSms = async (phone, otp) => {
  const apiKey = process.env.EDUMARC_API_KEY;
  const templateId = process.env.EDUMARC_TEMPLATE_ID;
  const senderId = process.env.EDUMARC_SENDER_ID;

  if (!apiKey || !templateId || !senderId) {
    throw new Error(
      'EduMarc credentials missing. Check EDUMARC_API_KEY, EDUMARC_TEMPLATE_ID, EDUMARC_SENDER_ID in .env'
    );
  }

  // Exact template message hardcoded as requested
  const templateMsg = 'Your login OTP for First Step Edutech iScorre App is {#var#}. Please do not share it with anyone.';

  // Replace {#var#} placeholder with actual OTP
  const finalMessage = templateMsg.replace('{#var#}', otp);

  try {
    const response = await axios.post(
      EDUMARC_BASE_URL,
      {
        message: finalMessage,
        senderId: senderId,
        number: [phone], // Array of numbers
        templateId: templateId,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
        },
      }
    );

    console.log(`[SMS] OTP sent to ${phone} via EduMarc. Response:`, response.data);

    // Assuming success depends on HTTP status 200, though EduMarc might return a specific field
    return response.data;
  } catch (error) {
    // Handle error correctly
    const errorMessage =
      error.response?.data?.message || error.response?.data || error.message;
    console.error(`[SMS Error] Failed to send OTP to ${phone}:`, errorMessage);
    throw new Error(`EduMarc SMS error: ${JSON.stringify(errorMessage)}`);
  }
};
