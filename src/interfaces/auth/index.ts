import { Request } from "express";
import { IProfile, ObjectId, UserRole } from "../../models";

export interface CustomRequest extends Request {
  authId?: string;
  email?: string;
  role?: UserRole
}

export interface JwtPayload {
  authId: string;
  role: UserRole
  profileId?: string;
  email: string;
}

export interface IAuthWithProfile {
  email: string;
  password: string;
  role: UserRole;
  profile: IProfile;
  isVerified: boolean
  isProfileCompleted: boolean
  bioMetricEnabled?: boolean;
  createdAt: Date;
  updatedAt: Date;
}