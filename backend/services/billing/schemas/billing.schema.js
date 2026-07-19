import { z } from "zod";
import { PLANS } from "../config/plans.js";

/**
 * Only paid plans can be ordered. "free" is granted at signup, so allowing it
 * here would let someone create a zero-rupee order and still trigger a credit
 * top-up on verification.
 */
const paidPlanIds = Object.values(PLANS)
  .filter((plan) => plan.amount > 0)
  .map((plan) => plan.id);

export const createOrderSchema = {
  body: z.object({
    plan: z.enum(paidPlanIds),
  }),
};

export const verifyPaymentSchema = {
  body: z.object({
    razorpay_order_id: z.string().min(1).max(200),
    razorpay_payment_id: z.string().min(1).max(200),
    razorpay_signature: z.string().min(1).max(500),
  }),
};
