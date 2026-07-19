import redis from "../../../shared/redis/redis.js";
import { getConversationHistory } from "./getConv.js";
import { env } from "../config/env.js";

const MEMORY_TTL_SECONDS = 86_400;

const memoryKey = (conversationId) => `conversation:${conversationId}`;

/**
 * The conversation window the model sees.
 *
 * Redis is a cache, MongoDB is the source of truth: on a miss we refill from the
 * chat service. The window is capped so a long conversation cannot grow the
 * prompt without limit — that would eventually exceed the model's context and
 * make every request progressively more expensive.
 *
 * userId is threaded through because the chat service verifies ownership before
 * returning history.
 */
export const getMemory = async (conversationId, userId, requestId) => {
  const key = memoryKey(conversationId);

  const cached = await redis.get(key);
  if (cached) {
    return JSON.parse(cached);
  }

  const messages = await getConversationHistory(conversationId, userId, requestId);
  const window = messages.slice(-env.MAX_MEMORY_MESSAGES);

  await redis.set(key, JSON.stringify(window), "EX", MEMORY_TTL_SECONDS);

  return window;
};

export const addMessage = async (conversationId, role, content) => {
  const key = memoryKey(conversationId);

  const existing = await redis.get(key);
  const messages = existing ? JSON.parse(existing) : [];

  messages.push({ role, content });

  // Trim from the front so the newest messages are the ones kept.
  const window = messages.slice(-env.MAX_MEMORY_MESSAGES);

  await redis.set(key, JSON.stringify(window), "EX", MEMORY_TTL_SECONDS);
};

/**
 * Drops the cached window.
 *
 * Needed when a run fails partway: the user's message may already be in the
 * cache while the assistant reply never arrived, leaving Redis holding a
 * conversation shape that does not match MongoDB.
 */
export const clearMemory = async (conversationId) => {
  await redis.del(memoryKey(conversationId));
};
