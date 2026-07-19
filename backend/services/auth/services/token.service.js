import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import redis from "../../../shared/redis/redis.js";
import { env } from "../config/env.js";
import { AppError } from "../../../shared/errors/AppError.js";

/**
 * ============================================================================
 * Two-token authentication with refresh rotation and reuse detection
 * ============================================================================
 *
 * ACCESS TOKEN  — a signed JWT, ~15 minutes, never stored server-side.
 *   The gateway verifies the signature locally, so checking a request costs no
 *   database or Redis lookup. The trade-off is that it cannot be revoked early,
 *   which is exactly why it is short-lived.
 *
 * REFRESH TOKEN — a random opaque string, 7 days, stored in Redis, sent only as
 *   an httpOnly cookie. It is not a JWT: nothing about it needs to be readable
 *   by the client, and storing it server-side is what makes revocation possible.
 *
 * ROTATION — every use of a refresh token issues a brand new one and retires the
 *   old. A stolen token is therefore only useful until the real user next
 *   refreshes.
 *
 * REUSE DETECTION — this is the part that makes rotation worth doing. Retired
 *   tokens are kept, marked as used. If a retired token is ever presented again,
 *   there are two copies in circulation, which means one was stolen. We cannot
 *   tell whether the thief or the victim is the one asking, so we revoke the
 *   entire family: every refresh token descended from that login is destroyed
 *   and both parties must sign in again. The user is inconvenienced once; the
 *   attacker loses access entirely.
 *
 * FAMILY — all the tokens descended from a single login share a familyId, which
 *   is what lets one reuse revoke the whole chain rather than a single link.
 */

const refreshKey = (tokenId) => `refresh:${tokenId}`;
const familyKey = (familyId) => `refresh-family:${familyId}`;

export const signAccessToken = (user) =>
  jwt.sign(
    {
      sub: user._id.toString(),
      email: user.email,
    },
    env.JWT_ACCESS_SECRET,
    { expiresIn: env.ACCESS_TOKEN_TTL }
  );

/**
 * Issues a refresh token, optionally continuing an existing family.
 *
 * The token itself is 32 random bytes. Only its id is used as the Redis key;
 * the secret half is compared on use, so a leaked list of Redis keys is not
 * enough to authenticate.
 */
const issueRefreshToken = async (userId, familyId) => {
  const tokenId = crypto.randomUUID();
  const secret = crypto.randomBytes(32).toString("hex");
  const family = familyId ?? crypto.randomUUID();

  await redis.set(
    refreshKey(tokenId),
    JSON.stringify({
      userId: userId.toString(),
      familyId: family,
      // Stored hashed: if someone reads Redis they still cannot present a valid
      // token, the same reason we never store passwords in plain text.
      secretHash: crypto.createHash("sha256").update(secret).digest("hex"),
      used: false,
    }),
    "EX",
    env.REFRESH_TOKEN_TTL_SECONDS
  );

  // Index of every token in this family, so one reuse can revoke all of them.
  await redis.sadd(familyKey(family), tokenId);
  await redis.expire(familyKey(family), env.REFRESH_TOKEN_TTL_SECONDS);

  return { token: `${tokenId}.${secret}`, familyId: family };
};

export const createRefreshToken = (userId) => issueRefreshToken(userId, undefined);

/** Destroys every refresh token descended from one login. */
const revokeFamily = async (familyId) => {
  const tokenIds = await redis.smembers(familyKey(familyId));

  if (tokenIds.length > 0) {
    await redis.del(...tokenIds.map(refreshKey));
  }

  await redis.del(familyKey(familyId));
};

/**
 * Exchanges a refresh token for a new pair.
 *
 * Returns the user id and the replacement token, or throws if the token is
 * unknown, malformed, or has already been used.
 */
export const rotateRefreshToken = async (presented, log) => {
  if (!presented || typeof presented !== "string") {
    throw AppError.unauthorized("Please sign in again");
  }

  const [tokenId, secret] = presented.split(".");

  if (!tokenId || !secret) {
    throw AppError.unauthorized("Please sign in again");
  }

  const raw = await redis.get(refreshKey(tokenId));

  // Unknown token: either expired, already revoked, or never existed.
  if (!raw) {
    throw AppError.unauthorized("Your session has expired, please sign in again");
  }

  const record = JSON.parse(raw);

  const presentedHash = crypto.createHash("sha256").update(secret).digest("hex");
  const expected = Buffer.from(record.secretHash, "utf8");
  const actual = Buffer.from(presentedHash, "utf8");

  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
    throw AppError.unauthorized("Please sign in again");
  }

  /**
   * The token is valid but was already spent. Two copies exist, so one is
   * stolen — revoke the whole family and force a fresh login.
   */
  if (record.used) {
    log?.warn(
      { userId: record.userId, familyId: record.familyId },
      "refresh token reuse detected, revoking token family"
    );

    await revokeFamily(record.familyId);

    throw AppError.unauthorized(
      "For your security we signed you out. Please sign in again."
    );
  }

  /**
   * Mark spent rather than delete.
   *
   * Deleting would make a replay look identical to an expired token, and we
   * would never learn a theft had happened. Keeping it for the rest of its
   * original lifetime is what makes detection possible at all.
   */
  await redis.set(
    refreshKey(tokenId),
    JSON.stringify({ ...record, used: true }),
    "KEEPTTL"
  );

  const next = await issueRefreshToken(record.userId, record.familyId);

  return { userId: record.userId, refreshToken: next.token };
};

/** Signs out one device by revoking the family its token belongs to. */
export const revokeRefreshToken = async (presented) => {
  if (!presented || typeof presented !== "string") return;

  const [tokenId] = presented.split(".");
  if (!tokenId) return;

  const raw = await redis.get(refreshKey(tokenId));
  if (!raw) return;

  const { familyId } = JSON.parse(raw);
  await revokeFamily(familyId);
};

export const verifyAccessToken = (token) => {
  try {
    return jwt.verify(token, env.JWT_ACCESS_SECRET);
  } catch {
    return null;
  }
};

/**
 * The refresh cookie.
 *
 * Scoped with `path` so the browser only sends it to the refresh and logout
 * endpoints — it is never attached to ordinary API calls, which shrinks the
 * surface for it to leak. In production the frontend and API are on different
 * domains, so SameSite must be None, which browsers only honour alongside Secure.
 */
export const refreshCookieOptions = (path = "/api/auth") => ({
  httpOnly: true,
  secure: env.NODE_ENV === "production",
  sameSite: env.NODE_ENV === "production" ? "none" : "lax",
  path,
  maxAge: env.REFRESH_TOKEN_TTL_SECONDS * 1000,
});
