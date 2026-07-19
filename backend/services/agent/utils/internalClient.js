import axios from "axios";
import { env } from "../config/env.js";
import { AppError } from "../../../shared/errors/AppError.js";

/**
 * The one HTTP client for calling other services.
 *
 * Why it exists: every service now rejects requests that do not carry the shared
 * internal key. Setting that header by hand at each call site meant one missed
 * spot silently broke a feature in production. Here it is attached once, along
 * with a timeout so a hung downstream service cannot pin an agent run open
 * indefinitely.
 */
export const internalClient = axios.create({
  timeout: 30_000,
  headers: { "x-internal-key": env.INTERNAL_API_KEY },
});

/**
 * Preserves the meaning of a downstream failure.
 *
 * Every service already replies in the shared { message, code } shape. Without
 * this, an axios rejection surfaced as an opaque 500 — the chat service saying
 * "that conversation is not yours" (404) reached the user as "something went
 * wrong on our side", which is both wrong and unactionable.
 *
 * Client errors (4xx) are the caller's answer and are passed through intact.
 * Server errors stay a 500, because a downstream service being broken really is
 * our problem, not something the user can fix.
 */
internalClient.interceptors.response.use(undefined, (error) => {
  const status = error.response?.status;
  const body = error.response?.data;

  if (status && status >= 400 && status < 500) {
    return Promise.reject(
      new AppError(status, body?.code ?? "UPSTREAM_ERROR", body?.message ?? "Request failed", body?.details)
    );
  }

  return Promise.reject(error);
});

/**
 * Calls made on a user's behalf must also carry that user's identity, because
 * the downstream service uses it to check ownership. Without it, the chat
 * service cannot tell whose conversation is being written to.
 */
export const asUser = (userId, requestId) => ({
  headers: {
    "x-user-id": userId,
    ...(requestId ? { "x-request-id": requestId } : {}),
  },
});
