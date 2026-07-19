import { z } from "zod";

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
