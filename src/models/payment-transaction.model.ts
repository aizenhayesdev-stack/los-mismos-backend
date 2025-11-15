import mongoose, { Schema, model, Document } from 'mongoose';
import { commonOptions } from './common/options';
import { ObjectId, PaymentGateway, TransactionStatus } from './common/types';

// Interface definition
export interface IPaymentTransaction extends Document {
  booking?: ObjectId;
  amount: number;
  currency: string;
  gateway: PaymentGateway;
  gatewayResponse?: any;
  transactionId?: string;
  status: TransactionStatus;
  createdBy?: ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

// Schema definition
const PaymentTransactionSchema = new Schema<IPaymentTransaction>({
  booking: { type: Schema.Types.ObjectId, ref: 'Booking' },
  amount: { type: Number, required: true },
  currency: { type: String, default: 'MXN' },
  gateway: { 
    type: String, 
    enum: Object.values(PaymentGateway), 
    required: true 
  },
  gatewayResponse: Schema.Types.Mixed,
  transactionId: { type: String, index: true },
  status: { 
    type: String, 
    enum: Object.values(TransactionStatus), 
    default: TransactionStatus.INITIATED, 
    index: true 
  },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' }, // cashier or system
  createdAt: { type: Date, default: Date.now }
}, commonOptions);

// Indexes
// PaymentTransactionSchema.index({ transactionId: 1 });

// Model export
const PaymentTransaction = model<IPaymentTransaction>('PaymentTransaction', PaymentTransactionSchema);
export default PaymentTransaction;