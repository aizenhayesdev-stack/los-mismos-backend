import mongoose, { Schema, model, Document } from 'mongoose';
import { commonOptions } from './common/options';
import { ObjectId } from './common/types';

// Interface definition
export interface IDriverReport extends Document {
  route: ObjectId;
  bus: ObjectId;
  mxDriver?: ObjectId;
  usDriver?: ObjectId;
  tripDate: Date;
  tripTime: string;
  origin: ObjectId;
  destination: ObjectId;
  busRouteName: string;
  routeName: string;
  passengers: number;
  status: 'started' | 'completed' | 'cancelled';
  startedAt?: Date;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

// Schema definition
const DriverReportSchema = new Schema<IDriverReport>({
  route: { type: Schema.Types.ObjectId, ref: 'Route', required: true, index: true },
  bus: { type: Schema.Types.ObjectId, ref: 'Bus', required: true, index: true },
  mxDriver: { type: Schema.Types.ObjectId, ref: 'Auth' },
  usDriver: { type: Schema.Types.ObjectId, ref: 'Auth' },
  tripDate: { type: Date, required: true, index: true },
  tripTime: { type: String, required: true },
  origin: { type: Schema.Types.ObjectId, ref: 'Destination', required: true },
  destination: { type: Schema.Types.ObjectId, ref: 'Destination', required: true },
  busRouteName: { type: String, required: true },
  routeName: { type: String, required: true },
  passengers: { type: Number, default: 0 },
  status: { 
    type: String, 
    enum: ['started', 'completed', 'cancelled'], 
    default: 'started',
    index: true 
  },
  startedAt: { type: Date },
  completedAt: { type: Date }
}, commonOptions);

// Indexes for common queries
DriverReportSchema.index({ tripDate: 1, status: 1 });
DriverReportSchema.index({ mxDriver: 1, tripDate: 1 });
DriverReportSchema.index({ usDriver: 1, tripDate: 1 });
DriverReportSchema.index({ bus: 1, tripDate: 1 });

// Model export
const DriverReport = model<IDriverReport>('DriverReport', DriverReportSchema);
export default DriverReport;

