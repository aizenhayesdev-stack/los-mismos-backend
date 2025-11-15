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
  UserRole,
  ForWho,
  TripType,
  TicketStatus,
} from "./common/types";
import { IAuth } from "./auth.model";
import { IProfile } from "./profile.model";
import { IBus } from "./bus.model";
import { IOffice } from "./office.model";

// Interface definition
export interface IPassenger extends Document {
  user: ObjectId | IProfile;
  bookedBy: UserRole
  seatLabel: string;
  busId: ObjectId | IBus;
  for: ForWho
  ticketNumber: string;
  fullName: string;
  gender: Gender;
  dob: string;
  contactNumber: string;
  DocumentId: string
  groupTicketSerial?: string;
  status: TicketStatus;
  createdAt: Date;
  updatedAt: Date;
  isValid: boolean;
  additionalBaggage: string;
  alreadyScanned: boolean;
  isCancelled: boolean;
  type: TripType
  scannedForTicketCount: number;
  scannedForBaggageCount: number;
  From: string;
  To: string;
  qrCode: string;
  DepartureDate: Date;
  ReturnDate: Date;
  checkedInBy: ObjectId | IAuth;
  paymentIntentId: string;
  extraBaggageIntentId: string;
  price: number;
  currency: string;
  office: string;
  salesOffice: ObjectId | IOffice;
}
// Schema definition
const PassengerSchema = new Schema<IPassenger>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "Auth",
      required: true,
    },
    bookedBy: { type: String, enum: Object.values(UserRole), required: true },
    seatLabel: { type: String, required: true },
    busId: { type: Schema.Types.ObjectId, ref: "Bus", required: true },
    for: { type: String, enum: Object.values(ForWho), required: true },
    ticketNumber: { type: String, required: true },
    fullName: { type: String, required: true },
    gender: { type: String, enum: Object.values(Gender), required: true },
    dob: { type: String, required: false },
    contactNumber: { type: String, required: true },
    DocumentId: { type: String, required: false },
    groupTicketSerial: { type: String, default: null },
    status: { type: String, enum: Object.values(TicketStatus), default: TicketStatus.ACTIVE },
    isValid: { type: Boolean, default: true },
    additionalBaggage: { type: String, default: "" },
    alreadyScanned: { type: Boolean, default: false },
    isCancelled: { type: Boolean, default: false },
    type: { type: String, enum: Object.   values(TripType), required: true },
    scannedForTicketCount: { type: Number, default: 0 },
    scannedForBaggageCount: { type: Number, default: 0 },
    From: { type: String, required: true },
    To: { type: String, required: true },
    DepartureDate: { type: Date, required: true },
    ReturnDate: { type: Date, required: false },
    qrCode: { type: String, default: null },
    checkedInBy: { type: Schema.Types.ObjectId, ref: "Auth", default: null },
    paymentIntentId: { type: String, default: null },
    extraBaggageIntentId: { type: String, default: null },
    price: { type: Number, required: true, default: 0 },
    currency: { type: String, default: "MXN" },
    office: { type: String, default: null },
    salesOffice: { type: Schema.Types.ObjectId, ref: "Office", default: null },
  },
  commonOptions
);

// Model export
const PassengerModel = model<IPassenger>("Passenger", PassengerSchema);
export default PassengerModel;
