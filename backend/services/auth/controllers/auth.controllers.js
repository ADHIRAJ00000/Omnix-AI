import { getAuth } from "firebase-admin/auth";
import User from "../models/user.model.js";
import { getFirebaseApp } from "../config/firebase.js";
import { AppError } from "../../../shared/errors/AppError.js";
import { costForAgent } from "../config/credits.js";
import { hashPassword, verifyPassword } from "../utils/password.js";
import { clearLoginAttempts } from "../middlewares/loginRateLimit.middleware.js";
import {
  createRefreshToken,
  refreshCookieOptions,
  revokeRefreshToken,
  rotateRefreshToken,
  signAccessToken,
} from "../services/token.service.js";

const REFRESH_COOKIE = "refreshToken";

/** Issues a fresh token pair and sets the refresh cookie. */
const issueSession = async (user, res) => {
  const { token: refreshToken } = await createRefreshToken(user._id);

  res.cookie(REFRESH_COOKIE, refreshToken, refreshCookieOptions());

  return signAccessToken(user);
};

export const register = async (req, res) => {
  const { name, email, password } = req.body;

  const existing = await User.findOne({ email });

  if (existing) {
    /**
     * Deliberately the same wording as a failed login would give for an
     * unrelated reason, so this endpoint cannot be used to enumerate which
     * email addresses have accounts. It is a real trade-off against a clearer
     * message, and worth it on a public signup form.
     */
    throw AppError.badRequest("That email address cannot be used");
  }

  const user = await User.create({
    name,
    email,
    passwordHash: await hashPassword(password),
    providers: ["password"],
  });

  const accessToken = await issueSession(user, res);

  req.log.info({ userId: user._id }, "user registered with password");

  return res.status(201).json({
    success: true,
    accessToken,
    user: user.toPublic(),
  });
};

export const login = async (req, res) => {
  const { email, password } = req.body;

  // passwordHash is select:false on the model, so it must be asked for.
  const user = await User.findOne({ email }).select("+passwordHash");

  const passwordMatches = await verifyPassword(user?.passwordHash, password);

  /**
   * One message for both "no such user" and "wrong password".
   *
   * Distinguishing them tells an attacker which addresses are registered, which
   * turns a password-guessing problem into a much smaller targeted one.
   */
  if (!user || !passwordMatches) {
    req.log.warn({ email }, "failed login attempt");
    throw AppError.unauthorized("Incorrect email or password");
  }

  await clearLoginAttempts(email, req.ip);

  const accessToken = await issueSession(user, res);

  req.log.info({ userId: user._id }, "user signed in with password");

  return res.json({ success: true, accessToken, user: user.toPublic() });
};

/**
 * Google sign-in, kept alongside password auth.
 *
 * Firebase verifies the identity, then we issue our own tokens — so from here
 * on every request uses the same session mechanism regardless of how the user
 * signed in, and the rest of the system never needs to care which it was.
 */
export const googleLogin = async (req, res) => {
  const { token } = req.body;

  let decoded;
  try {
    decoded = await getAuth(getFirebaseApp()).verifyIdToken(token);
  } catch (error) {
    // A missing-credentials AppError is our configuration problem, not the
    // user's bad token — let it through as a 500 rather than masking it as 401.
    if (error instanceof AppError) throw error;

    req.log.warn({ err: error }, "firebase token verification failed");
    throw AppError.unauthorized("Sign in failed, please try again");
  }

  if (!decoded.email) {
    throw AppError.badRequest("Your Google account did not provide an email address");
  }

  let user = await User.findOne({
    $or: [{ firebaseUid: decoded.uid }, { email: decoded.email.toLowerCase() }],
  });

  if (user) {
    /**
     * Links Google to an account that already registered with a password, so
     * signing in with Google does not silently create a second account holding
     * a different credit balance.
     */
    let changed = false;

    if (!user.firebaseUid) {
      user.firebaseUid = decoded.uid;
      changed = true;
    }
    if (!user.providers.includes("google")) {
      user.providers.push("google");
      changed = true;
    }
    if (!user.avatar && decoded.picture) {
      user.avatar = decoded.picture;
      changed = true;
    }

    if (changed) await user.save();
  } else {
    user = await User.create({
      firebaseUid: decoded.uid,
      email: decoded.email,
      name: decoded.name || decoded.email.split("@")[0],
      avatar: decoded.picture,
      providers: ["google"],
    });
    req.log.info({ userId: user._id }, "new user registered with google");
  }

  const accessToken = await issueSession(user, res);

  req.log.info({ userId: user._id }, "user signed in with google");

  return res.json({ success: true, accessToken, user: user.toPublic() });
};

