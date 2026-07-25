import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { z } from "zod";

/**
 * Loads the .env file that sits next to the service being started.
 *
 * Why not plain dotenv.config(): it resolves .env against the *current working
 * directory*, and every service is started from backend/ (`npm run dev:auth`).
 * That made it look for backend/.env — a file that does not exist — so nothing
 * was ever loaded and every service died claiming its config was missing.
 * Resolving against this module's own location instead makes the lookup
 * independent of where the process was launched from, which also keeps local
 * runs, Docker and Render behaving identically.
 *
 * Call it as loadDotenv(import.meta.url) from a service's config/env.js; the
 * .env is one level up from that config/ directory.
 */
export const loadDotenv = (metaUrl) => {
  const configDir = path.dirname(fileURLToPath(metaUrl));
  dotenv.config({ path: path.resolve(configDir, "../.env") });
};

/**
 * Validates environment variables at boot and stops the process if any are
 * missing or malformed.
 *
 * Why fail fast: without this, a missing MONGODB_URL surfaces as a confusing
 * timeout on the first user request, possibly hours after deploy. Here it is a
 * clear message before the server ever accepts traffic. It reports *every*
 * problem at once rather than one per restart.
 */
export const loadEnv = (schema) => {
  const result = schema.safeParse(process.env);

  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");

    console.error(
      `\nCannot start: the environment is not configured correctly.\n\n${problems}\n\n` +
        `Copy .env.example to .env and fill in the missing values.\n`
    );
    process.exit(1);
  }

  return result.data;
};

/** Building blocks shared by the per-service schemas. */
export const envPrimitives = {
  port: z.coerce.number().int().positive(),
  url: z.string().url(),
  nonEmpty: (name) => z.string().min(1, `${name} is required`),
  nodeEnv: z.enum(["development", "test", "production"]).default("development"),
};
