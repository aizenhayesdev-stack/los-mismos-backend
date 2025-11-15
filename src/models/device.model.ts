import mongoose, { Schema, model, Document } from 'mongoose';
import { commonOptions } from './common/options';
import { ObjectId, DeviceType } from './common/types';

// Interface definition
export interface IDevice extends Document {
  auth: ObjectId;
  deviceType: DeviceType;
  deviceToken: string;
  deviceName: string;
  isActive: boolean;
  lastAuthMethod?: 'password' | 'biometric' | 'otp';
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

// Schema definition
const DeviceSchema = new Schema<IDevice>({
  auth: { type: Schema.Types.ObjectId, ref: 'Auth', required: true },
  deviceType: { 
    type: String, 
    required: true, 
    enum: Object.values(DeviceType) 
  },
  deviceToken: { 
    type: String, 
    required: true, 
    unique: true, 
    index: true 
  },
  deviceName: { type: String, required: true },
  isActive: { type: Boolean, default: true },
  lastAuthMethod: { 
    type: String, 
    enum: ['password', 'biometric', 'otp'],
    default: null 
  },
  lastLoginAt: { type: Date, default: null }
}, commonOptions);

// Indexes
// DeviceSchema.index({ deviceToken: 1 }, { unique: true });

// Model export
const DeviceModel = model<IDevice>('Device', DeviceSchema);
export default DeviceModel;