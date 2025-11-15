import mongoose, { Schema, model, Document, Mongoose } from "mongoose";
import { commonOptions } from "./common/options";
import { DaysEnums, GeoLocation, GeoLocationType, ObjectId, SeatLayoutType, SeatStatus, SeatType } from "./common/types";

// Interface definition
export interface BookedDateCount {
  date: Date;
  count: number;
}
export interface DepartureDate {
  date: Date;
  userId: ObjectId;
}
export interface SeatBooking {
  departureDate: Date;
  userId?: ObjectId;
  bookingId?: ObjectId;
  status: string;
  heldAt?: Date;
  expiresAt?: Date;
}

export interface Seat {
  seatLabel: string;
  seatIndex: number;
  type: string;
  status: string;
  departureDateBookings: SeatBooking[];
  isAvailable: boolean;
  userId?: ObjectId;
  meta?: any;
}

export interface SeatLayout {
  type: string;
  seats: Seat[];
}

export interface IBus extends Document {
  description?: string;
  serialNumber: string;
  code: string;
  plateNumber?: string;
  make?: string;
  busModel?: string;
  year?: number;
  capacity: number;
  currentLocation?: GeoLocation | undefined;
  seatLayout: SeatLayout;
  amenities: string[];
  lastMaintenanceAt?: Date;
  nextMaintenanceDue?: Date;
  isActive: boolean;
  office?: ObjectId;
  driver?: ObjectId;
  departureDay?: DaysEnums[];
  departureDate?: DepartureDate[];
  departureTime?: Date;
  totalBookedSeats: number;
  passengerOnBoarded: number;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
  mxdriverId?: ObjectId;
  onBoardedDateCount?: BookedDateCount[];
  bookedDateCount: BookedDateCount[];
}

// Schema definition
const BusSchema = new Schema<IBus>(
  {
    code:{
      type:String,
      required:true,
      index:true,
      unique:true,
    },
    mxdriverId:  { type: Schema.Types.ObjectId, ref: "Auth", default:null }, // driver user id
    description: {type:String, default:null},
    serialNumber: {
      type: String,
      required: true,
      index: true,
      unique: true,
    },
    plateNumber: {type:String, default:null},
    make: {type:String, default:null},
    busModel: {type:String, default:null},
    year: {type:Number, default:null},
    capacity: { type: Number, default:null },
    currentLocation: {
      type: Schema.Types.Mixed,
      default: undefined,
    },
    seatLayout: {
      type: {
        type: String,
        enum: Object.values(SeatLayoutType),
        default: SeatLayoutType.STANDARD,
      },
      // seats array stores seat id/label, type, position, priceModifiers
      seats: [
        {
          seatLabel: String, // e.g. "1A"
          seatIndex: Number,
          type: {
            type: String,
            enum: Object.values(SeatType),
            default: SeatType.REGULAR,
          },
          status:{
            type: String,
            enum: SeatStatus,
            default: SeatStatus.AVAILABLE,
          },
          departureDateBookings: [{
            departureDate: { type: Date, required: true },
            userId: { type: Schema.Types.ObjectId, ref: "User" },
            bookingId: { type: Schema.Types.ObjectId, ref: "Passenger" },
            status: {
              type: String,
              enum: Object.values(SeatStatus),
              default: SeatStatus.AVAILABLE,
            },
            heldAt: { type: Date, default: null },
            expiresAt: { type: Date, default: null }
          }],
          isAvailable: { type: Boolean, default: true },
          userId: { type: Schema.Types.ObjectId, ref: "User", default:null },
          // you can store geometry for mapping seat positions in UI
          meta: Schema.Types.Mixed,
        },
      ],
    },
    amenities: [{type:String, default:null}], // e.g. ['wifi','restroom','usb']
    lastMaintenanceAt: {type:Date, default:null},
    nextMaintenanceDue: {type:Date, default:null},
    isDeleted: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    office: { type: Schema.Types.ObjectId, ref: "Office", default:null }, // assigned home office or depot
    driver: { type: Schema.Types.ObjectId, ref: "Auth", default:null }, // driver user id
    departureDay: [{type:String, enum: DaysEnums, default:null}],
    departureTime: {type:Date, default:null},
    bookedDateCount: {type:Schema.Types.Mixed, default:null},
    onBoardedDateCount: {type:Schema.Types.Mixed, default:null},
    totalBookedSeats: {type:Number, default:0},
    passengerOnBoarded: {type:Number, default:0},
  },
  commonOptions
);

// Indexes
// BusSchema.index({ registrationNumber: 1 }, { unique: true });
// Note: 2dsphere index will be created manually for documents that have currentLocation


// Model export
const BusModel = model<IBus>("Bus", BusSchema);
export default BusModel;
