import User from "../models/user.model.js";
import CreditLedger from "../models/creditLedger.model.js";
import { AppError } from "../../../shared/errors/AppError.js";
import { costForAgent } from "../config/credits.js";

/**
 * ============================================================================
 * Credits: a cached balance plus an append-only ledger
 * ============================================================================
 *
 * user.credits is the fast path — every agent run checks it, so it has to be a
 * single indexed read, not a sum over the user's whole history.
 *
 * CreditLedger is the truth about *how* the balance got there. The two are
 * written together, and reconcile() proves they still agree.
 *
 * The ordering below is deliberate: the balance changes first, atomically and
 * conditionally, and the ledger entry is written only once that has succeeded.
 * Doing it the other way round would mean a crash in between leaves a ledger
 * entry describing a charge that never happened — and a ledger that overstates
 * what was taken is worse than one that briefly lags.
 */

const keyFor = (runId, agentType, reason) =>
  runId ? `${runId}:${agentType ?? "none"}:${reason}` : undefined;

/**
 * Charges for one agent run.
 *
 * The balance update is conditional on there being enough credits, so two runs
 * starting at the same instant cannot both pass the check against one balance.
 */
export const chargeForAgentRun = async ({ userId, agent, runId, conversationId, log }) => {
  const amount = costForAgent(agent);
  const idempotencyKey = keyFor(runId, agent, "agent_run");

  /**
   * If this exact charge was already recorded, the caller is retrying something
   * that already succeeded — return the existing result rather than charging
   * again. Checked before touching the balance so a retry is free.
   */
  if (idempotencyKey) {
    const existing = await CreditLedger.findOne({ idempotencyKey });

    if (existing) {
      log?.info({ userId, runId, agent }, "charge already recorded, not charging again");
      const user = await User.findById(userId);
      return { credits: user?.credits ?? existing.balanceAfter, alreadyApplied: true };
    }
  }

  const user = await User.findOneAndUpdate(
    { _id: userId, credits: { $gte: amount } },
    { $inc: { credits: -amount } },
    { returnDocument: "after" }
  );

  if (!user) {
    const exists = await User.exists({ _id: userId });

    if (!exists) {
      throw AppError.notFound("User not found");
    }

    throw AppError.paymentRequired("You do not have enough credits for this action", {
      required: amount,
      agent,
    });
  }

  try {
    await CreditLedger.create({
      userId: userId.toString(),
      delta: -amount,
      reason: "agent_run",
      agentType: agent,
      conversationId,
      runId,
      balanceAfter: user.credits,
      idempotencyKey,
    });
  } catch (error) {
    /**
     * Two identical charges raced and both got past the check above. The other
     * one won the unique index, so this one must give its money back rather
     * than charge twice for the same work.
     */
    if (error?.code === 11000) {
      await User.findByIdAndUpdate(userId, { $inc: { credits: amount } });
      log?.warn({ userId, runId, agent }, "duplicate charge rolled back");

      const fresh = await User.findById(userId);
      return { credits: fresh.credits, alreadyApplied: true };
    }

    // The ledger entry failed for some other reason. Undo the charge rather
    // than leave money taken with no record explaining it.
    await User.findByIdAndUpdate(userId, { $inc: { credits: amount } });
    log?.error({ err: error, userId, runId }, "ledger write failed, charge rolled back");
    throw AppError.internal("Could not process credits for this request");
  }

  return { credits: user.credits, alreadyApplied: false };
};

/**
 * Reverses every charge belonging to a failed run.
 *
 * A single request can charge more than once — a search request pays for the
 * search agent and then the chat agent — so refunding only the last agent would
 * leave the user out of pocket for the rest.
 *
 * Idempotent: refunds are written with their own keys, so a retry finds them
 * already present and refunds nothing further.
 */
export const refundRun = async ({ userId, runId, log }) => {
  if (!runId) {
    return { refunded: 0, credits: (await User.findById(userId))?.credits ?? 0 };
  }

  const charges = await CreditLedger.find({
    userId: userId.toString(),
    runId,
    reason: "agent_run",
  });

  if (charges.length === 0) {
    // Nothing was charged — the run failed before payment, which is the normal
    // case for a rejection. Not an error.
    return { refunded: 0, credits: (await User.findById(userId))?.credits ?? 0 };
  }

  let totalRefunded = 0;
  let latestBalance = null;

  for (const charge of charges) {
    const idempotencyKey = keyFor(runId, charge.agentType, "refund");

    // Skip anything already refunded, so re-running this is harmless.
    if (await CreditLedger.exists({ idempotencyKey })) continue;

    const amount = Math.abs(charge.delta);

    const user = await User.findByIdAndUpdate(
      userId,
      { $inc: { credits: amount } },
      { returnDocument: "after" }
    );

    if (!user) {
      throw AppError.notFound("User not found");
    }

    try {
      await CreditLedger.create({
        userId: userId.toString(),
        delta: amount,
        reason: "refund",
        agentType: charge.agentType,
        conversationId: charge.conversationId,
        runId,
        balanceAfter: user.credits,
        idempotencyKey,
      });
    } catch (error) {
      // Another refund for this charge landed first; undo ours so the user is
      // not paid back twice for one failure.
      if (error?.code === 11000) {
        await User.findByIdAndUpdate(userId, { $inc: { credits: -amount } });
        continue;
      }
      throw error;
    }

    totalRefunded += amount;
    latestBalance = user.credits;
  }

  if (totalRefunded > 0) {
    log?.info({ userId, runId, refunded: totalRefunded }, "run refunded after failure");
  }

  return {
    refunded: totalRefunded,
    credits: latestBalance ?? (await User.findById(userId))?.credits ?? 0,
  };
};

/** Records credits granted by a payment or at signup. */
export const grantCredits = async ({ userId, amount, reason, idempotencyKey, balanceAfter }) => {
  try {
    await CreditLedger.create({
      userId: userId.toString(),
      delta: amount,
      reason,
      balanceAfter,
      idempotencyKey,
    });
  } catch (error) {
    // Already recorded by an earlier attempt; the grant itself is guarded by
    // the caller, so this is safe to ignore.
    if (error?.code !== 11000) throw error;
  }
};

/**
 * Checks the ledger against the stored balance.
 *
 * They should always be equal. A mismatch means credits moved without being
 * recorded — a real bug — and this is what makes it findable instead of
 * invisible.
 */
export const reconcile = async (userId) => {
  const [summed] = await CreditLedger.aggregate([
    { $match: { userId: userId.toString() } },
    { $group: { _id: null, total: { $sum: "$delta" } } },
  ]);

  const user = await User.findById(userId);
  const ledgerTotal = summed?.total ?? 0;

  return {
    balance: user?.credits ?? 0,
    ledgerTotal,
    consistent: (user?.credits ?? 0) === ledgerTotal,
  };
};
