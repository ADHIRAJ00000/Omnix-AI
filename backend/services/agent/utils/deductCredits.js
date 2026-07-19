import { internalClient } from "./internalClient.js";
import { env } from "../config/env.js";
import { AppError } from "../../../shared/errors/AppError.js";

/**
 * Charges the user for an agent run.
 *
 * Translates the auth service's reply into an AppError so it flows through the
 * same error handler as everything else. A 402 is passed through unchanged —
 * "not enough credits" is the user's answer, and the UI keys off that code to
 * show the upgrade prompt.
 */
export const deductCredits = async (userId, agent, requestId) => {
  try {
    await internalClient.patch(
      `${env.AUTH_SERVICE}/internal/deduct-credits`,
      { userId, agent },
      { headers: requestId ? { "x-request-id": requestId } : {} }
    );
  } catch (error) {
    // The internal client has already turned any 4xx into an AppError carrying
    // the auth service's own message and code, so a 402 arrives ready to return.
    if (error instanceof AppError) {
      throw error;
    }

    throw AppError.internal("Could not process credits for this request");
  }
};

/**
 * Returns credits after a run that was charged but then failed.
 *
 * Deliberately never throws: it runs on the failure path, and a refund problem
 * must not replace the original error the user actually needs to see. It is
 * logged instead so the discrepancy is still visible.
 */
export const refundCredits = async (userId, agent, { log, requestId } = {}) => {
  try {
    await internalClient.patch(
      `${env.AUTH_SERVICE}/internal/refund-credits`,
      { userId, agent },
      { headers: requestId ? { "x-request-id": requestId } : {} }
    );
    log?.info({ userId, agent }, "credits refunded after failed run");
  } catch (error) {
    log?.error({ err: error, userId, agent }, "refund failed, user was charged for a failed run");
  }
};
