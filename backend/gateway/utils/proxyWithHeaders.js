import proxy from "express-http-proxy";
import { env } from "../config/env.js";
import { AppError } from "../../shared/errors/AppError.js";

/**
 * Builds the headers every proxied request carries downstream.
 *
 * Two jobs:
 *  - x-internal-key proves to the service that this request came from the
 *    gateway. Services reject anything without it, which is what stops someone
 *    calling a service's public URL directly and spoofing x-user-id.
 *  - x-request-id lets a single user action be traced across every service it
 *    touches.
 */
/**
 * Turns a failure to reach a service into a clear 503.
 *
 * This matters on a free hosting tier, where idle services are put to sleep and
 * the first request after a nap arrives while the service is still waking up.
 * Reported as a generic 500 that looks like a bug; as a 503 the frontend can
 * tell the user to wait a moment and retry, which is the truth.
 */
const proxyErrorHandler = (serviceName) => (err, res, next) => {
  if (err.code === "ECONNREFUSED" || err.code === "ETIMEDOUT" || err.code === "ECONNRESET") {
    return next(
      new AppError(
        503,
        "SERVICE_UNAVAILABLE",
        "That part of the service is starting up. Please try again in a few seconds."
      )
    );
  }

  return next(err);
};

const decorateHeaders = (proxyReqOpts, srcReq) => {
  proxyReqOpts.headers["x-internal-key"] = env.INTERNAL_API_KEY;
  proxyReqOpts.headers["x-request-id"] = srcReq.id;

  // The client must never be able to set these itself, so we always overwrite
  // rather than merge — otherwise a forged x-user-id header would pass straight
  // through on any route where req.user happens to be unset.
  if (srcReq.user) {
    proxyReqOpts.headers["x-user-id"] = srcReq.user.userId;
    proxyReqOpts.headers["x-user-email"] = srcReq.user.email;
    proxyReqOpts.headers["x-user-avatar"] = srcReq.user.avatar ?? "";
  } else {
    delete proxyReqOpts.headers["x-user-id"];
    delete proxyReqOpts.headers["x-user-email"];
    delete proxyReqOpts.headers["x-user-avatar"];
  }

  return proxyReqOpts;
};

/**
 * For routes behind `protect`: forwards the authenticated user.
 *
 * `targetPrefix` rewrites the downstream path, needed when the public URL and
 * the service's own route differ — /api/me reads better for the frontend than
 * /api/auth/me, but the auth service only knows about /me.
 *
 * The remainder of the path is appended rather than discarded, so /api/me and
 * /api/me/transactions both reach the right route. Mounting with app.use
 * strips the mount prefix, leaving req.url as "/" or "/transactions".
 */
export const proxyWithUser = (serviceUrl, targetPrefix) =>
  proxy(serviceUrl, {
    proxyReqOptDecorator: decorateHeaders,
    proxyErrorHandler: proxyErrorHandler(serviceUrl),
    ...(targetPrefix
      ? {
          proxyReqPathResolver: (req) => {
            const rest = req.url === "/" ? "" : req.url;
            return `${targetPrefix}${rest}`;
          },
        }
      : {}),
  });

/**
 * For public routes (login, logout). Still signs the request with the internal
 * key, but strips any user headers a client might have tried to inject.
 */
export const proxyPublic = (serviceUrl) =>
  proxy(serviceUrl, {
    proxyReqOptDecorator: decorateHeaders,
    proxyErrorHandler: proxyErrorHandler(serviceUrl),
  });
