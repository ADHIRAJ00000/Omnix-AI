import crypto from "node:crypto";
import { Artifact } from "../models/artifact.model.js";
import { env } from "../config/env.js";
import { AppError } from "../../../shared/errors/AppError.js";

/**
 * Below MongoDB's hard 16MB document limit, with room for the other fields.
 * Checked here so an oversized file is a clear message rather than a driver
 * error raised halfway through the write.
 */
const MAX_BYTES = 15 * 1024 * 1024;

/** Signatures are truncated: 32 hex characters is ample against forgery here. */
const SIGNATURE_LENGTH = 32;

const sign = (id, expiresAt) =>
  crypto
    .createHmac("sha256", env.INTERNAL_API_KEY)
    .update(`${id}.${expiresAt}`)
    .digest("hex")
    .slice(0, SIGNATURE_LENGTH);

/**
 * Stores a generated file and returns a link the browser can follow directly.
 *
 * The link carries its own expiring signature instead of requiring an access
 * token, which is what makes it work at all: these URLs are handed to the user
 * as markdown links and image tags, and a plain link click or an <img> request
 * sends no Authorization header. It is the same idea as an S3 presigned URL —
 * possession of a signed, time-limited link is the authorisation.
 */
export const saveArtifact = async (
  buffer,
  filename,
  contentType,
  { userId, conversationId, ttlSeconds = 24 * 60 * 60 }
) => {
  if (buffer.length > MAX_BYTES) {
    throw AppError.badRequest(
      "That generated file is too large to store. Try asking for something shorter."
    );
  }

  /**
   * The document outlives the link deliberately. A link that has expired should
   * report that it expired, which needs the record to still be there; if the
   * document vanished at the same moment, the same request would report the
   * file as missing instead, which reads like data loss.
   */
  const expiresAt = new Date(Date.now() + ttlSeconds * 2 * 1000);

  const artifact = await Artifact.create({
    userId,
    conversationId,
    filename,
    contentType,
    size: buffer.length,
    data: buffer,
    expiresAt,
  });

  const id = artifact._id.toString();
  const linkExpiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;

  const url = new URL(`/api/files/${id}`, env.GATEWAY_URL);
  url.searchParams.set("e", String(linkExpiresAt));
  url.searchParams.set("s", sign(id, linkExpiresAt));

  return { id, url: url.toString(), filename, contentType, size: buffer.length };
};

/**
 * Confirms a link was issued by us and has not expired.
 *
 * Compared in constant time: a plain === leaks, through how long it takes to
 * fail, how much of a guessed signature was correct, which is enough to
 * reconstruct one byte at a time.
 */
export const verifyDownloadLink = (id, expiresAt, signature) => {
  const expiry = Number(expiresAt);

  if (!Number.isFinite(expiry) || typeof signature !== "string") {
    return { ok: false, reason: "invalid" };
  }

  const expected = Buffer.from(sign(id, expiry));
  const provided = Buffer.from(signature);

  if (expected.length !== provided.length || !crypto.timingSafeEqual(expected, provided)) {
    return { ok: false, reason: "invalid" };
  }

  if (expiry * 1000 < Date.now()) {
    return { ok: false, reason: "expired" };
  }

  return { ok: true };
};
