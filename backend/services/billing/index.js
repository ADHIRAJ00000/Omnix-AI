import express from "express";
import helmet from "helmet";

import { env } from "./config/env.js";
import connectDB from "./config/db.js";
import router from "./routes/billing.routes.js";
import { createLogger } from "../../shared/logger/logger.js";
import { requestId, requestLogger } from "../../shared/http/requestId.js";
import { errorHandler, notFoundHandler } from "../../shared/http/errorHandler.js";
import { attachGracefulShutdown } from "../../shared/http/gracefulShutdown.js";

const logger = createLogger("billing-service");
const app = express();

app.use(helmet());
app.use(express.json({ limit: "1mb" }));
app.use(requestId);
app.use(requestLogger(logger));

app.get("/health", (req, res) => {
  res.json({ service: "billing-service", status: "ok" });
});

app.use("/", router);

app.use(notFoundHandler);
app.use(errorHandler);

const start = async () => {
  await connectDB();

  const server = app.listen(env.PORT, () => {
    logger.info({ port: env.PORT, env: env.NODE_ENV }, "billing service running");
  });

  attachGracefulShutdown(server, logger);
};

start();
