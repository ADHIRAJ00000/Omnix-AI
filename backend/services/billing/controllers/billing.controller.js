import crypto from "node:crypto";
import { internalClient } from "../utils/internalClient.js";

import razorpay from "../config/razorpay.js";
import { PLANS } from "../config/plans.js";
import Payment from "../models/payment.model.js";
import { env } from "../config/env.js";
import { AppError } from "../../../shared/errors/AppError.js";

/**
 * Compares two signatures without leaking their contents through timing.
 *
 * A plain `!==` returns as soon as it hits a differing byte, so how long the
 * comparison takes reveals how much of a guessed signature was correct. That is
 * enough to forge one byte at a time. timingSafeEqual always takes the same
 * time. It throws on length mismatch, hence the explicit length check first.
 */
const signaturesMatch = (expected, received) => {
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(received, "utf8");

  if (a.length !== b.length) return false;

  return crypto.timingSafeEqual(a, b);
};

export const createOrder = async (req, res) => {
  const { plan } = req.body;
  const userId = req.user.userId;

  const selectedPlan = PLANS[plan];

  if (!selectedPlan) {
    throw AppError.badRequest("That plan does not exist");
  }

  const order = await razorpay.orders.create({
    amount: selectedPlan.amount * 100, // Razorpay works in paise
    currency: "INR",
    receipt: `receipt_${Date.now()}`,
  });

  /**
   * The price and credit amount are recorded from our own config at order time,
   * never taken from the client. Verification later reads the credits from this
   * record, so a client cannot ask for a cheap plan and be granted an expensive
   * one.
   */
  await Payment.create({
    userId,
    orderId: order.id,
    amount: selectedPlan.amount,
    credits: selectedPlan.credits,
    plan: selectedPlan.id,
    currency: order.currency,
    status: "created",
  });

  req.log.info({ userId, plan: selectedPlan.id, orderId: order.id }, "order created");

  return res.json({ success: true, order, plan: selectedPlan });
};

export const verifyPayment = async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

  const expectedSignature = crypto
    .createHmac("sha256", env.RAZORPAY_KEY_SECRET)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest("hex");

  if (!signaturesMatch(expectedSignature, razorpay_signature)) {
    req.log.warn(
      { userId: req.user.userId, orderId: razorpay_order_id },
      "payment signature did not match"
    );
    throw AppError.badRequest("Payment verification failed");
  }

  /**
   * This is the idempotency gate, and it is the whole reason this is a
   * conditional update rather than a read-then-save.
   *
   * The signature stays valid forever, so anyone who captured one successful
   * checkout response could replay it and be credited again each time. By
   * requiring status to still be "created", only the first request through
   * transitions the record; every replay matches nothing and returns null.
   * Because Mongo applies the filter and the update as one operation, two
   * simultaneous replays cannot both pass.
   */
  const payment = await Payment.findOneAndUpdate(
    {
      orderId: razorpay_order_id,
      userId: req.user.userId, // a user cannot claim someone else's order
      status: "created",
    },
    {
      $set: { status: "paid", paymentId: razorpay_payment_id },
    },
    { returnDocument: "after" }
  );

  if (!payment) {
    // Scoped to the caller: looking this up by orderId alone would tell someone
    // else's user that the order exists and was already paid.
    const existing = await Payment.findOne({
      orderId: razorpay_order_id,
      userId: req.user.userId,
    });

    if (!existing) {
      throw AppError.notFound("Payment not found");
    }

    if (existing.status === "paid") {
      // Already credited. Report success so an honest retry (a flaky network,
      // a double-clicked button) is not shown as an error — but do not credit
      // a second time.
      req.log.info({ orderId: razorpay_order_id }, "payment already verified, ignoring replay");
      return res.json({ success: true, message: "Payment already verified" });
    }

    throw AppError.badRequest("This payment cannot be verified");
  }

  /**
   * Credits are granted by the auth service, which owns the user record. If this
   * call fails the payment is already marked paid, so we roll the record back to
   * "created" — that keeps it eligible for a retry instead of leaving a customer
   * who paid and got nothing.
   */
  try {
    await internalClient.patch(
      `${env.AUTH_SERVICE}/internal/update-plan`,
      {
        userId: payment.userId,
        plan: payment.plan,
        credits: payment.credits,
        // The ledger keys the purchase entry on this, so the same order cannot
        // be recorded as two separate top-ups.
        reference: razorpay_order_id,
      },
      {
        // The internal key and timeout come from the client itself.
        headers: { "x-request-id": req.id },
      }
    );
  } catch (error) {
    await Payment.updateOne(
      { _id: payment._id, status: "paid" },
      { $set: { status: "created" }, $unset: { paymentId: "" } }
    );

    req.log.error(
      { err: error, orderId: razorpay_order_id, userId: payment.userId },
      "payment verified but crediting failed, rolled back for retry"
    );

    throw AppError.internal("We could not add your credits. Please retry in a moment.");
  }

  req.log.info(
    { userId: payment.userId, orderId: razorpay_order_id, credits: payment.credits },
    "payment verified and credits granted"
  );

  return res.json({ success: true, message: "Payment verified successfully" });
};

/** Lets the frontend render plan cards from one source of truth. */
export const getPlans = async (req, res) => {
  return res.json({ success: true, plans: Object.values(PLANS) });
};
