import mongoose, { Schema, model, Document } from 'mongoose';
import { commonOptions } from './common/options';
import { ObjectId, PaymentStatus, BookingStatus, Passenger, RefundInfo } from './common/types';

// Interface definition
export interface IBooking extends Document {
  bookingRef: string;
  trip: ObjectId;
  route?: ObjectId;
  user?: ObjectId;
  passengers: Passenger[];
  totalAmount: number;
  currency: string;
  paymentStatus: PaymentStatus;
  paymentReference?: string;
  bookingStatus: BookingStatus;
  createdByCashier: boolean;
  hold?: ObjectId;
  office?: ObjectId;
  notes?: string;
  cancelledAt?: Date;
  refund?: RefundInfo;
  createdAt: Date;
  updatedAt: Date;
}

// Schema definition
const BookingSchema = new Schema<IBooking>({
  bookingRef: { 
    type: String, 
    required: true, 
    unique: true, 
    index: true 
  }, // e.g. 'LM-20250923-ABC123'
  trip: { type: Schema.Types.ObjectId, ref: 'Trip', required: true, index: true },
  route: { type: Schema.Types.ObjectId, ref: 'Route' },
  user: { type: Schema.Types.ObjectId, ref: 'User' }, // owner / purchaser
  passengers: [{
    firstName: String,
    lastName: String,
    idType: String,
    idNumber: String,
    dob: Date || null,
    seatLabel: String,
    seatIndex: Number,
    passengerRef: String, // for per-passenger QR tickets if needed
    DocumentId: String || null
  }],
  totalAmount: { type: Number, required: true },
  currency: { type: String, default: 'MXN' },
  paymentStatus: { 
    type: String, 
    enum: Object.values(PaymentStatus), 
    default: PaymentStatus.PENDING, 
    index: true 
  },
  paymentReference: { type: String },
  bookingStatus: { 
    type: String, 
    enum: Object.values(BookingStatus), 
    default: BookingStatus.CONFIRMED 
  },
  createdByCashier: { type: Boolean, default: false }, // booked at POS
  hold: { type: Schema.Types.ObjectId, ref: 'SeatHold' },
  office: { type: Schema.Types.ObjectId, ref: 'Office' },
  notes: String,
  cancelledAt: Date,
  refund: {
    refundAmount: Number,
    refundTransactionId: String,
    refundStatus: { 
      type: String, 
      enum: ['pending', 'processed', 'rejected'] 
    }
  }
}, commonOptions);

// Indexes to support common queries:
BookingSchema.index({ user: 1, createdAt: -1 });
// BookingSchema.index({ bookingRef: 1 }, { unique: true });

// Model export
const Booking = model<IBooking>('Booking', BookingSchema);
export default Booking;