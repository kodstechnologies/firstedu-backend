import teacherWalletTransactionRepository from "../repository/teacherWalletTransaction.repository.js";

function signedAmountFromEntry(entry) {
  if (entry.kind === "credit") return entry.amount;
  if (entry.kind === "debit") return -entry.amount;
  return 0;
}

export function mapTransactionForApi(doc) {
  const e = doc.toObject ? doc.toObject() : doc;
  return {
    id: e._id,
    kind: e.kind,
    category: e.category,
    amount: e.amount,
    signedAmount: signedAmountFromEntry(e),
    balanceAfter: e.balanceAfter,
    title: e.title,
    description: e.description,
    referenceId: e.referenceId,
    referenceType: e.referenceType,
    meta: e.meta || {},
    createdAt: e.createdAt,
  };
}

export async function recordSessionEarning({
  teacherId,
  amount,
  balanceAfter,
  sessionId,
  sessionKind,
}) {
  const title =
    sessionKind === "chat" ? "Chat session earning" : "Voice call earning";
  const description =
    sessionKind === "chat"
      ? "Earnings credited from a completed chat session."
      : "Earnings credited from a completed voice call.";

  return await teacherWalletTransactionRepository.create({
    teacher: teacherId,
    kind: "credit",
    category: "session_earning",
    amount,
    balanceAfter,
    title,
    description,
    referenceId: sessionId,
    referenceType: "TeacherSession",
    meta: { sessionKind },
  });
}

export async function recordWithdrawalLock({
  teacherId,
  amount,
  balanceAfter,
  withdrawalRequestId,
}) {
  return await teacherWalletTransactionRepository.create({
    teacher: teacherId,
    kind: "debit",
    category: "withdrawal_lock",
    amount,
    balanceAfter,
    title: "Withdrawal requested",
    description:
      "Amount reserved for withdrawal pending admin review.",
    referenceId: withdrawalRequestId,
    referenceType: "TeacherWithdrawalRequest",
    meta: {},
  });
}

export async function recordWithdrawalPayout({
  teacherId,
  amount,
  balanceAfter,
  withdrawalRequestId,
}) {
  return await teacherWalletTransactionRepository.create({
    teacher: teacherId,
    kind: "info",
    category: "withdrawal_payout",
    amount,
    balanceAfter,
    title: "Withdrawal completed",
    description:
      "Your withdrawal has been approved and the amount was sent to your bank account.",
    referenceId: withdrawalRequestId,
    referenceType: "TeacherWithdrawalRequest",
    meta: {},
  });
}

export async function recordWithdrawalRefund({
  teacherId,
  amount,
  balanceAfter,
  withdrawalRequestId,
}) {
  return await teacherWalletTransactionRepository.create({
    teacher: teacherId,
    kind: "credit",
    category: "withdrawal_refund",
    amount,
    balanceAfter,
    title: "Withdrawal declined — refunded",
    description:
      "Your withdrawal request was declined. The amount was returned to your wallet.",
    referenceId: withdrawalRequestId,
    referenceType: "TeacherWithdrawalRequest",
    meta: {},
  });
}

export async function getTeacherTransactionHistory(teacherId, { page, limit } = {}) {
  const { items, pagination } = await teacherWalletTransactionRepository.findByTeacher(
    teacherId,
    { page, limit }
  );
  return {
    transactions: items.map((row) => mapTransactionForApi(row)),
    pagination,
  };
}
