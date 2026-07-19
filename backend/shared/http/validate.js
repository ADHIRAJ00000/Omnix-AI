import { z } from "zod";
import { AppError, ERROR_CODES } from "../errors/AppError.js";

/**
 * Validates req.body / req.params / req.query against zod schemas and replaces
 * them with the parsed result.
 *
 * Why replace rather than just check: zod strips unknown keys and coerces types,
 * so controllers downstream receive exactly the shape they expect. That also
 * blocks mass-assignment — a client cannot sneak `{ credits: 99999 }` into a
 * body that gets spread into a mongo update.
 */
export const validate = (schemas) => (req, res, next) => {
  for (const source of ["body", "params", "query"]) {
    const schema = schemas[source];
    if (!schema) continue;

    const result = schema.safeParse(req[source]);
    if (!result.success) {
      return next(
        new AppError(
          400,
          ERROR_CODES.VALIDATION_FAILED,
          "Some of the information you sent is not valid",
          result.error.issues.map((issue) => ({
            field: issue.path.join(".") || source,
            message: issue.message,
          }))
        )
      );
    }

    // req.query is a getter on newer Express versions; assigning directly can throw.
    Object.defineProperty(req, source, { value: result.data, writable: true });
  }

  next();
};

/** Mongo ObjectIds arrive as strings; reject anything that is not one before it hits mongoose. */
export const objectId = z
  .string()
  .regex(/^[0-9a-fA-F]{24}$/, "must be a valid id");
