import mongoose, { Schema, model, Document } from "mongoose";
import { ObjectId } from "./common/types";
import { IProfile } from "./profile.model";
import { IAuth } from "./auth.model";

export interface ILoginChallenge extends Document {
  auth: ObjectId | IAuth;
  profile: ObjectId | IProfile;
  loginChallenge: string;
  createdAt: Date;
  updatedAt: Date;
}


const LoginChallengeSchema = new Schema(
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
    loginChallenge: {
      type: Schema.Types.String,
    },
  },
  {
    timestamps: true,
  }
);

const LoginChallengeModel = model("LoginChallenge", LoginChallengeSchema);

export default LoginChallengeModel;
