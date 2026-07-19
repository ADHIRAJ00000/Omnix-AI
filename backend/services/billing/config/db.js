import mongoose from "mongoose";
import { env } from "./env.js";
import { createLogger } from "../../../shared/logger/logger.js";

const logger = createLogger("billing-service:db");

/** Exits on failure rather than starting a service that cannot serve anything. */
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