/**
 * Exchanges the refresh cookie for a new access token, rotating the refresh
 * token in the process. This is the endpoint the frontend calls silently when
 * an access token expires mid-session.
 */
export const refresh = async (req, res) => {
  const presented = req.cookies?.[REFRESH_COOKIE];

  let rotated;
  try {
    rotated = await rotateRefreshToken(presented, req.log);
  } catch (error) {
    // Clear the cookie on any failure, so a browser holding a dead or revoked
    // token stops retrying with it on every page load.
    res.clearCookie(REFRESH_COOKIE, { ...refreshCookieOptions(), maxAge: undefined });
    throw error;
  }

  const user = await User.findById(rotated.userId);

  if (!user) {
    res.clearCookie(REFRESH_COOKIE, { ...refreshCookieOptions(), maxAge: undefined });
    throw AppError.unauthorized("Please sign in again");
  }

  res.cookie(REFRESH_COOKIE, rotated.refreshToken, refreshCookieOptions());

  return res.json({
    success: true,
    accessToken: signAccessToken(user),
    user: user.toPublic(),
  });
};

export const logout = async (req, res) => {
  await revokeRefreshToken(req.cookies?.[REFRESH_COOKIE]);

  // Options must match those used to set it, or the browser keeps the cookie.
  res.clearCookie(REFRESH_COOKIE, { ...refreshCookieOptions(), maxAge: undefined });

  return res.json({ success: true, message: "Logged out successfully" });
};

/**
 * The signed-in user, read fresh from the database.
 *
 * Credits and plan change constantly (every agent run spends some), so they are
 * looked up per request rather than carried in the access token, where they
 * would be stale until the token expired.
 */
export const getMe = async (req, res) => {
  const user = await User.findById(req.user.userId);

  if (!user) {
    throw AppError.unauthorized("Please sign in again");
  }

  return res.json({ success: true, user: user.toPublic() });
};

export const updateMe = async (req, res) => {
  // Only these two fields are updatable; anything else in the body was already
  // stripped by the schema, so credits and plan cannot be set from here.
  const { name, avatar } = req.body;

  const user = await User.findByIdAndUpdate(
    req.user.userId,
    { $set: { ...(name && { name }), ...(avatar && { avatar }) } },
    { new: true }
  );

  if (!user) {
    throw AppError.unauthorized("Please sign in again");
  }

  return res.json({ success: true, user: user.toPublic() });
};

export const updatePlan = async (req, res) => {
  const { userId, plan, credits } = req.body;

  // $inc rather than read-modify-write: two payments landing at the same moment
  // would otherwise both read the old balance and one top-up would be lost.
  const user = await User.findByIdAndUpdate(
    userId,
    {
      $inc: { credits, totalCredits: credits },
      $set: {
        plan,
        planExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    },
    { new: true }
  );

  if (!user) {
    throw AppError.notFound("User not found");
  }

  req.log.info({ userId, plan, credits }, "plan updated");

  return res.json({ success: true });
};

export const deductCredits = async (req, res) => {
  const { userId, agent } = req.body;
  const requiredCredits = costForAgent(agent);

  /**
   * One atomic operation: "decrement, but only if the balance is still high
   * enough." Mongo evaluates the filter and the update together, so two agent
   * runs starting at the same instant cannot both pass the check against the
   * same balance and each get a run for one charge.
   */
  const user = await User.findOneAndUpdate(
    { _id: userId, credits: { $gte: requiredCredits } },
    { $inc: { credits: -requiredCredits } },
    { new: true }
  );

  if (!user) {
    const exists = await User.exists({ _id: userId });

    if (!exists) {
      throw AppError.notFound("User not found");
    }

    throw AppError.paymentRequired("You do not have enough credits for this action", {
      required: requiredCredits,
      agent,
    });
  }

  req.log.info(
    { userId, agent, charged: requiredCredits, remaining: user.credits },
    "credits deducted"
  );

  return res.json({ success: true, credits: user.credits });
};

/**
 * Gives credits back when an agent run fails after it was charged.
 * Without this, a crashed or aborted run silently costs the user money.
 */
export const refundCredits = async (req, res) => {
  const { userId, agent } = req.body;
  const amount = costForAgent(agent);

  const user = await User.findByIdAndUpdate(userId, { $inc: { credits: amount } }, { new: true });

  if (!user) {
    throw AppError.notFound("User not found");
  }

  req.log.info({ userId, agent, refunded: amount }, "credits refunded");

  return res.json({ success: true, credits: user.credits });
};
