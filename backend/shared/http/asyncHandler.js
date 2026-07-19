/**
 * Wraps an async route handler so a rejected promise reaches the error
 * middleware instead of becoming an unhandled rejection.
 *
 * Why: Express 4 does not catch async throws. Without this, every controller
 * needs its own try/catch — which is exactly the repetition this codebase had.
 * With it, controllers can throw and stay focused on the happy path.
 */
export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);
