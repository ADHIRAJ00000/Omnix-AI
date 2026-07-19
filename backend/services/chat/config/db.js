import mongoose from "mongoose";
import { env } from "./env.js";
import { createLogger } from "../../../shared/logger/logger.js";

const logger = createLogger("chat-service:db");

/**
 * Exits on failure rather than swallowing the error.
 *
 * The previous version caught the connection error and logged it, so the service
 * carried on and started listening without a database — every request then failed
 * with a confusing timeout instead of the real cause. A dead service that says
 * why is easier to debug than a live one that cannot do anything.
 */
const connectDB = async () => {
  try {
    await mongoose.connect(env.MONGODB_URL);
    logger.info("mongodb connected");
  } catch (error) {
    logger.fatal({ err: error }, "could not connect to mongodb");
    process.exit(1);
  }
};

export default connectDB;
