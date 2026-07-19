import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    // Only set for accounts created through Google. sparse, because most users
    // will not have one and a plain unique index would treat every missing
    // value as a duplicate of the others.
    firebaseUid: {
      type: String,
      unique: true,
      sparse: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },

    /**
     * Absent for Google-only accounts, which is why this is not required.
     *
     * select: false keeps it out of every query result unless explicitly asked
     * for, so a hash cannot leak by someone returning a user object straight to
     * the client.
     */
    passwordHash: {
      type: String,
      select: false,
    },

    avatar: String,

    // How this account can sign in. A Google user who later sets a password
    // ends up with both.
    providers: {
      type: [String],
      enum: ["password", "google"],
      default: [],
    },

    plan: {
      type: String,
      default: "free",
    },

    credits: {
      type: Number,
      default: 100,
    },

    totalCredits: {
      type: Number,
      default: 100,
    },

    planExpiresAt: Date,
  },
  { timestamps: true }
);

/** Strips sensitive and internal fields before a user is sent to the client. */
userSchema.methods.toPublic = function toPublic() {
  return {
    userId: this._id,
    name: this.name,
    email: this.email,
    avatar: this.avatar,
    plan: this.plan,
    credits: this.credits,
    totalCredits: this.totalCredits,
    providers: this.providers,
    planExpiresAt: this.planExpiresAt,
  };
};

const User = mongoose.model("User", userSchema);
export default User;
