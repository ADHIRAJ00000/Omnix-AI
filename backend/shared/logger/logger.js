import pino from "pino";

/**
 * Structured logging.
 *
 * Why not console.log: once there are five services, plain text is unsearchable
 * and loses context. pino emits JSON, so every line carries the service name and
 * the request id — that is what lets you follow a single user action as it hops
 * gateway -> agent -> chat. In development we pretty-print instead, because JSON
 * is unreadable in a terminal.
 */
export const createLogger = (serviceName) =>
  pino({
    name: serviceName,
    level: process.env.LOG_LEVEL || "info",
    // Never log these, even if they appear nested in an object we pass in.
    redact: {
      paths: [
        "req.headers.authorization",
        "req.headers.cookie",
        "*.password",
        "*.token",
        "*.apiKey",
        "*.GOOGLE_API_KEY",
        "*.RAZORPAY_KEY_SECRET",
        "*.AWS_SECRET_ACCESS_KEY",
      ],
      censor: "[redacted]",
    },
    transport:
      process.env.NODE_ENV === "production"
        ? undefined
        : {
            target: "pino-pretty",
            options: { colorize: true, translateTime: "HH:MM:ss", ignore: "pid,hostname" },
          },
  });
