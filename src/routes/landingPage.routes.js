import express from "express";
import {
  getAvailableTeachers,
  getTeacherById,
} from "../controllers/studentTeacherConnect.controller.js";
import { getHallOfFame } from "../controllers/hallOfFame.controller.js";
import { getLeaderboardsForStudent } from "../controllers/leaderboard.controller.js";
import {
  getCourseById,
  getCourses,
  getTestById,
  getTests,
  getTestsAndBundles,
} from "../controllers/marketplace.controller.js";
import {
  getAllApplyJobsUser,
  getApplyJobByIdUser,
} from "../controllers/teacherConnectApply.controller.js";
import { getAllBlogs, getBlogById } from "../controllers/blog.controller.js";
import { getAllEvents } from "../controllers/events.controller.js";
import { getAllStoriesAdmin } from "../controllers/successStory.controller.js";
import {
  getAllPressAnnouncementsAdmin,
  getPressAnnouncementByIdAdmin,
} from "../controllers/pressAnnouncement.controller.js";
import { getAllQnAsLandingPage } from "../controllers/qna.controller.js";
import { getCategoriesForStudent } from "../controllers/category.controller.js";

import { contactUs } from "../controllers/contact.controller.js";

const router = express.Router();

//start Landing Page routes
router.post("/contact-us", contactUs);
router.get("/success-stories", getAllStoriesAdmin);
router.get("/press-announcements", getAllPressAnnouncementsAdmin);
router.get("/press-announcements/:id", getPressAnnouncementByIdAdmin);
router.get("/teachers", getAvailableTeachers);
router.get("/teachers/:teacherId", getTeacherById);
router.get("/hall-of-fame", getHallOfFame);
router.get("/leaderboard", getLeaderboardsForStudent);
router.get("/tests", getTests);
router.get("/tests-and-bundles", getTestsAndBundles);
router.get("/tests/:id", getTestById);
router.get("/teachers", getAvailableTeachers);
router.get("/teacher-connect/jobs", getAllApplyJobsUser);
router.get("/teacher-connect/jobs/:id", getApplyJobByIdUser);
router.get("/blogs", getAllBlogs);
router.get("/blogs/:id", getBlogById);
router.get("/courses", getCourses);
router.get("/courses/:id", getCourseById);
router.get("/events", getAllEvents);
router.get("/qna", getAllQnAsLandingPage);
router.get("/categories", getCategoriesForStudent);

export default router;
