import User from "../models/user.model.js";
import CreditLedger from "../models/creditLedger.model.js";
import { createLogger } from "../../../shared/logger/logger.js";

const logger = createLogger("auth-service:indexes");

/**
 * Brings the database's indexes in line with what the schemas declare.
 *
 * Mongoose creates missing indexes automatically but never *changes* one that
 * already exists. That gap caused a real bug here: firebaseUid was originally
 * declared unique, and when it later became unique + sparse the old non-sparse
 * index stayed behind. Every account without a firebaseUid stored null, and a
 * non-sparse unique index treats those nulls as duplicates — so exactly one
 * password user could ever exist. The second signup failed with a duplicate key
 * error surfaced as "that already exists".
 *
 * syncIndexes drops indexes that no longer match the schema and rebuilds them,
 * which fixes existing databases rather than only new ones.
 *
 * A note for scale: this briefly rebuilds indexes at boot, which is cheap on a
 * small collection but would need to be a deliberate migration on a large one.
 */
export const syncIndexes = async () => {
  for (const model of [User, CreditLedger]) {
    const dropped = await model.syncIndexes();

    if (dropped.length > 0) {
      logger.warn({ model: model.modelName, dropped }, "rebuilt outdated indexes");
    }
  }

  logger.info("indexes verified");
};
