import Redis from "ioredis";

/**
 * The single Redis connection shared by the gateway, auth and agent services.
 *
 * REDIS_URL is read from process.env rather than from a validated `env` object
 * because this module is shared and each service has its own config module.
 * Every service that imports this one imports its config/env.js first, and that
 * is what loads the .env file, so the variable is populated by the time this
 * runs.
 *
 * The explicit check matters: given no URL, ioredis quietly falls back to
 * localhost:6379. In development that looks like it works, and in production it
 * fails with connection errors that read like a network fault rather than the
 * missing configuration they actually are.
 */
if (!process.env.REDIS_URL) {
  throw new Error(
    "REDIS_URL is not set. It must be loaded before shared/redis/redis.js is imported."
  );
}

const redis = new Redis(process.env.REDIS_URL);

redis.on("connect", () => {
  console.log("✅ Redis Connected");
});

/**
 * Without a listener, ioredis emits 'error' as an unhandled event, which takes
 * the whole process down on a blip instead of letting the client reconnect.
 */
redis.on("error", (error) => {
  console.error("Redis error:", error.message);
});

export default redis;
