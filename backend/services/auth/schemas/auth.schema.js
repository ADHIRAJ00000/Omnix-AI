import { z } from "zod";
import { objectId } from "../../../shared/http/validate.js";
import { AGENT_COSTS } from "../config/credits.js";

/**
 * Password rules.
 *
 * Length does far more for strength than character-class rules, which mostly
 * push people toward predictable substitutions like "Password1!". The minimum
 * is 8 with a generous maximum — the cap exists because Argon2 hashing time
 * grows with input, so an unbounded password is a denial-of-service vector.
 */
const password = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128, "Password must be at most 128 characters");

const email = z
  .string()
  .trim()
  .toLowerCase()
  .email("Please enter a valid email address")
  .max(254);

export const registerSchema = {
  body: z.object({
    name: z.string().trim().min(1, "Please enter your name").max(80),
    email,
    password,
  }),
};

export const loginSchema = {
  body: z.object({
    email,
    password: z.string().min(1, "Please enter your password").max(128),
  }),
};

export const googleSchema = {
  body: z.object({
    token: z.string().min(10, "Token is required").max(4096),
  }),
};

export const updateMeSchema = {
  body: z
    .object({
      name: z.string().trim().min(1).max(80).optional(),
      avatar: z.string().url().max(2048).optional(),
    })
    // Rejects an empty body outright rather than performing a no-op update.
    .refine((body) => Object.keys(body).length > 0, {
      message: "Nothing to update",
    }),
};

export const updatePlanSchema = {
  body: z.object({
    userId: objectId,
    // Must stay in step with PLANS in the billing service — those are the only
    // plan ids that can ever be sent here.
    plan: z.enum(["free", "starter", "pro"]),
    credits: z.number().int().min(0).max(100_000),
  }),
};

export const deductCreditsSchema = {
  body: z.object({
    userId: objectId,
    agent: z.enum(Object.keys(AGENT_COSTS)),
  }),
};
