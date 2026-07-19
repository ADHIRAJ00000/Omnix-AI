import redis from "../../shared/redis/redis.js";
import { AppError } from "../../shared/errors/AppError.js";
import { asyncHandler } from "../../shared/http/asyncHandler.js";

/**
 * Turns the session cookie into req.user.
 *
 * The session lives in Redis, so signing out (or expiry) takes effect
 * immediately across every service — unlike a self-contained token, which stays
 * valid until it expires no matter what the server thinks.
 */
export const protect = asyncHandler(async (req, res, next) => {
  const sessionId = req.cookies?.session;

  if (!sessionId) {
    throw AppError.unauthorized();
  }

  const session = await redis.get(`session:${sessionId}`);

  if (!session) {
    throw AppError.unauthorized("Your session has expired, please sign in again");
  }

  req.user = JSON.parse(session);
  req.log = req.log.child({ userId: req.user.userId });

  next();
});
