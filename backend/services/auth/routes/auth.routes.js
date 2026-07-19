import express from "express";
import {
  deductCredits,
  getMe,
  googleLogin,
  login,
  logout,
  refresh,
  refundCredits,
  register,
  updateMe,
  updatePlan,
} from "../controllers/auth.controllers.js";
import { asyncHandler } from "../../../shared/http/asyncHandler.js";
import { validate } from "../../../shared/http/validate.js";
import {
  requireInternalAuth,
  requireUser,
} from "../../../shared/http/internalAuth.js";
import { loginRateLimit } from "../middlewares/loginRateLimit.middleware.js";
import {
  deductCreditsSchema,
  googleSchema,
  loginSchema,
  registerSchema,
  updateMeSchema,
  updatePlanSchema,
} from "../schemas/auth.schema.js";

const router = express.Router();

// Everything here is still only reachable through the gateway.
router.use(requireInternalAuth);

/* ---------------------------------------------------------------- public */

router.post(
  "/register",
  loginRateLimit,
  validate(registerSchema),
  asyncHandler(register)
);

router.post("/login", loginRateLimit, validate(loginSchema), asyncHandler(login));

router.post("/google", validate(googleSchema), asyncHandler(googleLogin));

// No access token required: this is what the client calls precisely because
// the access token has expired. The refresh cookie is the credential.
router.post("/refresh", asyncHandler(refresh));

router.post("/logout", asyncHandler(logout));

/* ------------------------------------------------------------ signed in */

router.get("/me", requireUser, asyncHandler(getMe));
router.patch("/me", requireUser, validate(updateMeSchema), asyncHandler(updateMe));

/* ----------------------------------------------- service-to-service only */

/**
 * These change money, so they carry two protections: the gateway refuses to
 * proxy any /internal path from the internet, and the internal key is verified
 * above for every route in this file.
 */
router.patch("/internal/update-plan", validate(updatePlanSchema), asyncHandler(updatePlan));
router.patch("/internal/deduct-credits", validate(deductCreditsSchema), asyncHandler(deductCredits));
router.patch("/internal/refund-credits", validate(deductCreditsSchema), asyncHandler(refundCredits));

export default router;
