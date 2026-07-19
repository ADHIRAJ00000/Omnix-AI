import { AppError } from "../../shared/errors/AppError.js";

/**
 * Refuses to proxy anything under an /internal path.
 *
 * The auth service exposes /internal/update-plan and /internal/deduct-credits
 * for other services to call. Those were reachable from the public internet
 * through the /api/auth proxy, which meant anyone could grant themselves any
 * plan and any number of credits without being signed in.
 *
 * These routes are for service-to-service calls only, so the gateway — the only
 * public entry point — must never forward to them. The services also check the
 * internal key themselves; this is the outer of the two layers.
 */
export const blockInternalRoutes = (req, res, next) => {
  if (/(^|\/)internal(\/|$)/i.test(req.path)) {
    req.log?.warn(
      { path: req.originalUrl, ip: req.ip },
      "blocked public attempt to reach an internal route"
    );
    return next(AppError.notFound(`Route ${req.method} ${req.originalUrl} does not exist`));
  }

  next();
};
