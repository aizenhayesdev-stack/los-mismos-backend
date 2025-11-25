import mongoose, { Schema, model, Document } from "mongoose";
import { LoginTypes, ObjectId, UserRole } from "./common/types";
import { IProfile } from "./profile.model";

export interface IAuth extends Document {
  email: string;
  password: string;
  reason?: string | null;
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
    password: { type: Schema.Types.String, requried: false },
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
    loginType:{
      type: Schema.Types.String,
      enum: LoginTypes,
      default: LoginTypes.Default,
    },
    reason:{
      type: Schema.Types.String,
      default: null,
    }
  },
  {
    timestamps: true,
  }
);

const AuthModel = model<IAuth>("Auth", AuthSchema);

export default AuthModel;
