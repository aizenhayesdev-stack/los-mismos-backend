import mongoose, { Schema, model, Document } from 'mongoose';
import { commonOptions } from './common/options';
import { ObjectId, NotificationType, DeliveryStatus, NotificationCategory, UserRole } from './common/types';

// Interface for notification metadata with routing information
export interface NotificationMetadata {
  // Routing metadata for frontend navigation
  screen?: string;
  params?: Record<string, any>;
  
  // Related entities
  bookingId?: ObjectId | string;
  tripId?: ObjectId | string;
  routeId?: ObjectId | string;
  ticketId?: ObjectId | string;
  paymentId?: ObjectId | string;
  
  // Additional data
  bookingRef?: string;
  departureTime?: Date;
  origin?: string;
  destination?: string;
  seatNumbers?: string[];
  amount?: number;
  currency?: string;
  
  // For emergency notifications
  alternativeOptions?: any[];
  
  // For admin notifications
  busCapacity?: number;
  currentBookings?: number;
  
  // Any other custom data
  [key: string]: any;
}

// Interface definition
export interface INotification extends Document {
  user?: ObjectId; // The recipient user (auth id)
  targetRole?: UserRole; // For broadcast notifications to specific roles
  type: NotificationType; // push, email, sms, inapp
  category: NotificationCategory; // booking_confirmation, trip_reminder_24h, etc.
  title: string;
  body: string;
  imageUrl?: string; // Optional image for rich notifications
  metadata?: NotificationMetadata; // Routing and additional data
  
  // Delivery tracking
  sentAt?: Date;
  deliveredAt?: Date;
  readAt?: Date;
  deliveryStatus: DeliveryStatus;
  
  // Push notification specific
  pushToken?: string; // FCM token used for delivery
  pushResponse?: any; // Firebase response
  
  // Priority and expiry
  priority?: 'high' | 'normal' | 'low';
  expiresAt?: Date;
  
  // Scheduling
  scheduledFor?: Date; // For scheduled notifications
  isSent: boolean;
  
  createdAt: Date;
  updatedAt: Date;
}

// Schema definition
const NotificationSchema = new Schema<INotification>({
  user: { type: Schema.Types.ObjectId, ref: 'Auth', index: true },
  targetRole: { 
    type: String, 
    enum: Object.values(UserRole),
    index: true 
  },
  type: { 
    type: String, 
    enum: Object.values(NotificationType), 
    required: true,
    index: true 
  },
  category: { 
    type: String, 
    enum: Object.values(NotificationCategory), 
    required: true,
    index: true 
  },
  title: { type: String, required: true },
  body: { type: String, required: true },
  imageUrl: String,
  metadata: { type: Schema.Types.Mixed },
  
  // Delivery tracking
  sentAt: Date,
  deliveredAt: Date,
  readAt: { type: Date, index: true },
  deliveryStatus: { 
    type: String, 
    enum: Object.values(DeliveryStatus), 
    default: DeliveryStatus.PENDING,
    index: true 
  },
  
  // Push notification specific
  pushToken: String,
  pushResponse: Schema.Types.Mixed,
  
  // Priority and expiry
  priority: { 
    type: String, 
    enum: ['high', 'normal', 'low'],
    default: 'normal' 
  },
  expiresAt: { type: Date, index: true },
  
  // Scheduling
  scheduledFor: { type: Date, index: true },
  isSent: { type: Boolean, default: false, index: true }
}, commonOptions);

// Compound indexes for common queries
NotificationSchema.index({ user: 1, createdAt: -1 });
NotificationSchema.index({ user: 1, readAt: 1 });
NotificationSchema.index({ user: 1, deliveryStatus: 1 });
NotificationSchema.index({ scheduledFor: 1, isSent: 1 });
NotificationSchema.index({ category: 1, createdAt: -1 });
NotificationSchema.index({ targetRole: 1, createdAt: -1 });

// Model export
const Notification = model<INotification>('Notification', NotificationSchema);
export default Notification;