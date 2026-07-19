import { internalClient } from "./internalClient.js";
import { env } from "../config/env.js";
import { AppError } from "../../../shared/errors/AppError.js";

/**
 * Charges the user for an agent run.
 *
 * `runId` ties every charge made while serving one request together. It matters
 * because a single request can charge more than once — a search request pays
 * for the search agent and then the chat agent — and a refund has to reverse
 * all of them. It is also the idempotency key, so a retried call cannot charge
 * the same work twice.
 */
export const deductCredits = async (userId, agent, { runId, conversationId } = {}) => {
  try {
    await internalClient.patch(
      `${env.AUTH_SERVICE}/internal/deduct-credits`,
      { userId, agent, runId, conversationId },
      { headers: runId ? { "x-request-id": runId } : {} }
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
 * Returns everything a failed run was charged.
 *
 * Deliberately never throws: it runs on the failure path, and a refund problem
 * must not replace the original error the user needs to see. A failure is
 * logged instead, so the discrepancy stays visible rather than silent.
 */
export const refundCredits = async (userId, runId, { log } = {}) => {
  if (!runId) return;

  try {
    const { data } = await internalClient.patch(
      `${env.AUTH_SERVICE}/internal/refund-credits`,
      { userId, runId },
      { headers: { "x-request-id": runId } }
    );

    if (data?.refunded > 0) {
      log?.info({ userId, runId, refunded: data.refunded }, "credits refunded after failed run");
    }
  } catch (error) {
    log?.error(
      { err: error, userId, runId },
      "refund failed, user may have been charged for a failed run"
    );
  }
};
