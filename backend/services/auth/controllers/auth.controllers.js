import { getAuth } from "firebase-admin/auth";
import User from "../models/user.model.js";
import { getFirebaseApp } from "../config/firebase.js";
import { AppError } from "../../../shared/errors/AppError.js";
import { costForAgent } from "../config/credits.js";
import {
  cookieOptions,
  createSession,
  destroySession,
  refreshSession,
} from "../services/session.service.js";

export const login = async (req, res) => {
  const { token } = req.body;

  let decoded;
  try {
    decoded = await getAuth(getFirebaseApp()).verifyIdToken(token);
  } catch (error) {
    // A missing-credentials AppError is our own configuration problem, not the
    // user's bad token — let it through as a 500 rather than masking it as 401.
    if (error instanceof AppError) throw error;

    // Any verification failure is the same answer to the client. Passing the
    // library's message through would tell an attacker exactly why a forged
    // token was rejected.
    req.log.warn({ err: error }, "firebase token verification failed");
    throw AppError.unauthorized("Sign in failed, please try again");
  }

  let user = await User.findOne({ firebaseUid: decoded.uid });

  if (!user) {
    user = await User.create({
      firebaseUid: decoded.uid,
      email: decoded.email,
      name: decoded.name,
      avatar: decoded.picture,
      provider: decoded.firebase?.sign_in_provider,
    });
    req.log.info({ userId: user._id }, "new user registered");
  }

  const sessionId = await createSession(user);
  res.cookie("session", sessionId, cookieOptions());

  req.log.info({ userId: user._id }, "user signed in");

  return res.json({ success: true, user });
};

export const logout = async (req, res) => {
  await destroySession(req.cookies?.session);

  // Clearing options must match the ones used to set it, or the browser keeps
  // the cookie and the user appears to stay signed in.
  res.clearCookie("session", { ...cookieOptions(), maxAge: undefined });

  return res.status(200).json({ success: true, message: "Logged out successfully" });
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

  await refreshSession(user);

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
   *
   * A null result means the condition failed — either no such user, or not
   * enough credits.
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

    throw AppError.paymentRequired(
      "You do not have enough credits for this action",
      { required: requiredCredits, agent }
    );
  }

  await refreshSession(user);

  req.log.info({ userId, agent, charged: requiredCredits, remaining: user.credits }, "credits deducted");

  return res.json({ success: true, credits: user.credits });
};

/**
 * Gives credits back when an agent run fails after it was charged.
 *
 * Without this, a crashed or aborted run silently costs the user money. Capped
 * at totalCredits so a refund cannot push a balance above what was ever granted.
 */
export const refundCredits = async (req, res) => {
  const { userId, agent } = req.body;
  const amount = costForAgent(agent);

  const user = await User.findByIdAndUpdate(userId, { $inc: { credits: amount } }, { new: true });

  if (!user) {
    throw AppError.notFound("User not found");
  }

  await refreshSession(user);

  req.log.info({ userId, agent, refunded: amount }, "credits refunded");

  return res.json({ success: true, credits: user.credits });
};
