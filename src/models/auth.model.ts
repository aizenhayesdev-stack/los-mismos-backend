import mongoose, { Schema, model } from "mongoose";
import { ObjectId, UserRole } from "./common/types";
import { IProfile } from "./profile.model";

export interface IAuth extends Document {
  email: string;
  password: string;
  role: UserRole;
  profile: ObjectId | IProfile;
  isVerified: boolean
  isProfileCompleted: boolean
  bioMetricEnabled?: boolean;
  isActive: boolean;
  deletedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}


const AuthSchema = new Schema(
  {
    email: { type: Schema.Types.String, requried: true, unique: true },
    password: { type: Schema.Types.String, requried: true },
    role: {
      type: Schema.Types.String,
      enum: UserRole,
      default: UserRole.CUSTOMER,
    },
    profile: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Profile",
    },
    isVerified: {
      type: Schema.Types.Boolean,
      default: false,
    },
    isProfileCompleted: {
      type: Schema.Types.Boolean,
      default: false,
    },
    bioMetricEnabled: {
      type: Schema.Types.Boolean,
      default: false,
    },
    deletedAt: {
      type: Schema.Types.Date,
      default: null,
    },
    isActive: {
      type: Schema.Types.Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

const AuthModel = model("Auth", AuthSchema);

export default AuthModel;
