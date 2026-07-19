import { randomUUID } from "node:crypto";

/**
 * Give every request an id and pass it on.
 *
 * Why: a single chat message touches the gateway, the agent service and the chat
 * service. When it fails, you need to find all three log lines. The gateway mints
 * an id, forwards it as x-request-id, and downstream services reuse the incoming
 * one instead of making a new one — so the whole chain shares a single id.
 */
export const requestId = (req, res, next) => {
  req.id = req.headers["x-request-id"] || randomUUID();
  res.setHeader("x-request-id", req.id);
  next();
};

/** Attaches a logger that stamps every line with this request's id. */
export const requestLogger = (logger) => (req, res, next) => {
  req.log = logger.child({ requestId: req.id });

  const startedAt = Date.now();
  res.on("finish", () => {
    req.log.info(
      {
        method: req.method,
        path: req.originalUrl,
        status: res.statusCode,
        durationMs: Date.now() - startedAt,
      },
      "request completed"
    );
  });

  next();
};
