import { z } from "zod";
import { loadDotenv, loadEnv, envPrimitives } from "../../../shared/config/env.js";

loadDotenv(import.meta.url);

export const env = loadEnv(
  z.object({
    NODE_ENV: envPrimitives.nodeEnv,
    PORT: envPrimitives.port,
    MONGODB_URL: envPrimitives.nonEmpty("MONGODB_URL"),
    REDIS_URL: envPrimitives.nonEmpty("REDIS_URL"),
    FRONTEND_URL: envPrimitives.url,
    INTERNAL_API_KEY: z
      .string()
      .min(16, "INTERNAL_API_KEY must be at least 16 characters"),

    /**
     * Signs access tokens. Anyone holding this can mint a token for any user,
     * so the minimum length is enforced rather than suggested — a short or
     * guessable secret makes the whole scheme worthless.
     */
    JWT_ACCESS_SECRET: z
      .string()
      .min(32, "JWT_ACCESS_SECRET must be at least 32 characters"),

    // Short on purpose: an access token cannot be revoked, so its lifetime is
    // the window an attacker gets with a stolen one.
    ACCESS_TOKEN_TTL: z.string().default("15m"),

    REFRESH_TOKEN_TTL_SECONDS: z.coerce
      .number()
      .int()
      .positive()
      .default(60 * 60 * 24 * 7),

    LOG_LEVEL: z.string().optional(),
  })
);
