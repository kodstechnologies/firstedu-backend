import Joi from "joi";

const objectId = Joi.string().regex(/^[0-9a-fA-F]{24}$/);

const createForum = Joi.object({
  title: Joi.string().trim().required(),
  description: Joi.string().trim().allow("", null).optional(),
  category: Joi.string().trim().optional(),
  tags: Joi.array().items(Joi.string().trim()).optional(),
});

const updateForum = Joi.object({
  title: Joi.string().trim().optional(),
  description: Joi.string().trim().allow("", null).optional(),
  category: Joi.string().trim().optional(),
  tags: Joi.array().items(Joi.string().trim()).optional(),
});

const createForumThread = Joi.object({
  title: Joi.string().trim().required(),
  content: Joi.string().trim().required(),
});

const addPostToThread = Joi.object({
  content: Joi.string().trim().required(),
});

const replyToPost = Joi.object({
  content: Joi.string().trim().required(),
});

export default {
  createForum,
  updateForum,
  createForumThread,
  addPostToThread,
  replyToPost,
};

