/**
 * Predefined email template categories and slugs.
 * Used for admin dropdown and template resolution.
 * When sending email: if admin-created template exists for (category, slug), use it; else use backend default.
 */
export const EMAIL_TEMPLATE_CATEGORIES = [
  {
    key: "registration",
    label: "Registration",
    description: "User onboarding and account verification templates.",
    audience: "student",
    slugs: [
      {
        key: "welcome_email",
        label: "Welcome Email",
        description: "Sent after successful signup.",
        requiredVariables: ["name"],
        defaultSubject: "Welcome to Iscorre, {{name}}!",
        defaultContent: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #333;">Hello {{name}},</h2>
            <p style="color: #666;">Welcome to Iscorre. We are excited to have you with us.</p>
            <p style="color: #666;">Start exploring courses, tests, and learning tools from your dashboard.</p>
            <p style="color: #999; font-size: 12px;">Iscorre Team</p>
          </div>
        `,
      },
      {
        key: "email_verification",
        label: "Email Verification",
        description: "Sent when user must verify email address.",
        requiredVariables: ["name", "link"],
        defaultSubject: "Verify your Iscorre email address",
        defaultContent: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #333;">Hello {{name}},</h2>
            <p style="color: #666;">Please verify your email address to continue using your Iscorre account.</p>
            <p><a href="{{link}}" style="display:inline-block;padding:10px 16px;background:#2563eb;color:#fff;text-decoration:none;border-radius:4px;">Verify Email</a></p>
            <p style="color: #999; font-size: 12px;">If this was not you, please ignore this email.</p>
          </div>
        `,
      },
    ],
    variables: ["{{name}}", "{{link}}", "{{email}}"],
  },
  {
    key: "login_otp",
    label: "Login / OTP",
    description: "Authentication and password reset templates.",
    audience: "all_users",
    slugs: [
      {
        key: "password_reset",
        label: "Password Reset",
        description: "OTP used in forgot password flow.",
        requiredVariables: ["name", "otp"],
        defaultSubject: "Your Password Change OTP",
        defaultContent: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #333;">Hello {{name}},</h2>
            <p style="color: #666;">Use this OTP to change your password:</p>
            <div style="background-color: #f4f4f4; padding: 20px; text-align: center; margin: 20px 0; border-radius: 5px;">
              <h1 style="letter-spacing: 8px; color: #333; margin: 0;">{{otp}}</h1>
            </div>
            <p style="color: #666;">This OTP is valid for <strong>10 minutes</strong>.</p>
            <p style="color: #999; font-size: 12px;">If you did not request this, please ignore this email.</p>
          </div>
        `,
      },
      {
        key: "login_otp",
        label: "Login OTP",
        description: "OTP for login verification / MFA style login.",
        requiredVariables: ["name", "otp"],
        defaultSubject: "Your Iscorre login OTP",
        defaultContent: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #333;">Hello {{name}},</h2>
            <p style="color: #666;">Use the OTP below to complete your login:</p>
            <div style="background-color: #f4f4f4; padding: 20px; text-align: center; margin: 20px 0; border-radius: 5px;">
              <h1 style="letter-spacing: 8px; color: #333; margin: 0;">{{otp}}</h1>
            </div>
            <p style="color: #666;">This OTP is valid for a short time only.</p>
            <p style="color: #999; font-size: 12px;">Do not share this OTP with anyone.</p>
          </div>
        `,
      },
    ],
    variables: ["{{name}}", "{{otp}}", "{{link}}"],
  },
  {
    key: "enrolment",
    label: "Enrolment",
    description: "Course, test, workshop and competition enrollment confirmations.",
    audience: "student",
    slugs: [
      {
        key: "course_enrollment",
        label: "Course Enrollment Confirmation",
        description: "Sent when a learner enrolls in a course.",
        requiredVariables: ["name", "course", "amount", "date"],
        defaultSubject: "Enrollment confirmed: {{course}}",
        defaultContent: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #333;">Hello {{name}},</h2>
            <p style="color: #666;">Your enrollment is confirmed for <strong>{{course}}</strong>.</p>
            <p style="color: #666;">Amount: <strong>{{amount}}</strong> | Date: <strong>{{date}}</strong></p>
            <p style="color: #999; font-size: 12px;">Happy learning with Iscorre.</p>
          </div>
        `,
      },
      {
        key: "test_bundle_purchase",
        label: "Test Bundle Purchase Confirmation",
        description: "Sent after test bundle purchase.",
        requiredVariables: ["name", "testBundle", "amount", "date"],
        defaultSubject: "Test bundle purchase confirmed",
        defaultContent: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #333;">Hello {{name}},</h2>
            <p style="color: #666;">Your test bundle purchase is successful.</p>
            <p style="color: #666;">Bundle: <strong>{{testBundle}}</strong></p>
            <p style="color: #666;">Amount: <strong>{{amount}}</strong> | Date: <strong>{{date}}</strong></p>
            <p style="color: #999; font-size: 12px;">All the best for your preparation.</p>
          </div>
        `,
      },
      {
        key: "olympiad_registration",
        label: "Olympiad Registration Confirmation",
        description: "Sent after olympiad registration.",
        requiredVariables: ["name", "event", "amount", "date"],
        defaultSubject: "Olympiad registration confirmed",
        defaultContent: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #333;">Hello {{name}},</h2>
            <p style="color: #666;">You are successfully registered for <strong>{{event}}</strong>.</p>
            <p style="color: #666;">Amount: <strong>{{amount}}</strong> | Date: <strong>{{date}}</strong></p>
            <p style="color: #999; font-size: 12px;">Best wishes from Iscorre.</p>
          </div>
        `,
      },
      {
        key: "tournament_registration",
        label: "Tournament Registration Confirmation",
        description: "Sent after tournament registration.",
        requiredVariables: ["name", "event", "amount", "date"],
        defaultSubject: "Tournament registration confirmed",
        defaultContent: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #333;">Hello {{name}},</h2>
            <p style="color: #666;">Your registration for <strong>{{event}}</strong> is confirmed.</p>
            <p style="color: #666;">Amount: <strong>{{amount}}</strong> | Date: <strong>{{date}}</strong></p>
            <p style="color: #999; font-size: 12px;">See you at the event.</p>
          </div>
        `,
      },
      {
        key: "workshop_registration",
        label: "Workshop Registration Confirmation",
        description: "Sent after workshop registration.",
        requiredVariables: ["name", "event", "amount", "date"],
        defaultSubject: "Workshop registration confirmed",
        defaultContent: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #333;">Hello {{name}},</h2>
            <p style="color: #666;">You are successfully registered for <strong>{{event}}</strong>.</p>
            <p style="color: #666;">Amount: <strong>{{amount}}</strong> | Date: <strong>{{date}}</strong></p>
            <p style="color: #999; font-size: 12px;">Thank you for choosing Iscorre.</p>
          </div>
        `,
      },
    ],
    variables: ["{{name}}", "{{course}}", "{{testBundle}}", "{{event}}", "{{amount}}", "{{date}}"],
  },
  {
    key: "support_ticket",
    label: "Support Ticket",
    description: "Support ticket acknowledgment and updates.",
    audience: "all_users",
    slugs: [
      {
        key: "ticket_received",
        label: "Ticket Received",
        description: "Sent when support ticket is created.",
        requiredVariables: ["name", "ticketNumber", "subject"],
        defaultSubject: "Ticket received: {{ticketNumber}}",
        defaultContent: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #333;">Hello {{name}},</h2>
            <p style="color: #666;">We have received your support ticket.</p>
            <p style="color: #666;">Ticket No: <strong>{{ticketNumber}}</strong></p>
            <p style="color: #666;">Subject: <strong>{{subject}}</strong></p>
            <p style="color: #999; font-size: 12px;">Our team will respond shortly.</p>
          </div>
        `,
      },
      {
        key: "ticket_reply",
        label: "Ticket Update / Reply",
        description: "Sent when support team replies to ticket.",
        requiredVariables: ["name", "ticketNumber", "message"],
        defaultSubject: "Update on ticket {{ticketNumber}}",
        defaultContent: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #333;">Hello {{name}},</h2>
            <p style="color: #666;">There is an update on your ticket <strong>{{ticketNumber}}</strong>.</p>
            <p style="color: #666;">{{message}}</p>
            <p style="color: #999; font-size: 12px;">Please reply if you need more help.</p>
          </div>
        `,
      },
    ],
    variables: ["{{name}}", "{{ticketId}}", "{{ticketNumber}}", "{{subject}}", "{{message}}", "{{link}}"],
  },
  {
    key: "teacher_application",
    label: "Teacher Application",
    description: "Teacher job application lifecycle notifications.",
    audience: "teacher",
    slugs: [
      {
        key: "interview_scheduled",
        label: "Interview Scheduled",
        description: "Sent when interview date/time is assigned.",
        requiredVariables: ["name", "jobTitle", "interviewDate", "interviewTime", "providerLink"],
        defaultSubject: "Interview Scheduled - {{jobTitle}}",
        defaultContent: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #333;">Hello {{name}},</h2>
            <p style="color: #666;">Your interview is scheduled for <strong>{{jobTitle}}</strong>.</p>
            <p style="color: #666;">Date: <strong>{{interviewDate}}</strong></p>
            <p style="color: #666;">Time: <strong>{{interviewTime}}</strong></p>
            <p style="color: #666;">Join Link: <a href="{{providerLink}}">{{providerLink}}</a></p>
            <p style="color: #999; font-size: 12px;">Iscorre Teacher Connect</p>
          </div>
        `,
      },
      {
        key: "approval",
        label: "Approval / Credentials",
        description: "Sent when teacher profile is approved and credentials are shared.",
        requiredVariables: ["name", "email", "password"],
        defaultSubject: "Congratulations - You have been selected as a Teacher",
        defaultContent: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #333;">Hello {{name}},</h2>
            <p style="color: #666;">Congratulations! You have been selected as a teacher.</p>
            <p style="color: #666;">Login Email: <strong>{{email}}</strong></p>
            <p style="color: #666;">Password: <strong>{{password}}</strong></p>
            <p style="color: #999; font-size: 12px;">Please change your password after first login.</p>
          </div>
        `,
      },
      {
        key: "approval_confirmation",
        label: "Approval Confirmation",
        description: "Sent when teacher is approved but credentials are not included.",
        requiredVariables: ["name", "jobTitle"],
        defaultSubject: "Congratulations - You are selected as a Teacher",
        defaultContent: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #333;">Hello {{name}},</h2>
            <p style="color: #666;">Congratulations! You have been selected for {{jobTitle}}.</p>
            <p style="color: #666;">You will receive login details separately.</p>
            <p style="color: #999; font-size: 12px;">Iscorre Teacher Connect</p>
          </div>
        `,
      },
      {
        key: "rejection",
        label: "Rejection",
        description: "Sent when teacher application is not selected.",
        requiredVariables: ["name", "jobTitle"],
        defaultSubject: "Update on your application - {{jobTitle}}",
        defaultContent: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #333;">Hello {{name}},</h2>
            <p style="color: #666;">Thank you for applying for <strong>{{jobTitle}}</strong>.</p>
            <p style="color: #666;">At this time, we are not moving forward with your application.</p>
            <p style="color: #999; font-size: 12px;">We appreciate your interest in Iscorre.</p>
          </div>
        `,
      },
    ],
    variables: ["{{name}}", "{{jobTitle}}", "{{interviewDate}}", "{{interviewTime}}", "{{providerLink}}", "{{email}}", "{{password}}"],
  },
];

export const getCategoryByKey = (key) =>
  EMAIL_TEMPLATE_CATEGORIES.find((c) => c.key === key);

export const getSlugByKey = (categoryKey, slugKey) => {
  const category = getCategoryByKey(categoryKey);
  if (!category) return null;
  return category.slugs.find((s) => s.key === slugKey) || null;
};

export const isValidCategorySlug = (categoryKey, slugKey) =>
  Boolean(getSlugByKey(categoryKey, slugKey));

export const getDefaultTemplateByCategorySlug = (categoryKey, slugKey) => {
  const slug = getSlugByKey(categoryKey, slugKey);
  if (!slug) return null;
  return {
    subject: slug.defaultSubject || "",
    html: slug.defaultContent || "",
    requiredVariables: slug.requiredVariables || [],
  };
};
