import crypto from "node:crypto";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useDatabase } from "./helpers/db.js";

/**
 * Razorpay is mocked, not called.
 *
 * Creating a real order needs live API keys and a network round trip, which
 * would make the suite unrunnable without credentials and slow when it did run.
 * What matters here is our own logic — signature checking and idempotency — and
 * that is fully exercised against a fake order.
 */
vi.mock("../services/billing/config/razorpay.js", () => ({
  default: {
    orders: {
      create: vi.fn(async ({ amount, currency }) => ({
        id: `order_${crypto.randomUUID().slice(0, 12)}`,
        amount,
        currency,
      })),
    },
  },
}));

/**
 * The auth service is a separate process; stub the call that grants credits and
 * assert we ask for it correctly.
 *
 * The service's own client module is mocked rather than axios itself, because
 * each service installs its own copy of axios — a global "axios" mock resolves
 * to a different instance than the one the controller imports, and silently
 * does not apply.
 */
const updatePlanCalls = [];
const patch = vi.fn(async (url, body) => {
  updatePlanCalls.push({ url, body });
  return { data: { success: true } };
});

vi.mock("../services/billing/utils/internalClient.js", () => ({
  internalClient: { patch: (...args) => patch(...args) },
}));

const app = (await import("../services/billing/app.js")).default;
const connectDB = (await import("../services/billing/config/db.js")).default;
const Payment = (await import("../services/billing/models/payment.model.js")).default;

useDatabase(connectDB, Payment);

const INTERNAL_KEY = "test-internal-key-at-least-16-chars";
const USER = "6a5d0000000000000000a11c";
const OTHER_USER = "6a5d0000000000000000ba4d";

const as = (userId, req) => req.set("x-internal-key", INTERNAL_KEY).set("x-user-id", userId);

/** Signs an order the way Razorpay would, so verification should accept it. */
const signatureFor = (orderId, paymentId) =>
  crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
    .update(`${orderId}|${paymentId}`)
    .digest("hex");

const createOrder = (userId = USER, plan = "starter") =>
  as(userId, request(app).post("/create-order")).send({ plan });

beforeEach(() => {
  updatePlanCalls.length = 0;
});

describe("creating an order", () => {
  it("records the price and credits from our own config", async () => {
    const response = await createOrder().expect(200);

    const payment = await Payment.findOne({ orderId: response.body.order.id });

    // Read from PLANS, never from the request, so a client cannot ask for a
    // cheap plan and be granted an expensive one.
    expect(payment.amount).toBe(199);
    expect(payment.credits).toBe(500);
    expect(payment.status).toBe("created");
  });

  it("rejects an unknown plan", async () => {
    await as(USER, request(app).post("/create-order")).send({ plan: "enterprise" }).expect(400);
  });

  it("rejects the free plan, which cannot be purchased", async () => {
    await as(USER, request(app).post("/create-order")).send({ plan: "free" }).expect(400);
  });
});

describe("verifying a payment", () => {
  it("accepts a correctly signed payment and grants the credits once", async () => {
    const order = await createOrder().expect(200);
    const orderId = order.body.order.id;
    const paymentId = "pay_test_001";

    await as(USER, request(app).post("/verify-payment"))
      .send({
        razorpay_order_id: orderId,
        razorpay_payment_id: paymentId,
        razorpay_signature: signatureFor(orderId, paymentId),
      })
      .expect(200);

    expect(updatePlanCalls).toHaveLength(1);
    expect(updatePlanCalls[0].body).toMatchObject({ credits: 500, plan: "starter" });
    // The order id is the ledger's idempotency key.
    expect(updatePlanCalls[0].body.reference).toBe(orderId);
  });

  it("does not grant credits again when the same response is replayed", async () => {
    const order = await createOrder().expect(200);
    const orderId = order.body.order.id;
    const paymentId = "pay_test_002";
    const signature = signatureFor(orderId, paymentId);

    const body = {
      razorpay_order_id: orderId,
      razorpay_payment_id: paymentId,
      razorpay_signature: signature,
    };

    await as(USER, request(app).post("/verify-payment")).send(body).expect(200);

    // A Razorpay signature stays valid indefinitely, so anyone who captured one
    // successful checkout could otherwise be credited again on every replay.
    for (let i = 0; i < 3; i += 1) {
      const replay = await as(USER, request(app).post("/verify-payment")).send(body).expect(200);
      expect(replay.body.message).toBe("Payment already verified");
    }

    expect(updatePlanCalls).toHaveLength(1);
  });

  it("rejects a forged signature", async () => {
    const order = await createOrder().expect(200);

    await as(USER, request(app).post("/verify-payment"))
      .send({
        razorpay_order_id: order.body.order.id,
        razorpay_payment_id: "pay_test_003",
        razorpay_signature: "0".repeat(64),
      })
      .expect(400);

    expect(updatePlanCalls).toHaveLength(0);
    const payment = await Payment.findOne({ orderId: order.body.order.id });
    expect(payment.status).toBe("created");
  });

  it("does not let another user claim someone else's order", async () => {
    const order = await createOrder(USER).expect(200);
    const orderId = order.body.order.id;
    const paymentId = "pay_test_004";

    await as(OTHER_USER, request(app).post("/verify-payment"))
      .send({
        razorpay_order_id: orderId,
        razorpay_payment_id: paymentId,
        razorpay_signature: signatureFor(orderId, paymentId),
      })
      .expect(404);

    expect(updatePlanCalls).toHaveLength(0);
  });

  it("rolls the payment back so it can be retried if granting credits fails", async () => {
    const order = await createOrder().expect(200);
    const orderId = order.body.order.id;
    const paymentId = "pay_test_005";

    patch.mockRejectedValueOnce(new Error("auth service unreachable"));

    await as(USER, request(app).post("/verify-payment"))
      .send({
        razorpay_order_id: orderId,
        razorpay_payment_id: paymentId,
        razorpay_signature: signatureFor(orderId, paymentId),
      })
      .expect(500);

    // Left as "created" rather than "paid", otherwise a customer who paid and
    // received nothing would have no way to retry.
    const payment = await Payment.findOne({ orderId });
    expect(payment.status).toBe("created");

    // And the retry succeeds.
    await as(USER, request(app).post("/verify-payment"))
      .send({
        razorpay_order_id: orderId,
        razorpay_payment_id: paymentId,
        razorpay_signature: signatureFor(orderId, paymentId),
      })
      .expect(200);
  });
});
