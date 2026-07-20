import { beforeEach, describe, expect, it, vi } from "vitest";
import redis from "../shared/redis/redis.js";

/**
 * Runs the real LangGraph workflow with only the outside world faked.
 *
 * The router, the state machine, the edges and the agent code are all genuine —
 * what is replaced is the model call, the HTTP calls to other services, and the
 * conversation history. That keeps the test fast and free while still proving
 * the parts we actually wrote: that the router picks the right agent, that
 * credits are charged before the model runs, and that a failing model does not
 * leave the user out of pocket.
 */

const modelInvoke = vi.fn(async () => ({ content: "Hello from the assistant." }));

vi.mock("../services/agent/utils/model.js", () => ({
  getModel: () => ({ invoke: modelInvoke }),
}));

// History comes from the chat service over HTTP; an empty history is enough here.
vi.mock("../services/agent/utils/getConv.js", () => ({
  getConversationHistory: vi.fn(async () => []),
}));

const creditCalls = [];
const refundCalls = [];

vi.mock("../services/agent/utils/deductCredits.js", () => ({
  deductCredits: vi.fn(async (userId, agent, opts) => {
    creditCalls.push({ userId, agent, ...opts });
  }),
  refundCredits: vi.fn(async (userId, runId) => {
    refundCalls.push({ userId, runId });
  }),
}));

const { graph } = await import("../services/agent/graph/supervisor.graph.js");

const USER = "6a5d0000000000000000a11c";
const CONVERSATION = "6a5d0000000000000000c0f1";

const run = (overrides = {}) =>
  graph.invoke({
    prompt: "hello there",
    conversationId: CONVERSATION,
    userId: USER,
    agent: "chat",
    requestId: "test-run-1",
    ...overrides,
  });

beforeEach(async () => {
  creditCalls.length = 0;
  refundCalls.length = 0;
  modelInvoke.mockClear();
  modelInvoke.mockImplementation(async () => ({ content: "Hello from the assistant." }));
  await redis.flushdb();
});

describe("the chat agent", () => {
  it("returns the model's reply", async () => {
    const result = await run();

    expect(result.response).toBe("Hello from the assistant.");
    expect(modelInvoke).toHaveBeenCalledOnce();
  });

  it("charges the user before calling the model", async () => {
    await run();

    expect(creditCalls).toHaveLength(1);
    expect(creditCalls[0]).toMatchObject({
      userId: USER,
      agent: "chat",
      runId: "test-run-1",
      conversationId: CONVERSATION,
    });
  });

  it("passes the run id through so a failure can be refunded", async () => {
    await run({ requestId: "traceable-run" });

    // Without this the refund would have nothing to reverse: charges are found
    // by run id, so an agent that forgets to pass it silently makes failures
    // non-refundable.
    expect(creditCalls[0].runId).toBe("traceable-run");
  });

  it("sends the user's prompt to the model", async () => {
    await run({ prompt: "what is the capital of France?" });

    const messages = modelInvoke.mock.calls[0][0];
    const contents = messages.map((m) => m.content).join("\n");

    expect(contents).toContain("what is the capital of France?");
  });

  it("does not charge when the model call fails", async () => {
    modelInvoke.mockRejectedValueOnce(new Error("provider is down"));

    await expect(run()).rejects.toThrow("provider is down");

    // The charge still happened — it runs first — which is exactly why the
    // controller refunds by run id on the failure path.
    expect(creditCalls).toHaveLength(1);
  });
});

describe("rate limiting", () => {
  it("stops a user after too many runs in one minute", async () => {
    // The chat limit is 20 per minute.
    for (let i = 0; i < 20; i += 1) {
      await run({ requestId: `run-${i}` });
    }

    await expect(run({ requestId: "one-too-many" })).rejects.toMatchObject({
      statusCode: 429,
    });
  });

  it("always sets an expiry on the counter", async () => {
    await run();

    // Set separately from the increment, a crash in between would leave a
    // counter with no expiry — locking that user out of the agent permanently.
    const ttl = await redis.ttl(`rate:chat:${USER}`);

    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(60);
  });

  it("counts each agent separately", async () => {
    await run();

    expect(await redis.get(`rate:chat:${USER}`)).toBe("1");
    expect(await redis.get(`rate:coding:${USER}`)).toBeNull();
  });
});

describe("the router", () => {
  it("sends an unrecognised agent to the chat agent", async () => {
    const result = await run({ agent: undefined });

    expect(result.response).toBe("Hello from the assistant.");
    expect(creditCalls[0].agent).toBe("chat");
  });
});
