import mongoose, { Schema, model, Document } from "mongoose";
import { ObjectId } from "./common/types";
import { IAuth } from "./auth.model";

export interface IPasskey extends Document {
  auth: ObjectId | IAuth;
  credentialId: string;
  credential: any; // WebAuthn credential object
  name?: string; // User-friendly name for the passkey
  deviceType?: string; // e.g., "iPhone", "Windows PC", "USB Key"
  lastUsed?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const PasskeySchema = new Schema(
  {
    auth: {
      type: Schema.Types.ObjectId,
      ref: "Auth",
      required: true,
    },
    credentialId: {
      type: Schema.Types.String,
      required: true,
    },
    credential: {
      type: Schema.Types.Mixed,
      required: true,
    },
    name: {
      type: Schema.Types.String,
      default: "Passkey",
    },
    deviceType: {
      type: Schema.Types.String,
      default: "Unknown",
    },
    lastUsed: {
      type: Schema.Types.Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Index for efficient lookups
PasskeySchema.index({ auth: 1, credentialId: 1 });
PasskeySchema.index({ credentialId: 1 }, { unique: true });

const PasskeyModel = model("Passkey", PasskeySchema);

export default PasskeyModel;
