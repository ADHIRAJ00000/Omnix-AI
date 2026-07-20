import express from "express";
import helmet from "helmet";

import router from "./routes/billing.routes.js";
import { createLogger } from "../../shared/logger/logger.js";
import { requestId, requestLogger } from "../../shared/http/requestId.js";
import { errorHandler, notFoundHandler } from "../../shared/http/errorHandler.js";

/**
 * The Express app, with no server attached — see auth/app.js for why this is
 * split out from index.js.
 */
export const logger = createLogger("billing-service");

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

export default app;
