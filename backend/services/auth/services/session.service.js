import crypto from "node:crypto";
import redis from "../../../shared/redis/redis.js";
import { env } from "../config/env.js";

/**
 * Sessions live in Redis under two keys:
 *   session:{sessionId}      -> the user snapshot the gateway reads on each request
 *   user-session:{userId}    -> that user's current sessionId, so we can refresh
 *                               the snapshot when their credits or plan change
 *
 * The snapshot is deliberately small and contains nothing secret: the gateway
 * copies parts of it into request headers, so anything in here is effectively
 * visible to every service.
 */
const sessionSnapshot = (user) => ({
  userId: user._id,
  email: user.email,
  avatar: user.avatar,
  name: user.name,
  plan: user.plan,
  credits: user.credits,
  totalCredits: user.totalCredits,
});

export const createSession = async (user) => {
  const sessionId = crypto.randomUUID();

  await redis.set(`user-session:${user._id}`, sessionId, "EX", env.SESSION_TTL_SECONDS);
  await redis.set(
    `session:${sessionId}`,
    JSON.stringify(sessionSnapshot(user)),
    "EX",
    env.SESSION_TTL_SECONDS
  );

  return sessionId;
};

/**
 * Rewrites the cached snapshot after the user's credits or plan change.
 *
 * Without this the gateway would keep handing out a stale credit balance until
 * the session expired — the user would see the old number for up to a week.
 */
export const refreshSession = async (user) => {
  const sessionId = await redis.get(`user-session:${user._id}`);
  if (!sessionId) return;

  // Preserve the existing expiry instead of extending it: refreshing a balance
  // should not silently give someone a brand new week of session lifetime.
  const remainingTtl = await redis.ttl(`session:${sessionId}`);
  const ttl = remainingTtl > 0 ? remainingTtl : env.SESSION_TTL_SECONDS;

  await redis.set(`session:${sessionId}`, JSON.stringify(sessionSnapshot(user)), "EX", ttl);
};

export const destroySession = async (sessionId) => {
  if (!sessionId) return;

  const raw = await redis.get(`session:${sessionId}`);
  await redis.del(`session:${sessionId}`);

  // Also drop the reverse lookup, otherwise it lingers pointing at a dead session.
  if (raw) {
    const { userId } = JSON.parse(raw);
    await redis.del(`user-session:${userId}`);
  }
};

export const cookieOptions = () => ({
  httpOnly: true,
  // Cross-site in production (frontend on Vercel, API on Render), so the cookie
  // must be SameSite=None — which browsers only accept when Secure is also set.
  secure: env.NODE_ENV === "production",
  sameSite: env.NODE_ENV === "production" ? "none" : "lax",
  maxAge: env.SESSION_TTL_SECONDS * 1000,
});
