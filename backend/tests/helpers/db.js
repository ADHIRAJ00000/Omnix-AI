import { afterAll, afterEach, beforeAll } from "vitest";
import redis from "../../shared/redis/redis.js";

/**
 * Wires a test file to its service's database.
 *
 * Each service installs its own copy of mongoose, so there is more than one
 * mongoose instance in the repo. A model registered on one instance is invisible
 * to another — connecting the "wrong" copy leaves every query hanging until it
 * times out, which is exactly what happened before this existed.
 *
 * So instead of connecting mongoose directly, a test file passes in its own
 * service's connectDB, and cleanup runs through `model.db` — the connection
 * that model is actually registered on. That is guaranteed to be the right one.
 *
 * @param connectDB  the service's own connectDB
 * @param model      any model from that service, used to reach its connection
 */
export const useDatabase = (connectDB, model) => {
  beforeAll(async () => {
    // This deletes everything it is pointed at, so refuse anything that is not
    // obviously a test database.
    if (!process.env.MONGODB_URL?.includes("test")) {
      throw new Error(
        `Refusing to run tests against "${process.env.MONGODB_URL}" — ` +
          `the database name must contain "test".`
      );
    }

    await connectDB();
  });

  afterEach(async () => {
    // Leftover state makes tests order-dependent: one passes alone and fails in
    // a suite. Wiping between tests removes that whole class of failure.
    const { collections } = model.db;
    await Promise.all(Object.values(collections).map((c) => c.deleteMany({})));

    // Redis holds refresh tokens and rate-limit counters. A counter left over
    // from one test would rate-limit the next for no visible reason.
    await redis.flushdb();
  });

  afterAll(async () => {
    await model.db.dropDatabase();
    await model.db.close();
  });
};
