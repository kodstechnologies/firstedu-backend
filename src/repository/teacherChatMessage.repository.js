import TeacherChatMessage from "../models/TeacherChatMessage.js";
import { ApiError } from "../utils/ApiError.js";
import mongoose from "mongoose";

const create = async (messageData) => {
  try {
    return await TeacherChatMessage.create(messageData);
  } catch (error) {
    throw new ApiError(500, "Failed to save chat message", error.message);
  }
};

const findBySession = async (sessionId, options = {}) => {
  try {
    const { page = 1, limit = 50, sortOrder = "asc" } = options;
    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const skip = (pageNum - 1) * limitNum;
    const sort = { sentAt: sortOrder === "desc" ? -1 : 1 };

    const query = { session: sessionId };
    const [messages, total] = await Promise.all([
      TeacherChatMessage.find(query).sort(sort).skip(skip).limit(limitNum).lean(),
      TeacherChatMessage.countDocuments(query),
    ]);

    return {
      messages,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum) || 1,
      },
    };
  } catch (error) {
    throw new ApiError(500, "Failed to fetch chat messages", error.message);
  }
};

const countBySession = async (sessionId) => {
  try {
    return await TeacherChatMessage.countDocuments({ session: sessionId });
  } catch (error) {
    throw new ApiError(500, "Failed to count chat messages", error.message);
  }
};

const findByStudentAndTeacher = async (studentId, teacherId, options = {}) => {
  try {
    const { page = 1, limit = 200, sortOrder = "asc" } = options;
    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const skip = (pageNum - 1) * limitNum;
    const sort = { sentAt: sortOrder === "desc" ? -1 : 1 };

    const query = { student: studentId, teacher: teacherId };
    const [messages, total] = await Promise.all([
      TeacherChatMessage.find(query).sort(sort).skip(skip).limit(limitNum).lean(),
      TeacherChatMessage.countDocuments(query),
    ]);

    return {
      messages,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum) || 1,
      },
    };
  } catch (error) {
    throw new ApiError(500, "Failed to fetch chat messages", error.message);
  }
};

const findConversationsByStudent = async (studentId, options = {}) => {
  try {
    const { page = 1, limit = 20, search } = options;
    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const skip = (pageNum - 1) * limitNum;

    const matchStage = {
      student: new mongoose.Types.ObjectId(String(studentId)),
    };
    const searchTrim = typeof search === "string" ? search.trim() : "";

    const pipeline = [
      { $match: matchStage },
      { $sort: { sentAt: -1 } },
      {
        $group: {
          _id: "$teacher",
          messageCount: { $sum: 1 },
          lastActivityAt: { $max: "$sentAt" },
          lastMessage: { $first: "$$ROOT" },
        },
      },
      { $sort: { lastActivityAt: -1 } },
      {
        $lookup: {
          from: "teachers",
          localField: "_id",
          foreignField: "_id",
          as: "teacherDoc",
        },
      },
      { $unwind: "$teacherDoc" },
    ];

    if (searchTrim) {
      const esc = searchTrim.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const rx = new RegExp(esc, "i");
      pipeline.push({
        $match: {
          $or: [
            { "teacherDoc.name": rx },
            { "teacherDoc.skills": rx },
            { "lastMessage.text": rx },
          ],
        },
      });
    }

    pipeline.push({
      $facet: {
        data: [
          { $skip: skip },
          { $limit: limitNum },
          {
            $project: {
              teacherId: "$_id",
              teacher: {
                _id: "$teacherDoc._id",
                name: "$teacherDoc.name",
                profileImage: "$teacherDoc.profileImage",
                skills: "$teacherDoc.skills",
              },
              messageCount: 1,
              lastActivityAt: 1,
              lastMessage: {
                text: "$lastMessage.text",
                from: "$lastMessage.from",
                sentAt: "$lastMessage.sentAt",
                attachment: "$lastMessage.attachment",
              },
            },
          },
        ],
        total: [{ $count: "count" }],
      },
    });

    const [result] = await TeacherChatMessage.aggregate(pipeline);
    const conversations = result?.data || [];
    const total = result?.total?.[0]?.count || 0;

    return {
      conversations,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum) || 1,
      },
    };
  } catch (error) {
    throw new ApiError(500, "Failed to fetch chat conversations", error.message);
  }
};

const findConversationsByTeacher = async (teacherId, options = {}) => {
  try {
    const { page = 1, limit = 20, search } = options;
    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const skip = (pageNum - 1) * limitNum;

    const matchStage = {
      teacher: new mongoose.Types.ObjectId(String(teacherId)),
    };
    const searchTrim = typeof search === "string" ? search.trim() : "";

    const pipeline = [
      { $match: matchStage },
      { $sort: { sentAt: -1 } },
      {
        $group: {
          _id: "$student",
          messageCount: { $sum: 1 },
          lastActivityAt: { $max: "$sentAt" },
          lastMessage: { $first: "$$ROOT" },
        },
      },
      { $sort: { lastActivityAt: -1 } },
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "_id",
          as: "studentDoc",
        },
      },
      { $unwind: "$studentDoc" },
    ];

    if (searchTrim) {
      const esc = searchTrim.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const rx = new RegExp(esc, "i");
      pipeline.push({
        $match: {
          $or: [
            { "studentDoc.name": rx },
            { "studentDoc.email": rx },
            { "studentDoc.phone": rx },
            { "lastMessage.text": rx },
          ],
        },
      });
    }

    pipeline.push({
      $facet: {
        data: [
          { $skip: skip },
          { $limit: limitNum },
          {
            $project: {
              studentId: "$_id",
              student: {
                _id: "$studentDoc._id",
                name: "$studentDoc.name",
                profileImage: "$studentDoc.profileImage",
                email: "$studentDoc.email",
                phone: "$studentDoc.phone",
              },
              messageCount: 1,
              lastActivityAt: 1,
              lastMessage: {
                text: "$lastMessage.text",
                from: "$lastMessage.from",
                sentAt: "$lastMessage.sentAt",
                attachment: "$lastMessage.attachment",
              },
            },
          },
        ],
        total: [{ $count: "count" }],
      },
    });

    const [result] = await TeacherChatMessage.aggregate(pipeline);
    const conversations = result?.data || [];
    const total = result?.total?.[0]?.count || 0;

    return {
      conversations,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum) || 1,
      },
    };
  } catch (error) {
    throw new ApiError(500, "Failed to fetch chat conversations", error.message);
  }
};

