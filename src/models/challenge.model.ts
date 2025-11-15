import mongoose, { Schema, model, Document } from "mongoose";
import { ObjectId, UserRole } from "./common/types";
import { IProfile } from "./profile.model";
import { IAuth } from "./auth.model";

export interface IChallenge extends Document {
  auth: ObjectId | IAuth;
  profile: ObjectId | IProfile;
  challenge: string;
}


const ChallengeSchema = new Schema(
  {
    auth: {
      type: Schema.Types.ObjectId,
      ref: "Auth",
      required: true,
    },
    profile: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Profile",
    },
    challenge: {
      type: Schema.Types.String,
    },
  },
  {
    timestamps: true,
  }
);

const ChallengeModel = model("Challenge", ChallengeSchema);

export default ChallengeModel;
