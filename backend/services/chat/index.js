import app, { logger } from "./app.js";
import { env } from "./config/env.js";
import connectDB from "./config/db.js";
import { attachGracefulShutdown } from "../../shared/http/gracefulShutdown.js";

// Connect before listening, so we never accept a request we cannot serve.
const start = async () => {
  await connectDB();

  const server = app.listen(env.PORT, () => {
    logger.info({ port: env.PORT, env: env.NODE_ENV }, "chat service running");
  });

  attachGracefulShutdown(server, logger);
};

start();
