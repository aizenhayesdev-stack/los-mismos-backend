import mongoose, { Schema, model, Document } from 'mongoose';
import { commonOptions } from './common/options';

// Interface definition
export interface IOffice extends Document {
  name: string;
  description?: string;
  isActive: boolean;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Schema definition
const OfficeSchema = new Schema<IOffice>({
  name: { type: String, required: true },
  description: { type: String, default: null },
  isActive: { type: Boolean, default: true },
  isDeleted: { type: Boolean, default: false }
}, commonOptions);

// Model export
const OfficeModel = model<IOffice>('Office', OfficeSchema);
export default OfficeModel;