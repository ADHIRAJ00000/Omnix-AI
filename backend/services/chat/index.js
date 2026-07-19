import express from "express";
import { env } from "./config/env.js";
import router from "./routes/chat.routes.js";
import connectDB from "./config/db.js";
import { createLogger } from "../../shared/logger/logger.js";
import { requestId, requestLogger } from "../../shared/http/requestId.js";
import {
  errorHandler,
  notFoundHandler,
} from "../../shared/http/errorHandler.js";
import { attachGracefulShutdown } from "../../shared/http/gracefulShutdown.js";

const logger = createLogger("chat-service");
const app = express();

app.use(express.json({ limit: "2mb" }));
app.use(requestId);
app.use(requestLogger(logger));

// Unauthenticated on purpose: Render polls this to decide if the service is live.
app.get("/health", (req, res) => {
  res.json({ service: "chat-service", status: "ok" });
});

app.use("/", router);

// Order matters: 404 first, then the error handler that turns everything into JSON.
app.use(notFoundHandler);
app.use(errorHandler);

// Connect before listening, so we never accept a request we cannot serve.
const start = async () => {
  await connectDB();

  const server = app.listen(env.PORT, () => {
    logger.info({ port: env.PORT, env: env.NODE_ENV }, "chat service running");
  });

  attachGracefulShutdown(server, logger);
};

start();
