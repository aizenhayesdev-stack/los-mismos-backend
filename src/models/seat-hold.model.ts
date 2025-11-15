import mongoose, { Schema, model, Document } from 'mongoose';
import { commonOptions } from './common/options';
import { ObjectId, BookingSource, SeatHoldInfo } from './common/types';

// Interface definition
export interface ISeatHold extends Document {
  trip: ObjectId;
  seats: SeatHoldInfo[];
  user?: ObjectId;
  createdAt: Date;
  expiresAt: Date;
  source: BookingSource;
  office?: ObjectId;
  updatedAt: Date;
}

// Schema definition
const SeatHoldSchema = new Schema<ISeatHold>({
  trip: { type: Schema.Types.ObjectId, ref: 'Trip', required: true, index: true },
  seats: [{ seatLabel: String, seatIndex: Number }],
  user: { type: Schema.Types.ObjectId, ref: 'User' }, // can be null for guest
  createdAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true, index: true }, // set to Date.now()+holdWindow
  source: { 
    type: String, 
    enum: Object.values(BookingSource), 
    default: BookingSource.MOBILE 
  },
  office: { type: Schema.Types.ObjectId, ref: 'Office' }
}, commonOptions);

// TTL index - MongoDB will remove documents after expiresAt
// SeatHoldSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 200 }); // 5min

// Model export
const SeatHold = model<ISeatHold>('SeatHold', SeatHoldSchema);
export default SeatHold;