import { z } from "zod";
import { loadDotenv, loadEnv, envPrimitives } from "../../../shared/config/env.js";

loadDotenv(import.meta.url);

/**
 * Provider API keys are intentionally optional here.
 *
 * Not every agent is used in every deployment — someone running only the chat
 * agent should not be blocked at boot for having no Tavily key. Each agent
 * reports a clear error if the key it needs is missing when it actually runs.
 * The keys the whole service depends on are required.
 */
export const env = loadEnv(
  z.object({
    NODE_ENV: envPrimitives.nodeEnv,
    PORT: envPrimitives.port,

    MONGODB_URL: envPrimitives.nonEmpty("MONGODB_URL"),
    REDIS_URL: envPrimitives.nonEmpty("REDIS_URL"),

    CHAT_SERVICE: envPrimitives.url,
    AUTH_SERVICE: envPrimitives.url,
    GATEWAY_URL: envPrimitives.url,

    INTERNAL_API_KEY: z
      .string()
      .min(16, "INTERNAL_API_KEY must be at least 16 characters"),

    GOOGLE_API_KEY: z.string().optional(),
    GROQ_API_KEY: z.string().optional(),
    OPENROUTER_API_KEY: z.string().optional(),
    TAVILY_API_KEY: z.string().optional(),

    /**
     * Model names belong in config, not in code: providers retire model ids on
     * their own schedule, and swapping one should not need a code change or a
     * redeploy of anything but an environment variable.
     */
    GROQ_MODEL: z.string().default("llama-3.3-70b-versatile"),
    GEMINI_MODEL: z.string().default("gemini-2.5-flash"),
    OPENROUTER_MODEL: z.string().default("deepseek/deepseek-chat"),

    AWS_ACCESS_KEY_ID: z.string().optional(),
    AWS_SECRET_ACCESS_KEY: z.string().optional(),
    AWS_REGION: z.string().default("ap-south-1"),
    AWS_BUCKET_NAME: z.string().optional(),

    QDRANT_URL: z.string().optional(),
    QDRANT_API_KEY: z.string().optional(),

    MAX_MEMORY_MESSAGES: z.coerce.number().int().positive().default(20),

    // Where uploads are staged before an agent reads them. Defaults to the
    // system temp directory, which is writable regardless of the user the
    // container runs as.
    UPLOAD_TEMP_DIR: z.string().optional(),
    LOG_LEVEL: z.string().optional(),
  })
);
