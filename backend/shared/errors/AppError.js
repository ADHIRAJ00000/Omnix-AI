/**
 * One error type for every expected failure across all services.
 *
 * Why: without this, each controller invents its own shape and the frontend
 * ends up guessing. Anything thrown as an AppError is treated as "we meant
 * this" and its message is safe to show the user. Anything else that reaches
 * the error handler is an unexpected bug and gets a generic 500, so internal
 * details (stack traces, mongo errors, key names) never leak to the client.
 */
export class AppError extends Error {
  constructor(statusCode, code, message, details = undefined) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message, details) {
    return new AppError(400, ERROR_CODES.BAD_REQUEST, message, details);
  }

  static unauthorized(message = "You are not signed in") {
    return new AppError(401, ERROR_CODES.UNAUTHORIZED, message);
  }

  static forbidden(message = "You do not have access to this resource") {
    return new AppError(403, ERROR_CODES.FORBIDDEN, message);
  }

  static notFound(message = "Not found") {
    return new AppError(404, ERROR_CODES.NOT_FOUND, message);
  }

  static paymentRequired(message, details) {
    return new AppError(402, ERROR_CODES.INSUFFICIENT_CREDITS, message, details);
  }

  static tooManyRequests(message = "Too many requests, please slow down") {
    return new AppError(429, ERROR_CODES.RATE_LIMITED, message);
  }

  static internal(message = "Something went wrong") {
    return new AppError(500, ERROR_CODES.INTERNAL, message);
  }
}

/**
 * Stable, machine-readable codes. The frontend switches on these rather than
 * on human-readable messages, so we can reword a message without breaking the UI.
 */
export const ERROR_CODES = {
  BAD_REQUEST: "BAD_REQUEST",
  VALIDATION_FAILED: "VALIDATION_FAILED",
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  INSUFFICIENT_CREDITS: "INSUFFICIENT_CREDITS",
  RATE_LIMITED: "RATE_LIMITED",
  INTERNAL: "INTERNAL",
};
