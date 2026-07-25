import { z } from "zod";
import { loadDotenv, loadEnv, envPrimitives } from "../../shared/config/env.js";

loadDotenv(import.meta.url);

export const env = loadEnv(
  z.object({
    NODE_ENV: envPrimitives.nodeEnv,
    PORT: envPrimitives.port,
    REDIS_URL: envPrimitives.nonEmpty("REDIS_URL"),

    // Comma-separated so we can allow localhost in dev and the real domain in
    // production without a code change.
    CORS_ORIGINS: z
      .string()
      .default("http://localhost:5173")
      .transform((value) => value.split(",").map((origin) => origin.trim()).filter(Boolean)),

    AUTH_SERVICE: envPrimitives.url,
    CHAT_SERVICE: envPrimitives.url,
    AGENT_SERVICE: envPrimitives.url,
    BILLING_SERVICE: envPrimitives.url,

    INTERNAL_API_KEY: z
      .string()
      .min(16, "INTERNAL_API_KEY must be at least 16 characters"),

    // Must be byte-identical to the auth service's value: that service signs
    // access tokens, this one verifies them. A mismatch rejects every request.
    JWT_ACCESS_SECRET: z
      .string()
      .min(32, "JWT_ACCESS_SECRET must be at least 32 characters"),

    RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
    RATE_LIMIT_MAX: z.coerce.number().int().positive().default(120),

    LOG_LEVEL: z.string().optional(),
  })
);