const findStudentsWithChats = async (options = {}) => {
  try {
    const { page = 1, limit = 20, search } = options;
    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const skip = (pageNum - 1) * limitNum;
    const searchTrim = typeof search === "string" ? search.trim() : "";

    const pipeline = [
      { $sort: { sentAt: -1 } },
      {
        $group: {
          _id: "$student",
          messageCount: { $sum: 1 },
          lastActivityAt: { $max: "$sentAt" },
          lastMessage: { $first: "$$ROOT" },
          teacherIds: { $addToSet: "$teacher" },
        },
      },
      { $sort: { lastActivityAt: -1 } },
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "_id",
          as: "studentDoc",
        },
      },
      { $unwind: "$studentDoc" },
    ];

    if (searchTrim) {
      const esc = searchTrim.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const rx = new RegExp(esc, "i");
      pipeline.push({
        $match: {
          $or: [
            { "studentDoc.name": rx },
            { "studentDoc.email": rx },
            { "studentDoc.phone": rx },
            { "lastMessage.text": rx },
          ],
        },
      });
    }

    pipeline.push({
      $facet: {
        data: [
          { $skip: skip },
          { $limit: limitNum },
          {
            $project: {
              studentId: "$_id",
              student: {
                _id: "$studentDoc._id",
                name: "$studentDoc.name",
                profileImage: "$studentDoc.profileImage",
                email: "$studentDoc.email",
                phone: "$studentDoc.phone",
              },
              messageCount: 1,
              conversationCount: { $size: "$teacherIds" },
              lastActivityAt: 1,
              lastMessage: {
                text: "$lastMessage.text",
                from: "$lastMessage.from",
                sentAt: "$lastMessage.sentAt",
                attachment: "$lastMessage.attachment",
              },
            },
          },
        ],
        total: [{ $count: "count" }],
      },
    });

    const [result] = await TeacherChatMessage.aggregate(pipeline);
    const students = result?.data || [];
    const total = result?.total?.[0]?.count || 0;

    return {
      students,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum) || 1,
      },
    };
  } catch (error) {
    throw new ApiError(500, "Failed to fetch students with chat logs", error.message);
  }
};

const findTeachersWithChats = async (options = {}) => {
  try {
    const { page = 1, limit = 20, search } = options;
    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const skip = (pageNum - 1) * limitNum;
    const searchTrim = typeof search === "string" ? search.trim() : "";

    const pipeline = [
      { $sort: { sentAt: -1 } },
      {
        $group: {
          _id: "$teacher",
          messageCount: { $sum: 1 },
          lastActivityAt: { $max: "$sentAt" },
          lastMessage: { $first: "$$ROOT" },
          studentIds: { $addToSet: "$student" },
        },
      },
      { $sort: { lastActivityAt: -1 } },
      {
        $lookup: {
          from: "teachers",
          localField: "_id",
          foreignField: "_id",
          as: "teacherDoc",
        },
      },
      { $unwind: "$teacherDoc" },
    ];

    if (searchTrim) {
      const esc = searchTrim.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const rx = new RegExp(esc, "i");
      pipeline.push({
        $match: {
          $or: [
            { "teacherDoc.name": rx },
            { "teacherDoc.skills": rx },
            { "lastMessage.text": rx },
          ],
        },
      });
    }

    pipeline.push({
      $facet: {
        data: [
          { $skip: skip },
          { $limit: limitNum },
          {
            $project: {
              teacherId: "$_id",
              teacher: {
                _id: "$teacherDoc._id",
                name: "$teacherDoc.name",
                profileImage: "$teacherDoc.profileImage",
                skills: "$teacherDoc.skills",
              },
              messageCount: 1,
              conversationCount: { $size: "$studentIds" },
              lastActivityAt: 1,
              lastMessage: {
                text: "$lastMessage.text",
                from: "$lastMessage.from",
                sentAt: "$lastMessage.sentAt",
                attachment: "$lastMessage.attachment",
              },
            },
          },
        ],
        total: [{ $count: "count" }],
      },
    });

    const [result] = await TeacherChatMessage.aggregate(pipeline);
    const teachers = result?.data || [];
    const total = result?.total?.[0]?.count || 0;

    return {
      teachers,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum) || 1,
      },
    };
  } catch (error) {
    throw new ApiError(500, "Failed to fetch teachers with chat logs", error.message);
  }
};

export default {
  create,
  findBySession,
  countBySession,
  findByStudentAndTeacher,
  findConversationsByStudent,
  findConversationsByTeacher,
  findStudentsWithChats,
  findTeachersWithChats,
};
