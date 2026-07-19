import express from "express";
import {
  createOrder,
  getPlans,
  verifyPayment,
} from "../controllers/billing.controller.js";
import { asyncHandler } from "../../../shared/http/asyncHandler.js";
import { validate } from "../../../shared/http/validate.js";
import {
  requireInternalAuth,
  requireUser,
} from "../../../shared/http/internalAuth.js";
import {
  createOrderSchema,
  verifyPaymentSchema,
} from "../schemas/billing.schema.js";

const router = express.Router();

router.use(requireInternalAuth, requireUser);

router.get("/plans", asyncHandler(getPlans));

router.post(
  "/create-order",
  validate(createOrderSchema),
  asyncHandler(createOrder)
);

router.post(
  "/verify-payment",
  validate(verifyPaymentSchema),
  asyncHandler(verifyPayment)
);

export default router;
