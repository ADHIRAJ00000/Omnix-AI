import express from "express";
import multer from "multer";

import { env } from "./config/env.js";
import connectDB from "./config/db.js";
import router from "./routes/agent.route.js";
import fileRouter from "./routes/file.routes.js";
import redis from "../../shared/redis/redis.js";
import { createLogger } from "../../shared/logger/logger.js";
import { requestId, requestLogger } from "../../shared/http/requestId.js";
import { errorHandler, notFoundHandler } from "../../shared/http/errorHandler.js";
import { attachGracefulShutdown } from "../../shared/http/gracefulShutdown.js";
import { AppError } from "../../shared/errors/AppError.js";

const logger = createLogger("agent-service");
const app = express();

app.use(express.json({ limit: "2mb" }));
app.use(requestId);
app.use(requestLogger(logger));

app.get("/health", (req, res) => {
  res.json({ service: "agent-service", status: "ok" });
});

/**
 * Mounted before the main router, which requires a signed-in user on every
 * route it owns. Downloads authorise through the signature in the URL instead,
 * and Express takes the first match, so the order here is what keeps these two
 * schemes apart.
 */
app.use("/files", fileRouter);

app.use("/", router);

/**
 * Multer signals upload problems with its own error type, which would otherwise
 * surface as an opaque 500. Turning them into AppErrors means "your file is too
 * big" reaches the user as a 400 they can act on.
 */
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    const message =
      err.code === "LIMIT_FILE_SIZE"
        ? "That file is too large. The maximum size is 20MB."
        : "That file could not be uploaded.";
    return next(AppError.badRequest(message));
  }

  // The file filter rejects anything that is not a PDF or an image.
  if (err?.message === "Only PDF and Images are allowed.") {
    return next(AppError.badRequest("Only PDF and image files are supported."));
  }

  return next(err);
});

app.use(notFoundHandler);
app.use(errorHandler);

const start = async () => {
  await connectDB();

  const server = app.listen(env.PORT, () => {
    logger.info({ port: env.PORT, env: env.NODE_ENV }, "agent service running");
  });

  attachGracefulShutdown(server, logger, { onShutdown: () => redis.quit() });
};

start();
