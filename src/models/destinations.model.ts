import mongoose, { Schema, model, Document } from 'mongoose';
import { commonOptions } from './common/options';
import { ObjectId } from './common/types';

// Interface definition
export interface IDestination extends Document {
  name: string;
  description?: string;
  priceToDFW: number;
  priceFromDFW: number;
  priceRoundTrip: number;
  salesOffice: ObjectId;
  MinutesOfDifference: number;
  TerminalOfReference: ObjectId;
  isTerminal: boolean;
  isActive: boolean;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Schema definition
const DestinationSchema = new Schema<IDestination>({
  name: { type: String, required: true },
  description: { type: String, default: null },
  priceToDFW: { type: Number, required: true },
  priceFromDFW: { type: Number, required: true },
  priceRoundTrip: { type: Number, required: true },
  salesOffice: [{ type: Schema.Types.ObjectId, ref: "Office", required: true }],
  MinutesOfDifference: { type: Number, required: true },
  TerminalOfReference: { type: Schema.Types.ObjectId, ref: "Destination", required: false },
  isTerminal: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true },
  isDeleted: { type: Boolean, default: false }
}, commonOptions);

// Model export
const Destination = model<IDestination>('Destination', DestinationSchema);
export default Destination;