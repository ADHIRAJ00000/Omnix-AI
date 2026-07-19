import mongoose from "mongoose";

const paymentSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
      index: true,
    },

    orderId: {
      type: String,
      required: true,
      // One record per Razorpay order. A duplicate insert fails at the database
      // rather than quietly creating a second chance to claim the same credits.
      unique: true,
    },

    // sparse: many records legitimately have no paymentId yet (status "created"),
    // and a plain unique index would treat all those missing values as duplicates.
    paymentId: {
      type: String,
      unique: true,
      sparse: true,
    },

    amount: Number,

    currency: {
      type: String,
      default: "INR",
    },

    credits: Number,

    plan: String,

    status: {
      type: String,
      enum: ["created", "paid", "failed"],
      default: "created",
    },
  },
  { timestamps: true }
);

export default mongoose.model("Payment", paymentSchema);
