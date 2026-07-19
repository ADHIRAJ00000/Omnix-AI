import { z } from "zod";
import dotenv from "dotenv";
import { loadEnv, envPrimitives } from "../../../shared/config/env.js";

dotenv.config();

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
    SESSION_TTL_SECONDS: z.coerce
      .number()
      .int()
      .positive()
      .default(60 * 60 * 24 * 7),
    LOG_LEVEL: z.string().optional(),
  })
);
