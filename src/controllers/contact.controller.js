import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { sendContactUsEmail } from "../utils/sendEmail.js";
import userValidator from "../validation/student.validator.js";

/**
 * Contact Us - Student submits name, phone, email, message.
 * No JWT required. Email is sent to admin.
 */
export const contactUs = asyncHandler(async (req, res) => {
  const { error, value } = userValidator.contactUs.validate(req.body);

  if (error) {
    throw new ApiError(400, "Validation Error", error.details.map((x) => x.message));
  }

  const { name, phone, email, message } = value;

  await sendContactUsEmail({ name, phone, email, message });

  return res
    .status(200)
    .json(ApiResponse.success(null, "Your message has been sent. We will get back to you soon."));
});
