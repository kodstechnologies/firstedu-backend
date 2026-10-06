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
  const tests = await Test.find({ questionBank: bankId }).select("title _id").lean();
  if (tests.length === 0) return; // bank is free — allow the operation

  const testNames = tests.map((t) => `"${t.title}"`).join(", ");

  if (action === "delete") {
    throw new ApiError(
      400,
      `Cannot delete this question bank because it is used in ${tests.length} test(s): ${testNames}. Please delete those tests first.`
    );
  }

  // action === "edit"
  const mongoose = await import("mongoose");
  const ExamSession = mongoose.default.model("ExamSession");
  
  const testIds = tests.map(t => t._id);
  const sessionCount = await ExamSession.countDocuments({ test: { $in: testIds } });

  if (sessionCount > 0) {
    throw new ApiError(
      400,
      `Cannot edit this question bank because it is used in ${tests.length} test(s): ${testNames}, and students have already attempted it. Please delete the tests or create a new question bank.`
    );
  }
};
