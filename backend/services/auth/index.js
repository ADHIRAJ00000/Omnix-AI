import express from "express";
import cookieParser from "cookie-parser";

import { env } from "./config/env.js";
import connectDB from "./config/db.js";
import { syncIndexes } from "./config/syncIndexes.js";
import router from "./routes/auth.routes.js";
import redis from "../../shared/redis/redis.js";
import { createLogger } from "../../shared/logger/logger.js";
import { requestId, requestLogger } from "../../shared/http/requestId.js";
import { errorHandler, notFoundHandler } from "../../shared/http/errorHandler.js";
import { attachGracefulShutdown } from "../../shared/http/gracefulShutdown.js";

const logger = createLogger("auth-service");
const app = express();

app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());
app.use(requestId);
app.use(requestLogger(logger));

app.get("/health", (req, res) => {
  res.json({ service: "auth-service", status: "ok" });
});

app.use("/", router);

app.use(notFoundHandler);
app.use(errorHandler);

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
