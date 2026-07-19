import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import redis from "../../shared/redis/redis.js";
import { AppError } from "../../shared/errors/AppError.js";
import { env } from "../config/env.js";

/**
 * Global rate limiting, counted in Redis.
 *
 * Why Redis and not memory: the counter has to be shared. With in-memory counts,
 * running two instances doubles everyone's real limit, and every deploy resets
 * it to zero. Redis keeps one count across restarts and instances.
 *
 * Limits are per signed-in user where we know who they are, and per IP otherwise
 * — so one user hammering the API cannot exhaust the quota for everyone sharing
 * their network.
 */
export const globalRateLimit = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  limit: env.RATE_LIMIT_MAX,
  standardHeaders: "draft-7", // sends RateLimit-* headers so the UI can react
  legacyHeaders: false,
  store: new RedisStore({
    sendCommand: (...args) => redis.call(...args),
    prefix: "ratelimit:global:",
  }),
  // ipKeyGenerator normalises IPv6 to its /64 prefix. Using the raw address
  // would let one IPv6 client rotate through addresses it already owns and get
  // a fresh quota each time.
  keyGenerator: (req) => req.user?.userId ?? ipKeyGenerator(req.ip),
  handler: (req, res, next) => {
    next(AppError.tooManyRequests());
  },
});
