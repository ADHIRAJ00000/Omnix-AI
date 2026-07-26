import express from "express";
import { Artifact } from "../models/artifact.model.js";
import { verifyDownloadLink } from "../utils/artifactStore.js";
import { asyncHandler } from "../../../shared/http/asyncHandler.js";
import { requireInternalAuth } from "../../../shared/http/internalAuth.js";
import { AppError } from "../../../shared/errors/AppError.js";

const router = express.Router();

/**
 * Serves a generated file to whoever holds a valid signed link.
 *
 * Deliberately without requireUser, unlike every other route on this service.
 * The link is followed by the browser itself — a markdown link click or an
 * <img> tag — and neither sends an Authorization header, so requiring one would
 * mean no generated file could ever be opened. The signature in the URL is the
 * authorisation, exactly as with an S3 presigned URL.
 *
 * requireInternalAuth still applies, so the route is only reachable through the
 * gateway rather than by addressing this service's public URL directly.
 */
router.get(
  "/:id",
  requireInternalAuth,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { e: expiresAt, s: signature } = req.query;

    const check = verifyDownloadLink(id, expiresAt, signature);

    if (!check.ok) {
      throw check.reason === "expired"
        ? AppError.unauthorized("This download link has expired. Generate the file again.")
        : AppError.unauthorized("This download link is not valid.");
    }

    // The signature covers the id, so a valid one proves the link came from us.
    // A missing document therefore means it was cleaned up, not tampered with.
    const artifact = await Artifact.findById(id);

    if (!artifact) {
      throw AppError.notFound("That file is no longer available. Generate it again.");
    }

    res.setHeader("Content-Type", artifact.contentType);
    res.setHeader("Content-Length", artifact.size);

    /**
     * inline lets the browser show PDFs and images in a tab, which is what a
     * user expects from a preview link, while still offering to save. The
     * filename is quoted because generated titles can contain spaces.
     */
    res.setHeader("Content-Disposition", `inline; filename="${artifact.filename}"`);

    // These URLs expire, so a cache that outlived the link would serve a file
    // the signature no longer authorises.
    res.setHeader("Cache-Control", "private, max-age=3600");

    return res.send(artifact.data);
  })
);

export default router;
