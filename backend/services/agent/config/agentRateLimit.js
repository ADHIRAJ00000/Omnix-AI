import redis from "../../../shared/redis/redis.js";
import { AppError } from "../../../shared/errors/AppError.js";

/**
 * Per-agent, per-user rate limits.
 *
 * Separate from the gateway's global limit because the costs differ wildly: a
 * chat turn is cheap, while generating a deck calls a model repeatedly. These
 * caps are what stop one user from burning the whole free-tier provider quota
 * in a couple of minutes.
 */
const LIMITS = {
  chat: 20,
  coding: 5,
  pdf: 5,
  ppt: 5,
  image: 3,
  search: 5,
  vision: 5,
  pdfRag: 5,
};

const WINDOW_SECONDS = 60;

export const checkAgentLimit = async (userId, agent) => {
  const max = LIMITS[agent] ?? LIMITS.chat;
  const key = `rate:${agent}:${userId}`;

  /**
   * INCR and EXPIRE in one round trip.
   *
   * Done separately, a crash between the two leaves a key with no expiry — the
   * counter then never resets and that user is locked out of the agent forever.
   * A pipeline sends both together so that gap cannot open.
   */
  const [[, count]] = await redis
    .multi()
    .incr(key)
    .expire(key, WINDOW_SECONDS, "NX") // NX: only set the expiry on the first increment
    .exec();

  if (count > max) {
    const ttl = await redis.ttl(key);
    const wait = ttl > 0 ? `${ttl}s` : "a moment";

    throw new AppError(
      429,
      "AGENT_RATE_LIMITED",
      `You have reached the ${agent} limit of ${max} requests per minute. Try again in ${wait}.`,
      { agent, limit: max, retryAfterSeconds: ttl > 0 ? ttl : WINDOW_SECONDS }
    );
  }

  return { remaining: max - count, limit: max };
};
