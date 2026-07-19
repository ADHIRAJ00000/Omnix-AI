import express from "express";
import {
  createConversation,
  getConversations,
  getMessages,
  saveMessage,
  updateConversation,
} from "../controllers/chat.controller.js";
import { asyncHandler } from "../../../shared/http/asyncHandler.js";
import { validate } from "../../../shared/http/validate.js";
import {
  requireInternalAuth,
  requireUser,
} from "../../../shared/http/internalAuth.js";
import {
  conversationIdParamSchema,
  createConversationSchema,
  saveMessageSchema,
  updateConversationSchema,
} from "../schemas/chat.schema.js";

const router = express.Router();

// Applies to every route below: the request must have come through the gateway,
// and it must carry a user. Handlers can then assume req.user exists.
router.use(requireInternalAuth, requireUser);

router.post(
  "/create-conversation",
  validate(createConversationSchema),
  asyncHandler(createConversation)
);

router.get("/get-conversations", asyncHandler(getConversations));

router.post(
  "/update-conversation",
  validate(updateConversationSchema),
  asyncHandler(updateConversation)
);

router.post(
  "/save-message",
  validate(saveMessageSchema),
  asyncHandler(saveMessage)
);

router.get(
  "/get-messages/:id",
  validate(conversationIdParamSchema),
  asyncHandler(getMessages)
);

export default router;
