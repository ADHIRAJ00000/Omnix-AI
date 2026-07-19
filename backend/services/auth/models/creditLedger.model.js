import mongoose from "mongoose";

/**
 * An append-only record of every credit movement.
 *
 * Why keep this at all when the balance is on the user document: a bare number
 * can only tell you what it is now, never how it got there. When someone says
 * "my credits vanished", a balance answers nothing. The ledger answers exactly
 * what was charged, for which agent, and when — and its entries sum to the
 * balance, so the two can be checked against each other.
 *
 * Entries are never updated or deleted. A mistake is corrected by appending an
 * opposing entry, exactly as real accounting works, so history is always
 * complete and auditable.
 */
const creditLedgerSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
      index: true,
    },

    // Negative for a charge, positive for a grant or refund. Storing the signed
    // change rather than separate debit/credit columns means the balance is
    // just a sum.
    delta: {
      type: Number,
      required: true,
    },

    reason: {
      type: String,
      required: true,
      enum: ["agent_run", "refund", "purchase", "signup_grant"],
    },

    agentType: String,

    conversationId: String,

    /**
     * Groups everything belonging to one agent run.
     *
     * A single request can charge more than once — a search request runs the
     * search agent and then the chat agent — so a refund has to reverse the
     * whole run, not one charge. This is what ties those together.
     */
    runId: {
      type: String,
      index: true,
    },

    // The balance immediately after this entry was applied. Denormalised on
    // purpose: it makes a transaction history readable without re-summing every
    // prior entry, and makes a corrupted balance obvious at a glance.
    balanceAfter: {
      type: Number,
      required: true,
    },

    /**
     * The idempotency key, and the reason a retry cannot double-charge or
     * double-refund.
     *
     * Built from the run, the agent and the reason, so "charge for the chat
     * agent in run X" can only ever be written once. A second attempt violates
     * the unique index and fails at the database, which is the one place a
     * concurrent duplicate cannot slip past.
     */
    idempotencyKey: {
      type: String,
      unique: true,
      sparse: true,
    },
  },
  { timestamps: true }
);

// The transaction history query: one user's entries, newest first.
creditLedgerSchema.index({ userId: 1, createdAt: -1 });

const CreditLedger = mongoose.model("CreditLedger", creditLedgerSchema);
export default CreditLedger;
