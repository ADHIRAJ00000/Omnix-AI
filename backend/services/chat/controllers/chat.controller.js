import Conversation from "../models/conversation.model.js";
import Message from "../models/message.model.js";
import { AppError } from "../../../shared/errors/AppError.js";

/**
 * Loads a conversation and proves the caller owns it.
 *
 * Every endpoint that touches a conversation goes through here. Without this
 * check, knowing (or guessing) a conversation id was enough to read or rename
 * someone else's chat — the id alone was treated as permission.
 *
 * Returns 404 rather than 403 for a conversation owned by someone else: replying
 * "this exists but is not yours" would confirm to a stranger that the id is real.
 */
const loadOwnedConversation = async (conversationId, userId) => {
  const conversation = await Conversation.findById(conversationId);

  if (!conversation || conversation.userId !== userId) {
    throw AppError.notFound("Conversation not found");
  }

  return conversation;
};

export const createConversation = async (req, res) => {
  const conversation = await Conversation.create({
    userId: req.user.userId,
    ...(req.body.title ? { title: req.body.title } : {}),
  });

  req.log.info({ conversationId: conversation._id }, "conversation created");

  res.status(201).json(conversation);
};

export const getConversations = async (req, res) => {
  const conversations = await Conversation.find({
    userId: req.user.userId,
  }).sort({ updatedAt: -1 });

  res.json(conversations);
};

export const updateConversation = async (req, res) => {
  const { conversationId, title } = req.body;

  await loadOwnedConversation(conversationId, req.user.userId);

  // Only `title` is updatable. Spreading the whole body here would let a client
  // rewrite userId and hand their conversation to somebody else.
  const conversation = await Conversation.findByIdAndUpdate(
    conversationId,
    { title },
    { new: true }
  );

  res.json(conversation);
};

export const saveMessage = async (req, res) => {
  const { conversationId, role, content, images, artifacts } = req.body;

  await loadOwnedConversation(conversationId, req.user.userId);

  const message = await Message.create({
    conversationId,
    role,
    content,
    images,
    artifacts,
  });

  res.status(201).json(message);
};

export const getMessages = async (req, res) => {
  await loadOwnedConversation(req.params.id, req.user.userId);

  const messages = await Message.find({
    conversationId: req.params.id,
  }).sort({ createdAt: 1 });

  res.json(messages);
};
