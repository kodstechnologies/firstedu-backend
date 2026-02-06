import { Router } from "express";
import { handleRazorpayWebhook } from "../controllers/webhook.controller.js";

const router = Router();

router.post("/", handleRazorpayWebhook);

export default router;
