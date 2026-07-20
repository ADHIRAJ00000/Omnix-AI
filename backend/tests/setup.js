import { afterAll } from "vitest";
import redis from "../shared/redis/redis.js";

/**
 * Per-file setup. Database wiring lives in tests/helpers/db.js, because which
 * connection to use depends on which service the file is testing.
 *
 * Redis is shared: shared/redis/redis.js resolves to a single module, so every
 * service uses the same client and one shutdown here is enough.
 */
afterAll(async () => {
  if (redis.status === "ready") {
    await redis.quit();
  }
});
