import { describe, expect, it } from "vitest";
import { useDatabase } from "./helpers/db.js";
import connectDB from "../services/auth/config/db.js";
import User from "../services/auth/models/user.model.js";
import CreditLedger from "../services/auth/models/creditLedger.model.js";
import {
  chargeForAgentRun,
  grantCredits,
  reconcile,
  refundRun,
} from "../services/auth/services/credit.service.js";

useDatabase(connectDB, User);

const makeUser = async (credits = 100) => {
  const user = await User.create({
    name: "Test",
    email: `user-${Date.now()}-${Math.random()}@test.com`,
    credits,
    totalCredits: credits,
    providers: ["password"],
  });

  await grantCredits({
    userId: user._id,
    amount: credits,
    reason: "signup_grant",
    idempotencyKey: `signup:${user._id}`,
    balanceAfter: credits,
  });

  return user;
};

const balanceOf = async (user) => (await User.findById(user._id)).credits;

describe("charging for an agent run", () => {
  it("deducts the agent's cost and records it in the ledger", async () => {
    const user = await makeUser(100);

    await chargeForAgentRun({ userId: user._id, agent: "chat", runId: "run-1" });

    expect(await balanceOf(user)).toBe(99);

    const entry = await CreditLedger.findOne({ runId: "run-1", reason: "agent_run" });
    expect(entry.delta).toBe(-1);
    expect(entry.agentType).toBe("chat");
    expect(entry.balanceAfter).toBe(99);
  });

  it("charges different amounts for different agents", async () => {
    const user = await makeUser(100);

    await chargeForAgentRun({ userId: user._id, agent: "ppt", runId: "run-ppt" });

    expect(await balanceOf(user)).toBe(90);
  });

  it("refuses when the balance is too low, and takes nothing", async () => {
    const user = await makeUser(3);

    await expect(
      chargeForAgentRun({ userId: user._id, agent: "coding", runId: "run-2" })
    ).rejects.toMatchObject({ statusCode: 402 });

    expect(await balanceOf(user)).toBe(3);
    expect(await CreditLedger.countDocuments({ runId: "run-2" })).toBe(0);
  });

  it("charges once when the same run is submitted twice", async () => {
    const user = await makeUser(100);

    await chargeForAgentRun({ userId: user._id, agent: "chat", runId: "same-run" });
    await chargeForAgentRun({ userId: user._id, agent: "chat", runId: "same-run" });

    expect(await balanceOf(user)).toBe(99);
    expect(await CreditLedger.countDocuments({ runId: "same-run", reason: "agent_run" })).toBe(1);
  });

  it("charges once when ten identical requests arrive at the same moment", async () => {
    const user = await makeUser(100);

    await Promise.all(
      Array.from({ length: 10 }, () =>
        chargeForAgentRun({ userId: user._id, agent: "chat", runId: "concurrent" }).catch(
          () => null
        )
      )
    );

    expect(await balanceOf(user)).toBe(99);
  });

  it("lets concurrent runs spend down to exactly zero, never below", async () => {
    const user = await makeUser(5);

    // Ten separate runs of 1 credit each against a balance of 5.
    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        chargeForAgentRun({ userId: user._id, agent: "chat", runId: `race-${i}` })
          .then(() => "charged")
          .catch(() => "refused")
      )
    );

    expect(results.filter((r) => r === "charged")).toHaveLength(5);
    expect(results.filter((r) => r === "refused")).toHaveLength(5);
    expect(await balanceOf(user)).toBe(0);
  });
});

describe("refunding a failed run", () => {
  it("returns every charge the run made, not just the last one", async () => {
    const user = await makeUser(100);

    // A search request pays for the search agent and then the chat agent.
    await chargeForAgentRun({ userId: user._id, agent: "search", runId: "multi" });
    await chargeForAgentRun({ userId: user._id, agent: "chat", runId: "multi" });
    expect(await balanceOf(user)).toBe(94);

    const { refunded } = await refundRun({ userId: user._id, runId: "multi" });

    expect(refunded).toBe(6);
    expect(await balanceOf(user)).toBe(100);
  });

  it("refunds once however many times it is retried", async () => {
    const user = await makeUser(100);
    await chargeForAgentRun({ userId: user._id, agent: "coding", runId: "retry" });

    await refundRun({ userId: user._id, runId: "retry" });
    await refundRun({ userId: user._id, runId: "retry" });
    await refundRun({ userId: user._id, runId: "retry" });

    expect(await balanceOf(user)).toBe(100);
    expect(await CreditLedger.countDocuments({ runId: "retry", reason: "refund" })).toBe(1);
  });

  it("does nothing when the run was never charged", async () => {
    const user = await makeUser(100);

    const { refunded } = await refundRun({ userId: user._id, runId: "never-charged" });

    expect(refunded).toBe(0);
    expect(await balanceOf(user)).toBe(100);
  });

  it("is safe when several refunds race", async () => {
    const user = await makeUser(100);
    await chargeForAgentRun({ userId: user._id, agent: "ppt", runId: "race-refund" });

    await Promise.all(
      Array.from({ length: 5 }, () =>
        refundRun({ userId: user._id, runId: "race-refund" }).catch(() => null)
      )
    );

    expect(await balanceOf(user)).toBe(100);
  });
});

describe("ledger consistency", () => {
  it("sums to the stored balance after a mix of activity", async () => {
    const user = await makeUser(100);

    await chargeForAgentRun({ userId: user._id, agent: "search", runId: "a" });
    await chargeForAgentRun({ userId: user._id, agent: "chat", runId: "a" });
    await refundRun({ userId: user._id, runId: "a" });
    await chargeForAgentRun({ userId: user._id, agent: "coding", runId: "b" });
    await chargeForAgentRun({ userId: user._id, agent: "pdf", runId: "c" });

    const result = await reconcile(user._id);

    expect(result.consistent).toBe(true);
    expect(result.balance).toBe(80);
    expect(result.ledgerTotal).toBe(80);
  });

  it("records a purchase once even if the webhook is delivered twice", async () => {
    const user = await makeUser(100);

    for (let i = 0; i < 3; i += 1) {
      await grantCredits({
        userId: user._id,
        amount: 500,
        reason: "purchase",
        idempotencyKey: "purchase:order_abc",
        balanceAfter: 600,
      });
    }

    expect(await CreditLedger.countDocuments({ reason: "purchase" })).toBe(1);
  });
});
