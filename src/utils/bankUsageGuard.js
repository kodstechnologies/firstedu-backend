import { ApiError } from "./ApiError.js";
import Test from "../models/Test.js";

/**
 * Throws a descriptive 400 ApiError if the given question bank is referenced
 * by one or more tests. The error message lists every blocking test by name
 * so the admin knows exactly what to delete first.
 *
 * @param {string|ObjectId} bankId
 * @param {"edit"|"delete"} action - used to tailor the message
 */
export const assertBankNotInUse = async (bankId, action = "edit") => {
  const tests = await Test.find({ questionBank: bankId }).select("title").lean();
  if (tests.length === 0) return; // bank is free — allow the operation

  const testNames = tests.map((t) => `"${t.title}"`).join(", ");
  const verb = action === "delete" ? "delete" : "edit";

  throw new ApiError(
    400,
    `Cannot ${verb} this question bank because it is used in ${tests.length} test(s): ${testNames}. Please delete those tests first.`
  );
};
