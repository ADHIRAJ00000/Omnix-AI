import { z } from "zod";
import { objectId } from "../../../shared/http/validate.js";
import { AGENT_COSTS } from "../config/credits.js";

export const loginSchema = {
  body: z.object({
    // A Firebase ID token. Bounded so an oversized body cannot be used to
    // exhaust memory before verification even runs.
    token: z.string().min(10, "Token is required").max(4096),
  }),
};

export const updatePlanSchema = {
  body: z.object({
    userId: objectId,
    plan: z.enum(["free", "pro", "business"]),
    credits: z.number().int().min(0).max(100_000),
  }),
};

export const deductCreditsSchema = {
  body: z.object({
    userId: objectId,
    agent: z.enum(Object.keys(AGENT_COSTS)),
  }),
};
