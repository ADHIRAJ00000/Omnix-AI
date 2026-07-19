import { z } from "zod";
import dotenv from "dotenv";
import { loadEnv, envPrimitives } from "../../../shared/config/env.js";

dotenv.config();

export const env = loadEnv(
  z.object({
    NODE_ENV: envPrimitives.nodeEnv,
    PORT: envPrimitives.port,
    MONGODB_URL: envPrimitives.nonEmpty("MONGODB_URL"),
    AUTH_SERVICE: envPrimitives.url,
    RAZORPAY_KEY_ID: envPrimitives.nonEmpty("RAZORPAY_KEY_ID"),
    RAZORPAY_KEY_SECRET: envPrimitives.nonEmpty("RAZORPAY_KEY_SECRET"),
    INTERNAL_API_KEY: z
      .string()
      .min(16, "INTERNAL_API_KEY must be at least 16 characters"),
    LOG_LEVEL: z.string().optional(),
  })
);
