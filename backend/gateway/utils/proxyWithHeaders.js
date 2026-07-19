import proxy from "express-http-proxy";
import { env } from "../config/env.js";

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

/** For routes behind `protect`: forwards the authenticated user. */
export const proxyWithUser = (serviceUrl) =>
  proxy(serviceUrl, {
    proxyReqOptDecorator: decorateHeaders,
  });

/**
 * For public routes (login, logout). Still signs the request with the internal
 * key, but strips any user headers a client might have tried to inject.
 */
export const proxyPublic = (serviceUrl) =>
  proxy(serviceUrl, {
    proxyReqOptDecorator: decorateHeaders,
  });
