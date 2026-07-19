import { AppError } from "../errors/AppError.js";

/**
 * Proves a request really came from the gateway.
 *
 * Why this exists: the services trust `x-user-id` to decide who is calling. That
 * is safe only if nobody but the gateway can set it. Locally the services are on
 * localhost, but once deployed each one has its own public URL — so without this
 * check anyone could call the chat service directly with `x-user-id: <victim>`
 * and read that person's data.
 *
 * The gateway signs every proxied request with a shared secret; each service
 * rejects anything that does not carry it. This is deliberately simple (a shared
 * secret, not mTLS) because it only has to hold up between our own services.
 */
export const requireInternalAuth = (req, res, next) => {
  const expected = process.env.INTERNAL_API_KEY;

  // Fail closed. A missing secret in config must not silently disable the check.
  if (!expected) {
    return next(
      AppError.internal("INTERNAL_API_KEY is not configured on this service")
    );
  }

  if (req.headers["x-internal-key"] !== expected) {
    req.log?.warn({ ip: req.ip, path: req.originalUrl }, "rejected non-gateway request");
    return next(AppError.forbidden("This endpoint can only be reached through the gateway"));
  }

  next();
};

/**
 * Turns the gateway's headers into req.user, and refuses to continue without one.
 * Run this after requireInternalAuth so the headers are known to be trustworthy.
 */
export const requireUser = (req, res, next) => {
  const userId = req.headers["x-user-id"];

  if (!userId) {
    return next(AppError.unauthorized());
  }

  req.user = {
    userId,
    email: req.headers["x-user-email"],
    avatar: req.headers["x-user-avatar"],
  };

  next();
};
