import multer from "multer";
import os from "os";
import path from "path";
import fs from "fs";
import { env } from "./env.js";

/**
 * Uploads land in the system temp directory, not in the application folder.
 *
 * Two reasons. The container runs as a non-root user while /app belongs to
 * root, so creating a directory beside the source fails with EACCES and takes
 * the whole service down on startup. And the old path was resolved from the
 * current working directory, so where it pointed depended on how the process
 * was launched.
 *
 * The system temp directory is writable by any user on every platform, which
 * suits files that only need to survive until the agent reading them is done.
 */
const uploadDir = env.UPLOAD_TEMP_DIR || path.join(os.tmpdir(), "cortex-uploads");

fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination(req, file, cb) {
    cb(null, uploadDir);
  },

  filename(req, file, cb) {
    /**
     * The client's filename is never used as a path. Kept as-is it could
     * contain "../" and write the upload outside this directory. The extension
     * is the only part worth preserving, so the rest is generated.
     */
    const extension = path.extname(file.originalname).slice(0, 10);
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 10)}${extension}`);
  },
});

const fileFilter = (req, file, cb) => {
  if (file.mimetype === "application/pdf" || file.mimetype.startsWith("image/")) {
    cb(null, true);
  } else {
    cb(new Error("Only PDF and Images are allowed."));
  }
};

export default multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 20 * 1024 * 1024,
  },
});
