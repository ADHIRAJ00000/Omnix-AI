import redis from "../../../shared/redis/redis.js";
import { AppError } from "../../../shared/errors/AppError.js";

/**
 * Throttles credential-guessing.
 *
 * The gateway's global limit is far too generous for a login form — it exists to
 * stop API abuse, not password guessing. This is deliberately tight.
 *
 * Counted per email *and* per IP: keying on IP alone lets an attacker spread
 * guesses for one account across many addresses, while keying on email alone
 * lets anyone lock a victim out of their own account by failing on purpose.
 * Requiring both to stay under the limit closes each hole with the other.
 */
const MAX_ATTEMPTS = 10;
const WINDOW_SECONDS = 15 * 60;

export const loginRateLimit = async (req, res, next) => {
  const email = req.body?.email?.toLowerCase() ?? "unknown";
  const keys = [`login-attempts:email:${email}`, `login-attempts:ip:${req.ip}`];

  try {
    for (const key of keys) {
      const [[, count]] = await redis
        .multi()
        .incr(key)
        .expire(key, WINDOW_SECONDS, "NX")
        .exec();

      if (count > MAX_ATTEMPTS) {
        const ttl = await redis.ttl(key);
        const minutes = Math.max(1, Math.ceil(ttl / 60));

        req.log.warn({ email, ip: req.ip }, "login rate limit hit");

        throw AppError.tooManyRequests(
          `Too many sign-in attempts. Please try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`
        );
      }
    }

    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Clears the counters after a successful sign-in, so someone who mistypes a few
 * times and then gets it right is not left near the limit.
 */
export const clearLoginAttempts = async (email, ip) => {
  await redis.del(`login-attempts:email:${email?.toLowerCase()}`, `login-attempts:ip:${ip}`);
};
