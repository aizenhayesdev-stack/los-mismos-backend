import mongoose, { Schema, model, Document } from 'mongoose';
import { commonOptions } from './common/options';
import { DaysEnums, ObjectId, RouteStatus } from './common/types';

// Interface definition
export interface IRoute extends Document {
  // code: string;
  name: string;
  origin: ObjectId;
  destination: ObjectId;
  bus: ObjectId;
  dayTime:{
    day: DaysEnums,
    time: string  // Format: "HH:mm" (e.g., "07:00", "14:30")
  }[]
  intermediateStops: ObjectId[];
  // baseDurationMinutes?: number;
  // baseDistanceKm?: number;
  // defaultPrice: number;
  // currency: string;
  isActive: boolean;
  // pricingPolicy?: PricingPolicy;
  createdAt: Date;
  isToDallas: boolean;
  status: RouteStatus;
  updatedAt: Date;
}

// Schema definition
const RouteSchema = new Schema<IRoute>({
  name: { type: String, required: true },
  status : { type: String, enum: RouteStatus, default: RouteStatus.BOARDING },
  origin: { type: Schema.Types.ObjectId, ref: 'Destination', required: true },
  destination: { type: Schema.Types.ObjectId, ref: 'Destination', required: true },
  intermediateStops: [{ type: Schema.Types.ObjectId, ref: 'Destination' }],
  bus: { type: Schema.Types.ObjectId, ref: 'Bus', required: true },
  isActive: { type: Boolean, default: true },
  dayTime: {
    type: [new Schema({
      day: {
        type: String,
        enum: Object.values(DaysEnums),
        required: true
      },
      time: {
        type: String,  // Format: "HH:mm" (e.g., "07:00", "14:30")
        required: true,
        validate: {
          validator: function(v: string) {
            // Validate time format HH:mm (24-hour format)
            return /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/.test(v);
          },
          message: 'Time must be in HH:mm format (e.g., "07:00", "14:30")'
        }
      }
    }, { _id: false })],
    default: []
  },
  isToDallas: { type: Boolean, default: false },
  // code: { type: String, required: true, index: true }, // e.g. 'MX-CHIH-UAQ'
  // baseDurationMinutes: Number,
  // baseDistanceKm: Number,
  // defaultPrice: { type: Number, required: true }, // base fare in route currency
  // currency: { type: String, default: 'MXN' },
  // demand-based dynamic pricing config
  // pricingPolicy: {
  //   surgeEnabled: { type: Boolean, default: false },
  //   peakHours: [{ start: String, end: String }], // e.g. '17:00'
  //   priceMultiplier: { type: Number, default: 1.0 }
  // }
  // analytics fields can be computed nightly via batch jobs
}, commonOptions);

// Indexes
RouteSchema.index({ origin: 1, destination: 1 });

// Model export
const RouteModel = model<IRoute>('Route', RouteSchema);
export default RouteModel;