import mongoose, { Schema, model, Document } from "mongoose";
import { commonOptions } from "./common/options";
import {
  ObjectId,
  Gender,
  Language,
  Address,
  EmergencyContact,
  TravelPreferences,
  Documents,
} from "./common/types";
import { IAuth } from "./auth.model";
import { IOffice } from "./office.model";

// Interface for notification preferences
export interface NotificationPreferences {
  pushEnabled: boolean;
  emailEnabled: boolean;
  smsEnabled: boolean;
  
  // Category-specific preferences
  bookingConfirmations: boolean;
  tripReminders: boolean;
  scheduleChanges: boolean;
  emergencyAlerts: boolean;
  promotions: boolean;
  
  // Reminder timing preferences
  reminder24h: boolean;
  reminder2h: boolean;
  reminder30m: boolean;
}

// Interface definition
export interface IProfile extends Document {
  auth: ObjectId | IAuth;
  firstName: string;
  secondName: string;
  lastName: string;
  dob?: Date;
  gender: Gender;
  pictureUrl?: string;
  address?: Address;
  phoneNumber?: string;
  emergencyContact?: string;
  preferredLanguage: Language;
  documents: Documents;
  travelPreferences?: TravelPreferences;
  notificationPreferences?: NotificationPreferences;
  refundAmount?: number;
  office?: ObjectId | IOffice;
  createdAt: Date;
  updatedAt: Date;
}

// Schema definition
const ProfileSchema = new Schema<IProfile>(
  {
    auth: {
      type: Schema.Types.ObjectId,
      ref: "Auth",
      required: true,
      unique: true,
    },
    refundAmount: { type: Number, default: 0 },
    firstName: { type: String, required: true },
    secondName: { type: String },
    lastName: { type: String },
    dob: { type: Date },
    gender: {
      type: String,  
      enum: Object.values(Gender),
      default: Gender.PREFER_NOT_SAY,
    },
    pictureUrl: { type: String, default: null },
    address: {
      streetAddress: { type: String, default: null },
      city: { type: String, default: null },
      state: { type: String, default: null },
      postalCode: { type: String, default: null },
    },
    documents: {
      documentCode: { type: String, default: null },
      documentNumber: { type: String, default: null },
      documentIssuingCountry: { type: String, default: null },
      driverLicenseId: { type: String, default: null },
    },
    phoneNumber: { type: String, default: null },
    emergencyContact: { type: String, default: null },
    preferredLanguage: {
      type: String,
      enum: Object.values(Language),
      default: Language.EN,
    },
    travelPreferences: {
      seatPreference: {
        type: String,
        enum: ["window", "aisle", "front", "back", "none"],
        default: "none",
      },
    },
    notificationPreferences: {
      pushEnabled: { type: Boolean, default: true },
      emailEnabled: { type: Boolean, default: true },
      smsEnabled: { type: Boolean, default: false },
      bookingConfirmations: { type: Boolean, default: true },
      tripReminders: { type: Boolean, default: true },
      scheduleChanges: { type: Boolean, default: true },
      emergencyAlerts: { type: Boolean, default: true },
      promotions: { type: Boolean, default: false },
      reminder24h: { type: Boolean, default: true },
      reminder2h: { type: Boolean, default: true },
      reminder30m: { type: Boolean, default: true },
    },
    office: {
      type: Schema.Types.ObjectId,
      ref: "Office",
      default: null,
    },
  },
  commonOptions
);

// Model export
const Profile = model<IProfile>("Profile", ProfileSchema);
export default Profile;
