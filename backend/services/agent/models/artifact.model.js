import mongoose from "mongoose";

/**
 * Generated files — PDFs, slide decks, images — stored as bytes in MongoDB.
 *
 * Object storage is the usual home for this, but every option with a free tier
 * either wants a card or expires after a year, and the whole project is built
 * to cost nothing. Generated documents are small and few, so the database is a
 * reasonable place for them at this scale.
 *
 * The ceiling to remember: a MongoDB document cannot exceed 16MB, so this is
 * unsuitable for user uploads or anything large. The store enforces a limit
 * below that rather than letting the driver fail on the write.
 */
const artifactSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
      index: true,
    },

    conversationId: {
      type: String,
      index: true,
    },

    filename: {
      type: String,
      required: true,
    },

    contentType: {
      type: String,
      required: true,
    },

    size: {
      type: Number,
      required: true,
    },

    data: {
      type: Buffer,
      required: true,
    },

    /**
     * MongoDB deletes the document once this passes.
     *
     * Without it the free 512MB tier fills with files nobody will open again,
     * and the database holding conversations and the credit ledger is the same
     * one — running it out of space would take the whole app down, not just
     * file downloads.
     */
    expiresAt: {
      type: Date,
      required: true,
      index: { expires: 0 },
    },
  },
  { timestamps: true }
);

export const Artifact = mongoose.model("Artifact", artifactSchema);
