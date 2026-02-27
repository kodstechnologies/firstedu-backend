import mongoose from "mongoose";
import TeacherRating from "../models/TeacherRating.js";
import Teacher from "../models/Teacher.js";
import { ApiError } from "../utils/ApiError.js";

const toObjectId = (id) =>
  typeof id === "string" ? new mongoose.Types.ObjectId(id) : id;

const upsert = async (teacherId, studentId, rating) => {
  const tid = toObjectId(teacherId);
  const sid = toObjectId(studentId);
  const doc = await TeacherRating.findOneAndUpdate(
    { teacher: tid, student: sid },
    { $set: { rating } },
    { new: true, upsert: true, runValidators: true }
  );
  return doc;
};

const getByTeacherAndStudent = async (teacherId, studentId) => {
  return await TeacherRating.findOne({
    teacher: toObjectId(teacherId),
    student: toObjectId(studentId),
  });
};

const getAggregationForTeacher = async (teacherId) => {
  const tid = toObjectId(teacherId);
  const result = await TeacherRating.aggregate([
    { $match: { teacher: tid } },
    { $group: { _id: null, avg: { $avg: "$rating" }, count: { $sum: 1 } } },
  ]);
  if (!result.length) return { averageRating: 0, ratingCount: 0 };
  return {
    averageRating: Math.round(result[0].avg * 100) / 100, // round to 2 decimal
    ratingCount: result[0].count,
  };
};

const updateTeacherRatingFields = async (teacherId, averageRating, ratingCount) => {
  return await Teacher.findByIdAndUpdate(
    toObjectId(teacherId),
    { $set: { averageRating, ratingCount } },
    { new: true }
  );
};

export default {
  upsert,
  getByTeacherAndStudent,
  getAggregationForTeacher,
  updateTeacherRatingFields,
};
