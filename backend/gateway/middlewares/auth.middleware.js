import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { AppError } from "../../shared/errors/AppError.js";

/**
 * Verifies the access token and attaches the user to the request.
 *
 * The token is a JWT signed by the auth service, so the gateway checks it with
 * a local signature verification — no Redis or database lookup on the hot path.
 * That is the main reason for using a JWT here: this middleware runs on every
 * single API call.
 *
 * The trade-off is that a valid token cannot be revoked before it expires,
 * which is why access tokens last ~15 minutes and real revocation happens
 * against the refresh token in the auth service.
 *
 * The token travels in the Authorization header rather than a cookie. The
 * frontend keeps it in memory only, so it is never written to storage a
 * cross-site script could read, and because it is not a cookie the browser
 * never attaches it automatically — which removes CSRF from every API route.
 */
export const protect = (req, res, next) => {
  const header = req.headers.authorization;

  if (!header?.startsWith("Bearer ")) {
    return next(AppError.unauthorized());
  }

  const token = header.slice("Bearer ".length).trim();

  if (!token) {
    return next(AppError.unauthorized());
  }

  let payload;
  try {
    payload = jwt.verify(token, env.JWT_ACCESS_SECRET);
  } catch (error) {
    /**
     * An expired token is normal — it is the signal that tells the frontend to
     * silently refresh — so it gets its own code the client can act on. Any
     * other verification failure means a bad or tampered signature, which is
     * not something a refresh will fix.
     */
    if (error.name === "TokenExpiredError") {
      return next(
        new AppError(401, "TOKEN_EXPIRED", "Your session has expired")
      );
    }

    req.log?.warn({ err: error }, "rejected invalid access token");
    return next(AppError.unauthorized());
  }

  req.user = {
    userId: payload.sub,
    email: payload.email,
  };

  req.log = req.log.child({ userId: req.user.userId });

  next();
};
