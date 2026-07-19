import { z } from "zod";
import dotenv from "dotenv";
import { loadEnv, envPrimitives } from "../../shared/config/env.js";

dotenv.config();

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

    RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
    RATE_LIMIT_MAX: z.coerce.number().int().positive().default(120),

    LOG_LEVEL: z.string().optional(),
  })
);
