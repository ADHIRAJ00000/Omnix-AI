import express from "express";
import { chat } from "../controllers/agent.controller.js";
import upload from "../config/multer.js";
import { asyncHandler } from "../../../shared/http/asyncHandler.js";
import { validate } from "../../../shared/http/validate.js";
import {
  requireInternalAuth,
  requireUser,
} from "../../../shared/http/internalAuth.js";
import { chatSchema } from "../schemas/agent.schema.js";

const router = express.Router();

router.use(requireInternalAuth, requireUser);

router.post(
  "/chat",
  // multer must run before validation: it is what parses multipart bodies, so
  // req.body does not exist yet at this point in the chain.
  upload.single("file"),
  validate(chatSchema),
  asyncHandler(chat)
);

export default router;
