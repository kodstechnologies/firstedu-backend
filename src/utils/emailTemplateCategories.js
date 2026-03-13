/**
 * Predefined email template categories and slugs.
 * Used for admin dropdown and template resolution.
 * When sending email: if admin-created template exists for (category, slug), use it; else use backend default.
 */
export const EMAIL_TEMPLATE_CATEGORIES = [
  {
    key: "registration",
    label: "Registration",
    slugs: [
      { key: "welcome_email", label: "Welcome Email" },
      { key: "email_verification", label: "Email Verification" },
    ],
    variables: ["{{name}}", "{{link}}", "{{email}}"],
  },
  {
    key: "login_otp",
    label: "Login / OTP",
    slugs: [
      { key: "password_reset", label: "Password Reset" },
      { key: "login_otp", label: "Login OTP" },
    ],
    variables: ["{{name}}", "{{otp}}", "{{link}}"],
  },
  {
    key: "enrolment",
    label: "Enrolment",
    slugs: [
      { key: "course_enrollment", label: "Course Enrollment Confirmation" },
      { key: "test_bundle_purchase", label: "Test Bundle Purchase Confirmation" },
      { key: "olympiad_registration", label: "Olympiad Registration Confirmation" },
      { key: "tournament_registration", label: "Tournament Registration Confirmation" },
      { key: "workshop_registration", label: "Workshop Registration Confirmation" },
    ],
    variables: ["{{name}}", "{{course}}", "{{testBundle}}", "{{event}}", "{{amount}}", "{{date}}"],
  },
  {
    key: "support_ticket",
    label: "Support Ticket",
    slugs: [
      { key: "ticket_received", label: "Ticket Received" },
      { key: "ticket_reply", label: "Ticket Update / Reply" },
    ],
    variables: ["{{name}}", "{{ticketId}}", "{{ticketNumber}}", "{{subject}}", "{{message}}", "{{link}}"],
  },
  {
    key: "teacher_application",
    label: "Teacher Application",
    slugs: [
      { key: "interview_scheduled", label: "Interview Scheduled" },
      { key: "approval", label: "Approval / Credentials" },
      { key: "rejection", label: "Rejection" },
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
