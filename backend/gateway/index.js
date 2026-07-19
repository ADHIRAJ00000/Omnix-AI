import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";

import { env } from "./config/env.js";
import redis from "../shared/redis/redis.js";
import { proxyPublic, proxyWithUser } from "./utils/proxyWithHeaders.js";
import { protect } from "./middlewares/auth.middleware.js";
import { blockInternalRoutes } from "./middlewares/blockInternal.middleware.js";
import { globalRateLimit } from "./middlewares/rateLimit.middleware.js";
import { createLogger } from "../shared/logger/logger.js";
import { requestId, requestLogger } from "../shared/http/requestId.js";
import { errorHandler, notFoundHandler } from "../shared/http/errorHandler.js";
import { attachGracefulShutdown } from "../shared/http/gracefulShutdown.js";
import { AppError } from "../shared/errors/AppError.js";

const logger = createLogger("gateway");
const app = express();

// Behind Render's load balancer the real client IP arrives in X-Forwarded-For.
// Without this, rate limiting would see every request as coming from one address.
app.set("trust proxy", 1);

app.use(helmet());
app.use(
  cors({
    origin: (origin, callback) => {
      // No origin: same-origin requests, and server-side tools like curl.
      if (!origin || env.CORS_ORIGINS.includes(origin)) {
        return callback(null, true);
      }
      callback(new AppError(403, "CORS_BLOCKED", "This origin is not allowed"));
    },
    credentials: true,
  })
);

app.use(requestId);
app.use(requestLogger(logger));
app.use(cookieParser());
app.use(express.json({ limit: "2mb" }));

app.use("/uploads", express.static("uploads"));

// Nothing from the internet may address an /internal route. Runs before any
// proxy so the rule covers every service uniformly.
app.use(blockInternalRoutes);

app.use(globalRateLimit);

app.get("/health", (req, res) => {
  res.json({ service: "gateway", status: "ok" });
});

/**
 * Order matters: the profile routes need a valid access token, so they are
 * mounted before the catch-all /api/auth proxy, which is public. Express takes
 * the first match, so putting them after would leave them unauthenticated.
 */
app.use("/api/me", protect, proxyWithUser(env.AUTH_SERVICE, "/me"));

// Public: register, login, google, refresh and logout all run before a user
// has an access token, so `protect` cannot apply here.
app.use("/api/auth", proxyPublic(env.AUTH_SERVICE));
app.use("/api/chat", protect, proxyWithUser(env.CHAT_SERVICE));
app.use("/api/agent", protect, proxyWithUser(env.AGENT_SERVICE));
app.use("/api/billing", protect, proxyWithUser(env.BILLING_SERVICE));

app.use(notFoundHandler);
app.use(errorHandler);

const server = app.listen(env.PORT, () => {
  logger.info(
    { port: env.PORT, env: env.NODE_ENV, allowedOrigins: env.CORS_ORIGINS },
    "gateway running"
  );
});

attachGracefulShutdown(server, logger, {
  onShutdown: () => redis.quit(),
});
