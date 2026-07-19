import mongoose from "mongoose";

/**
 * Shut down cleanly when the platform sends SIGTERM.
 *
 * Why it matters on Render: the platform sends SIGTERM and then kills the
 * process shortly after. Without this we drop in-flight requests mid-response
 * and leave mongo sockets open. We stop accepting new connections, let the
 * current ones finish, close the database, then exit — with a hard timeout so a
 * stuck request cannot block the deploy forever.
 */
export const attachGracefulShutdown = (server, logger, { timeoutMs = 10_000 } = {}) => {
  let shuttingDown = false;

  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;

    logger.info({ signal }, "shutting down");

    const forceExit = setTimeout(() => {
      logger.error("shutdown timed out, forcing exit");
      process.exit(1);
    }, timeoutMs);
    forceExit.unref();

    server.close(async () => {
      try {
        if (mongoose.connection.readyState === 1) {
          await mongoose.connection.close();
        }
        logger.info("shutdown complete");
        process.exit(0);
      } catch (error) {
        logger.error({ err: error }, "error during shutdown");
        process.exit(1);
      }
    });
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  // A crash we did not anticipate should be loud and fatal, not a zombie process
  // serving requests from a half-broken state.
  process.on("unhandledRejection", (reason) => {
    logger.fatal({ err: reason }, "unhandled promise rejection");
    shutdown("unhandledRejection");
  });
  process.on("uncaughtException", (error) => {
    logger.fatal({ err: error }, "uncaught exception");
    shutdown("uncaughtException");
  });
};
