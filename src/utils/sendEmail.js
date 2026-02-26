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

/**
 * Send contact us form details to admin email (no JWT required).
 * @param {Object} payload - { name, phone, email, message }
 */
export const sendContactUsEmail = async ({ name, phone, email, message }) => {
  try {
    if (!email || !name || !message) {
      throw new ApiError(400, 'Name, email and message are required');
    }
    if (missingVars.length > 0) {
      throw new ApiError(500, `SMTP configuration incomplete. Missing: ${missingVars.join(', ')}`);
    }

    const adminEmail = process.env.ADMIN_EMAIL || process.env.SMTP_EMAIL;
    if (!adminEmail) {
      throw new ApiError(500, 'Admin email not configured (set ADMIN_EMAIL or SMTP_EMAIL)');
    }

    const mailOptions = {
      from: `"FirstEdu Contact" <${process.env.SMTP_EMAIL}>`,
      to: adminEmail,
      replyTo: email,
      subject: `Contact Us: ${name}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">New Contact Form Submission</h2>
          <table style="width: 100%; border-collapse: collapse; color: #666;">
            <tr><td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Name</strong></td><td style="padding: 8px 0; border-bottom: 1px solid #eee;">${name}</td></tr>
            <tr><td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Email</strong></td><td style="padding: 8px 0; border-bottom: 1px solid #eee;">${email}</td></tr>
            <tr><td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Phone</strong></td><td style="padding: 8px 0; border-bottom: 1px solid #eee;">${phone || '—'}</td></tr>
            <tr><td style="padding: 8px 0; vertical-align: top;"><strong>Message</strong></td><td style="padding: 8px 0;">${message.replace(/\n/g, '<br>')}</td></tr>
          </table>
          <p style="color: #999; font-size: 12px; margin-top: 20px;">Sent from FirstEdu Contact Us form.</p>
        </div>
      `,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`✅ Contact form email sent to admin. Message ID: ${info.messageId}`);
    return info;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    console.error('❌ Error sending contact email:', error.message);
    throw new ApiError(500, `Failed to send contact email: ${error.message}`);
  }
};

/**
 * Send interview schedule details to teacher (Teacher Connect Apply Job).
 * @param {Object} payload - { toEmail, teacherName, jobTitle, interviewDate, interviewTime, interviewProvider, providerLink }
 */
export const sendInterviewScheduledEmail = async ({
  toEmail,
  teacherName,
  jobTitle,
  interviewDate,
  interviewTime,
  interviewProvider,
  providerLink,
}) => {
  try {
    if (!toEmail || !jobTitle) {
      throw new ApiError(400, "Recipient email and job title are required");
    }
    if (missingVars.length > 0) {
      throw new ApiError(500, `SMTP configuration incomplete. Missing: ${missingVars.join(", ")}`);
    }

    const dateStr = interviewDate ? new Date(interviewDate).toLocaleDateString("en-IN", { dateStyle: "long" }) : "—";
    const mailOptions = {
      from: `"FirstEdu Teacher Connect" <${process.env.SMTP_EMAIL}>`,
      to: toEmail,
      subject: `Interview Scheduled – ${jobTitle}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Hello ${teacherName || "Candidate"},</h2>
          <p style="color: #666;">Your interview has been scheduled for the position: <strong>${jobTitle}</strong>.</p>
          <table style="width: 100%; border-collapse: collapse; color: #666;">
            <tr><td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Date</strong></td><td style="padding: 8px 0; border-bottom: 1px solid #eee;">${dateStr}</td></tr>
            <tr><td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Time</strong></td><td style="padding: 8px 0; border-bottom: 1px solid #eee;">${interviewTime || "—"}</td></tr>
            <tr><td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Platform</strong></td><td style="padding: 8px 0; border-bottom: 1px solid #eee;">${interviewProvider || "—"}</td></tr>
            <tr><td style="padding: 8px 0;"><strong>Join Link</strong></td><td style="padding: 8px 0;">${providerLink ? `<a href="${providerLink}">${providerLink}</a>` : "—"}</td></tr>
          </table>
          <p style="color: #999; font-size: 12px; margin-top: 20px;">FirstEdu Teacher Connect</p>
        </div>
      `,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`✅ Interview scheduled email sent to ${toEmail}. Message ID: ${info.messageId}`);
    return info;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    console.error("❌ Error sending interview email:", error.message);
    throw new ApiError(500, `Failed to send interview email: ${error.message}`);
  }
};

/**
 * Send approval and login credentials to teacher (Teacher Connect Apply Job).
 * @param {Object} payload - { toEmail, teacherName, email, password }
 */
export const sendTeacherApprovalWithCredentialsEmail = async ({
  toEmail,
  teacherName,
  email,
  password,
}) => {
  try {
    if (!toEmail || !email || !password) {
      throw new ApiError(400, "Recipient email, login email and password are required");
    }
    if (missingVars.length > 0) {
      throw new ApiError(500, `SMTP configuration incomplete. Missing: ${missingVars.join(", ")}`);
    }

    const mailOptions = {
      from: `"FirstEdu Teacher Connect" <${process.env.SMTP_EMAIL}>`,
      to: toEmail,
      subject: "Congratulations – You have been selected as a Teacher",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Hello ${teacherName || "Teacher"},</h2>
          <p style="color: #666;">Congratulations! You have been selected. Please use the following credentials to log in to the teacher portal.</p>
          <table style="width: 100%; border-collapse: collapse; color: #666;">
            <tr><td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Email</strong></td><td style="padding: 8px 0; border-bottom: 1px solid #eee;">${email}</td></tr>
            <tr><td style="padding: 8px 0;"><strong>Password</strong></td><td style="padding: 8px 0;"><code style="background: #f4f4f4; padding: 4px 8px;">${password}</code></td></tr>
          </table>
          <p style="color: #666;">Please change your password after first login.</p>
          <p style="color: #999; font-size: 12px; margin-top: 20px;">FirstEdu Teacher Connect</p>
        </div>
      `,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`✅ Teacher approval email sent to ${toEmail}. Message ID: ${info.messageId}`);
    return info;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    console.error("❌ Error sending approval email:", error.message);
    throw new ApiError(500, `Failed to send approval email: ${error.message}`);
  }
};

/**
 * Send rejection email to teacher (Teacher Connect Apply Job).
 * @param {Object} payload - { toEmail, teacherName, jobTitle }
 */
export const sendTeacherRejectionEmail = async ({ toEmail, teacherName, jobTitle }) => {
  try {
    if (!toEmail) {
      throw new ApiError(400, "Recipient email is required");
    }
    if (missingVars.length > 0) {
      throw new ApiError(500, `SMTP configuration incomplete. Missing: ${missingVars.join(", ")}`);
    }

    const mailOptions = {
      from: `"FirstEdu Teacher Connect" <${process.env.SMTP_EMAIL}>`,
      to: toEmail,
      subject: `Update on your application – ${jobTitle || "Teacher Position"}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Hello ${teacherName || "Candidate"},</h2>
          <p style="color: #666;">Thank you for your interest. After careful consideration, we have decided not to move forward with your application for ${jobTitle ? `<strong>${jobTitle}</strong>` : "this position"}.</p>
          <p style="color: #666;">We encourage you to apply for other openings in the future.</p>
          <p style="color: #999; font-size: 12px; margin-top: 20px;">FirstEdu Teacher Connect</p>
        </div>
      `,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`✅ Teacher rejection email sent to ${toEmail}. Message ID: ${info.messageId}`);
    return info;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    console.error("❌ Error sending rejection email:", error.message);
    throw new ApiError(500, `Failed to send rejection email: ${error.message}`);
  }
};