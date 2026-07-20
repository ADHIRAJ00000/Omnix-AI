import app, { logger } from "./app.js";
import { env } from "./config/env.js";
import connectDB from "./config/db.js";
import { attachGracefulShutdown } from "../../shared/http/gracefulShutdown.js";

const start = async () => {
  await connectDB();

  const server = app.listen(env.PORT, () => {
    logger.info({ port: env.PORT, env: env.NODE_ENV }, "billing service running");
  });

  attachGracefulShutdown(server, logger);
};

start();
