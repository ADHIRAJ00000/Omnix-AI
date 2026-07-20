import app, { logger } from "./app.js";
import { env } from "./config/env.js";
import connectDB from "./config/db.js";
import { syncIndexes } from "./config/syncIndexes.js";
import redis from "../../shared/redis/redis.js";
import { attachGracefulShutdown } from "../../shared/http/gracefulShutdown.js";

const start = async () => {
  await connectDB();

  // Runs before we accept traffic: an out-of-date unique index can reject valid
  // signups, so it must be corrected before anyone can hit registration.
  await syncIndexes();

  const server = app.listen(env.PORT, () => {
    logger.info({ port: env.PORT, env: env.NODE_ENV }, "auth service running");
  });

  attachGracefulShutdown(server, logger, { onShutdown: () => redis.quit() });
};

start();
