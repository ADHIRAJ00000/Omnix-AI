import express from "express";
import {
  deductCredits,
  login,
  logout,
  refundCredits,
  updatePlan,
} from "../controllers/auth.controllers.js";
import { asyncHandler } from "../../../shared/http/asyncHandler.js";
import { validate } from "../../../shared/http/validate.js";
import { requireInternalAuth } from "../../../shared/http/internalAuth.js";
import {
  deductCreditsSchema,
  loginSchema,
  updatePlanSchema,
} from "../schemas/auth.schema.js";

const router = express.Router();

// Public, but still only reachable via the gateway.
router.post("/login", requireInternalAuth, validate(loginSchema), asyncHandler(login));
router.get("/logout", requireInternalAuth, asyncHandler(logout));

/**
 * Service-to-service only. These change money, so they carry two protections:
 * the gateway refuses to proxy any /internal path from the internet, and each
 * route independently verifies the shared internal key here.
 */
router.patch(
  "/internal/update-plan",
  requireInternalAuth,
  validate(updatePlanSchema),
  asyncHandler(updatePlan)
);

router.patch(
  "/internal/deduct-credits",
  requireInternalAuth,
  validate(deductCreditsSchema),
  asyncHandler(deductCredits)
);

router.patch(
  "/internal/refund-credits",
  requireInternalAuth,
  validate(deductCreditsSchema),
  asyncHandler(refundCredits)
);

export default router;
