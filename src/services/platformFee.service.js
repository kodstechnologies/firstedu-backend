import Teacher from "../models/Teacher.js";
import TeacherSession from "../models/TeacherSession.js";
import teacherRepository from "../repository/teacher.repository.js";
import { ApiError } from "../utils/ApiError.js";

export const roundMoney = (value) =>
  Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

export const getRateBreakdown = (teacher) => {
  const teacherPerMinuteRate = roundMoney(teacher?.perMinuteRate || 0);
  const platformFeePercent = Math.max(0, Number(teacher?.platformFeePercent || 0));
  const platformFeePerMinute = roundMoney(
    (teacherPerMinuteRate * platformFeePercent) / 100
  );
  const studentPerMinuteRate = roundMoney(
    teacherPerMinuteRate + platformFeePerMinute
  );

  return {
    teacherPerMinuteRate,
    platformFeePercent,
    platformFeePerMinute,
    studentPerMinuteRate,
  };
};

const teacherEarningExpression = {
  $cond: [
    { $gt: [{ $ifNull: ["$teacherAmount", 0] }, 0] },
    "$teacherAmount",
    {
      $cond: [
        { $gt: [{ $ifNull: ["$platformFeeAmount", 0] }, 0] },
        {
          $max: [
            0,
            {
              $subtract: [
                { $ifNull: ["$totalAmount", 0] },
                { $ifNull: ["$platformFeeAmount", 0] },
              ],
            },
          ],
        },
        {
          $cond: [
            {
              $and: [
                { $gt: [{ $ifNull: ["$teacherPerMinuteRate", 0] }, 0] },
                { $gt: [{ $ifNull: ["$durationMinutes", 0] }, 0] },
              ],
            },
            {
              $multiply: [
                { $ifNull: ["$teacherPerMinuteRate", 0] },
                { $ifNull: ["$durationMinutes", 0] },
              ],
            },
            { $ifNull: ["$totalAmount", 0] },
          ],
        },
      ],
    },
  ],
};

export const buildSessionRateSnapshot = (teacher) => {
  const breakdown = getRateBreakdown(teacher);
  return {
    perMinuteRate: breakdown.studentPerMinuteRate,
    ...breakdown,
  };
};

export const withStudentPricing = (teacher) => {
  const obj = teacher?.toObject ? teacher.toObject() : { ...teacher };
  const breakdown = getRateBreakdown(obj);
  return {
    ...obj,
    ...breakdown,
    perMinuteRate: breakdown.studentPerMinuteRate,
  };
};

const buildDateFilter = ({ from, to } = {}) => {
  const createdAt = {};
  if (from) createdAt.$gte = new Date(from);
  if (to) createdAt.$lte = new Date(to);
  return Object.keys(createdAt).length ? { createdAt } : {};
};

export const getPlatformFeeSummary = async (filters = {}) => {
  const match = {
    status: "completed",
    amountDeducted: true,
    ...buildDateFilter(filters),
  };

  const [summary] = await TeacherSession.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        totalCommission: { $sum: "$platformFeeAmount" },
        totalStudentCharged: { $sum: "$totalAmount" },
        totalTeacherEarnings: { $sum: teacherEarningExpression },
        totalSessions: { $sum: 1 },
      },
    },
  ]);

  return {
    totalCommission: roundMoney(summary?.totalCommission || 0),
    totalStudentCharged: roundMoney(summary?.totalStudentCharged || 0),
    totalTeacherEarnings: roundMoney(summary?.totalTeacherEarnings || 0),
    totalSessions: summary?.totalSessions || 0,
  };
};

export const getPlatformFeeTeachers = async (options = {}) => {
  const {
    page = 1,
    limit = 10,
    search,
    status,
    sortBy = "createdAt",
    sortOrder = "desc",
    from,
    to,
  } = options;

  const result = await teacherRepository.findAll(
    {},
    { page, limit, search, status, sortBy, sortOrder }
  );

  const teacherIds = result.teachers.map((teacher) => teacher._id);
  const match = {
    teacher: { $in: teacherIds },
    status: "completed",
    amountDeducted: true,
    ...buildDateFilter({ from, to }),
  };

  const commissions = await TeacherSession.aggregate([
    { $match: match },
    {
      $group: {
        _id: "$teacher",
        totalCommission: { $sum: "$platformFeeAmount" },
        totalStudentCharged: { $sum: "$totalAmount" },
        totalTeacherEarnings: { $sum: teacherEarningExpression },
        totalSessions: { $sum: 1 },
      },
    },
  ]);

  const commissionByTeacher = new Map(
    commissions.map((row) => [row._id.toString(), row])
  );

  const teachers = result.teachers.map((teacher) => {
    const teacherObj = teacher.toObject ? teacher.toObject() : teacher;
    const breakdown = getRateBreakdown(teacherObj);
    const commission = commissionByTeacher.get(teacherObj._id.toString()) || {};
    return {
      ...teacherObj,
      ...breakdown,
      totalCommission: roundMoney(commission.totalCommission || 0),
      totalStudentCharged: roundMoney(commission.totalStudentCharged || 0),
      totalTeacherEarnings: roundMoney(commission.totalTeacherEarnings || 0),
      totalSessions: commission.totalSessions || 0,
    };
  });

  return {
    teachers,
    pagination: result.pagination,
    summary: await getPlatformFeeSummary({ from, to }),
  };
};

export const updateTeacherPlatformFee = async (teacherId, platformFeePercent) => {
  if (platformFeePercent === undefined || platformFeePercent === null) {
    throw new ApiError(400, "platformFeePercent is required");
  }

  const percent = Number(platformFeePercent);
  if (!Number.isFinite(percent) || percent < 0) {
    throw new ApiError(400, "platformFeePercent must be a number >= 0");
  }

  const teacher = await Teacher.findByIdAndUpdate(
    teacherId,
    { $set: { platformFeePercent: percent } },
    { new: true, runValidators: true }
  ).select("-password -refreshToken -passwordResetOTP -passwordResetOTPExpires");

  if (!teacher) {
    throw new ApiError(404, "Teacher not found");
  }

  const teacherObj = teacher.toObject();
  return {
    ...teacherObj,
    ...getRateBreakdown(teacherObj),
  };
};

export default {
  roundMoney,
  getRateBreakdown,
  buildSessionRateSnapshot,
  withStudentPricing,
  getPlatformFeeSummary,
  getPlatformFeeTeachers,
  updateTeacherPlatformFee,
};
