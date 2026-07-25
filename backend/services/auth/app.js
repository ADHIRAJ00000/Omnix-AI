import express from "express";
import cookieParser from "cookie-parser";

/**
 * Loaded first, and for its side effect: it reads .env into process.env.
 *
 * ES module imports are evaluated in order, and the router below reaches the
 * shared Redis client through the token service. If that client is imported
 * before the environment is loaded it sees no REDIS_URL — which used to mean it
 * quietly connected to localhost and only failed once deployed somewhere that
 * has no local Redis.
 */
import "./config/env.js";

import router from "./routes/auth.routes.js";
import { createLogger } from "../../shared/logger/logger.js";
import { requestId, requestLogger } from "../../shared/http/requestId.js";
import { errorHandler, notFoundHandler } from "../../shared/http/errorHandler.js";

/**
 * The Express app, with no server attached.
 *
 * Kept separate from index.js so tests can drive it through supertest without
 * binding a port or connecting to the real database on import. index.js owns
 * everything to do with actually running: listening, database connection and
 * shutdown.
 */
export const logger = createLogger("auth-service");

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

export default app;
