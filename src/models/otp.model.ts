import mongoose from "mongoose";
import { OTP_EXPIRY_SECONDS } from "../config/environment";

const otpSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
    },
    otp: {
      type: mongoose.Schema.Types.String,
    },
    expiry: {
      type: mongoose.Schema.Types.Date,
      default: () =>
        new Date(Date.now() + parseInt(OTP_EXPIRY_SECONDS || "600") * 1000),
    },
    createdAt: {
      type: mongoose.Schema.Types.Date,
      default: Date.now,
      expires: parseInt(OTP_EXPIRY_SECONDS || "600"), // TTL in seconds - MongoDB will automatically delete documents after this time
    },
  },
  {
    timestamps: true,
  }
);

// Additional TTL index for the expiry field (backup cleanup)
otpSchema.index({ expiry: 1 }, { expireAfterSeconds: 0 });

export const OtpModel = mongoose.model("otp", otpSchema);
