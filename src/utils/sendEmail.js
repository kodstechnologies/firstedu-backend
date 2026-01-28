// utils/sendEmail.js
import nodemailer from 'nodemailer';
import dotenv from "dotenv";
import { ApiError } from './ApiError.js';

dotenv.config();

// Validate required environment variables
const requiredEnvVars = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_EMAIL', 'SMTP_PASSWORD'];
const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
  console.error(`⚠️  Missing required SMTP environment variables: ${missingVars.join(', ')}`);
  console.error('Please set these variables in your .env file');
}

// Create transporter with proper configuration
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT) || 587,
  secure: process.env.SMTP_SECURE === 'true' || process.env.SMTP_PORT === '465', // Convert to boolean
  auth: {
    user: process.env.SMTP_EMAIL,
    pass: process.env.SMTP_PASSWORD,
  },
  // Add timeout and connection options for better error handling
  connectionTimeout: 10000, // 10 seconds
  greetingTimeout: 10000,
  socketTimeout: 10000,
});

// Verify transporter configuration
transporter.verify((error, success) => {
  if (error) {
    console.error('❌ SMTP configuration error:', error.message);
    console.error('Please check your SMTP settings in .env file');
  } else {
    console.log('✅ SMTP server is ready to send emails');
  }
});

export const sendOTPEmail = async (email, otp, name) => {
  try {
    // Validate email parameter
    if (!email) {
      throw new ApiError(400, 'Email address is required');
    }

    // Validate environment variables are set
    if (missingVars.length > 0) {
      throw new ApiError(500, `SMTP configuration incomplete. Missing: ${missingVars.join(', ')}`);
    }

    const mailOptions = {
      from: `"Your App" <${process.env.SMTP_EMAIL}>`,
      to: email,
      subject: 'Your Password Change OTP',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Hello ${name || 'Student'},</h2>
          <p style="color: #666;">Use this OTP to change your password:</p>
          <div style="background-color: #f4f4f4; padding: 20px; text-align: center; margin: 20px 0; border-radius: 5px;">
            <h1 style="letter-spacing: 8px; color: #333; margin: 0;">${otp}</h1>
          </div>
          <p style="color: #666;">This OTP is valid for <strong>10 minutes</strong>.</p>
          <p style="color: #999; font-size: 12px;">If you didn't request this, please ignore this email.</p>
        </div>
      `,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`✅ Email sent successfully to ${email}. Message ID: ${info.messageId}`);
    return info;
  } catch (error) {
    console.error('❌ Error sending email:', error.message);
    // Re-throw as ApiError for proper error handling
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(500, `Failed to send email: ${error.message}`);
  }
};