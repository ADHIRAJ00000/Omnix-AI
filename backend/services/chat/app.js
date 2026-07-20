import express from "express";

import router from "./routes/chat.routes.js";
import { createLogger } from "../../shared/logger/logger.js";
import { requestId, requestLogger } from "../../shared/http/requestId.js";
import { errorHandler, notFoundHandler } from "../../shared/http/errorHandler.js";

/**
 * The Express app, with no server attached — see auth/app.js for why this is
 * split out from index.js.
 */
export const logger = createLogger("chat-service");

const app = express();

app.use(express.json({ limit: "2mb" }));
app.use(requestId);
app.use(requestLogger(logger));

// Unauthenticated on purpose: the host polls this to decide if the service is live.
app.get("/health", (req, res) => {
  res.json({ service: "chat-service", status: "ok" });
});

app.use("/", router);

// Order matters: 404 first, then the error handler that turns everything into JSON.
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
