import { Schema, model, Document } from 'mongoose';
import { ObjectId } from './common/types';

// Chat-related enums
export enum ChatStatus {
  WAITING = 'waiting',
  ACTIVE = 'active',
  CLOSED = 'closed',
  TRANSFERRED = 'transferred'
}

export enum ChatPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  URGENT = 'urgent'
}

export enum MessageType {
  TEXT = 'text',
  IMAGE = 'image',
  FILE = 'file',
  SYSTEM_NOTIFICATION = 'system_notification'
}

export enum SenderType {
  CUSTOMER = 'customer',
  AGENT = 'agent',
  SYSTEM = 'system'
}

// Interfaces
export interface ReadReceipt {
  userId: ObjectId;
  readAt: Date;
}

export interface CustomerSummary {
  name: string;
  email: string;
  phone?: string;
  totalBookings: number;
  lastBookingDate?: Date;
  preferredLanguage: string;
}

export interface ChatMessage {
  id: string;
  sessionId: ObjectId;
  senderId: ObjectId;
  senderType: SenderType;
  content: string;
  messageType: MessageType;
  attachments?: string[];
  timestamp: Date;
  readBy: ReadReceipt[];
  editedAt?: Date;
  isDeleted: boolean;
}

export interface IChatSession extends Document {
  customerId: ObjectId;
  agentId?: ObjectId;
  status: ChatStatus;
  priority: ChatPriority;
  category: string;
  subject?: string;
  messages: ObjectId[];
  metadata: {
    customerInfo: CustomerSummary;
    relatedBookings: ObjectId[];
    tags: string[];
    source: string; // 'web', 'mobile', 'admin'
  };
  satisfaction?: number;
  feedback?: string;
  estimatedWaitTime?: number;
  actualWaitTime?: number;
  queuePosition?: number;
  transferHistory?: Array<{
    fromAgent: ObjectId;
    toAgent: ObjectId;
    reason: string;
    timestamp: Date;
  }>;
  firstResponseAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  closedAt?: Date;
}

// Chat Session Schema
const ChatSessionSchema = new Schema<IChatSession>({
  customerId: { 
    type: Schema.Types.ObjectId, 
    ref: 'Auth', 
    required: true,
    index: true
  },
  agentId: { 
    type: Schema.Types.ObjectId, 
    ref: 'Auth',
    index: true
  },
  status: { 
    type: String, 
    enum: Object.values(ChatStatus), 
    default: ChatStatus.WAITING,
    index: true
  },
  priority: { 
    type: String, 
    enum: Object.values(ChatPriority), 
    default: ChatPriority.MEDIUM,
    index: true
  },
  category: { 
    type: String, 
    required: true,
    index: true
  },
  subject: String,
  messages: [{ 
    type: Schema.Types.ObjectId, 
    ref: 'ChatMessage' 
  }],
  metadata: {
    customerInfo: {
      name: { type: String, required: true },
      email: { type: String, required: true },
      phone: String,
      totalBookings: { type: Number, default: 0 },
      lastBookingDate: Date,
      preferredLanguage: { type: String, default: 'en' }
    },
    relatedBookings: [{ 
      type: Schema.Types.ObjectId, 
      ref: 'Booking' 
    }],
    tags: [String],
    source: { 
      type: String, 
      enum: ['web', 'mobile', 'admin'], 
      default: 'web' 
    }
  },
  satisfaction: { 
    type: Number, 
    min: 1, 
    max: 5 
  },
  feedback: String,
  estimatedWaitTime: Number, // in seconds
  actualWaitTime: Number, // in seconds
  queuePosition: Number,
  transferHistory: [{
    fromAgent: { type: Schema.Types.ObjectId, ref: 'Auth' },
    toAgent: { type: Schema.Types.ObjectId, ref: 'Auth' },
    reason: String,
    timestamp: { type: Date, default: Date.now }
  }],
  firstResponseAt: Date,
  closedAt: Date
}, { 
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for performance
ChatSessionSchema.index({ customerId: 1, createdAt: -1 });
ChatSessionSchema.index({ agentId: 1, status: 1 });
ChatSessionSchema.index({ status: 1, priority: -1, createdAt: 1 });
ChatSessionSchema.index({ category: 1, createdAt: -1 });
ChatSessionSchema.index({ 'metadata.tags': 1 });

// Virtual for message count
ChatSessionSchema.virtual('messageCount').get(function() {
  return this.messages.length;
});

// Virtual for duration
ChatSessionSchema.virtual('duration').get(function() {
  if (this.closedAt) {
    return this.closedAt.getTime() - this.createdAt.getTime();
  }
  return Date.now() - this.createdAt.getTime();
});

// Pre-save middleware
ChatSessionSchema.pre('save', function(next) {
  if (this.isModified('status') && this.status === ChatStatus.CLOSED && !this.closedAt) {
    this.closedAt = new Date();
  }
  next();
});

export default model<IChatSession>('ChatSession', ChatSessionSchema);