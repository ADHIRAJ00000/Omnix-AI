/**
 * Runs once before any test file is loaded.
 *
 * Every value the services need is set here, before their config modules are
 * imported — those validate env at import time and exit the process if anything
 * is missing, so setting these later would be too late.
 *
 * The database name and Redis index are deliberately separate from development:
 * the suite wipes data between tests, and pointing that at a real database
 * would delete real work.
 */
export default function globalSetup() {
  process.env.NODE_ENV = "test";
  process.env.LOG_LEVEL = "silent";

  process.env.MONGODB_URL =
    process.env.TEST_MONGODB_URL ?? "mongodb://localhost:27017/cortex-ai-test";

  // Redis database 15, well away from the default 0 used in development.
  process.env.REDIS_URL = process.env.TEST_REDIS_URL ?? "redis://localhost:6379/15";

  // Never actually bound — supertest mounts the app directly — but the config
  // schema requires a valid port, so it has to be a real number.
  process.env.PORT = "8199";
  process.env.INTERNAL_API_KEY = "test-internal-key-at-least-16-chars";
  process.env.JWT_ACCESS_SECRET = "test-jwt-secret-that-is-at-least-32-characters-long";
  process.env.ACCESS_TOKEN_TTL = "15m";
  process.env.REFRESH_TOKEN_TTL_SECONDS = "604800";
  process.env.FRONTEND_URL = "http://localhost:5173";
  process.env.AUTH_SERVICE = "http://localhost:8001";
  process.env.CHAT_SERVICE = "http://localhost:8002";
  process.env.AGENT_SERVICE = "http://localhost:8003";
  process.env.BILLING_SERVICE = "http://localhost:8004";
  process.env.GATEWAY_URL = "http://localhost:8000";
  process.env.RAZORPAY_KEY_ID = "test_key_id";
  process.env.RAZORPAY_KEY_SECRET = "test_key_secret";
}
