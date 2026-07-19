import { AppError, ERROR_CODES } from "../errors/AppError.js";

/** Any route that fell through every handler is a 404, not a silent hang. */
export const notFoundHandler = (req, res, next) => {
  next(AppError.notFound(`Route ${req.method} ${req.originalUrl} does not exist`));
};

/**
 * The single place any error becomes a response.
 *
 * Every service returns the same JSON shape, so the frontend has one code path
 * for failures: { success, message, code, details }. Unknown errors are logged
 * in full but reported generically — a mongo duplicate-key error would otherwise
 * tell an attacker which fields are unique and what the collection is called.
 */
// eslint-disable-next-line no-unused-vars -- Express identifies error middleware by arity; `next` must stay.
export const errorHandler = (err, req, res, next) => {
  const log = req.log ?? console;

  let error = err;

  // Translate the framework/driver errors we expect into AppErrors.
  if (!(error instanceof AppError)) {
    if (err?.name === "ValidationError") {
      // mongoose schema validation
      error = AppError.badRequest("Some of the information you sent is not valid");
    } else if (err?.name === "CastError") {
      // a malformed ObjectId reached mongoose
      error = AppError.badRequest("That id is not valid");
    } else if (err?.code === 11000) {
      error = AppError.badRequest("That already exists");
    } else if (err?.type === "entity.parse.failed") {
      error = AppError.badRequest("The request body is not valid JSON");
    }
  }

  if (error instanceof AppError) {
    if (error.statusCode >= 500) {
      log.error({ err: error, code: error.code }, "request failed");
    } else {
      log.warn({ code: error.code, status: error.statusCode }, error.message);
    }

    return res.status(error.statusCode).json({
      success: false,
      message: error.message,
      code: error.code,
      ...(error.details ? { details: error.details } : {}),
    });
  }

  // Genuinely unexpected: log everything we have, tell the client nothing.
  log.error({ err }, "unhandled error");

  return res.status(500).json({
    success: false,
    message: "Something went wrong on our side. Please try again.",
    code: ERROR_CODES.INTERNAL,
    ...(process.env.NODE_ENV === "production" ? {} : { details: err?.message }),
  });
};
