import { Schema, model, Document } from 'mongoose';
import { ObjectId } from './common/types';
import { MessageType, SenderType, ReadReceipt } from './chat-session.model';

export interface IChatMessage extends Document {
  sessionId: ObjectId;
  senderId: ObjectId;
  senderType: SenderType;
  content: string;
  messageType: MessageType;
  attachments: string[];
  readBy: ReadReceipt[];
  editedAt?: Date;
  isDeleted: boolean;
  metadata?: {
    originalContent?: string; // for edited messages
    deliveryStatus?: 'sent' | 'delivered' | 'failed';
    clientMessageId?: string; // for deduplication
  };
  createdAt: Date;
  updatedAt: Date;
}

// Chat Message Schema
const ChatMessageSchema = new Schema<IChatMessage>({
  sessionId: { 
    type: Schema.Types.ObjectId, 
    ref: 'ChatSession', 
    required: true,
    index: true
  },
  senderId: { 
    type: Schema.Types.ObjectId, 
    ref: 'Auth', 
    required: true,
    index: true
  },
  senderType: { 
    type: String, 
    enum: Object.values(SenderType), 
    required: true 
  },
  content: { 
    type: String, 
    required: true,
    maxlength: 4000 // Reasonable limit for chat messages
  },
  messageType: { 
    type: String, 
    enum: Object.values(MessageType), 
    default: MessageType.TEXT 
  },
  attachments: [{
    type: String // URLs to uploaded files
  }],
  readBy: [{
    userId: { type: Schema.Types.ObjectId, ref: 'Auth', required: true },
    readAt: { type: Date, required: true }
  }],
  editedAt: Date,
  isDeleted: { 
    type: Boolean, 
    default: false 
  },
  metadata: {
    originalContent: String,
    deliveryStatus: { 
      type: String, 
      enum: ['sent', 'delivered', 'failed'], 
      default: 'sent' 
    },
    clientMessageId: String
  }
}, { 
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for performance
ChatMessageSchema.index({ sessionId: 1, createdAt: 1 });
ChatMessageSchema.index({ senderId: 1, createdAt: -1 });
ChatMessageSchema.index({ senderType: 1, createdAt: -1 });
ChatMessageSchema.index({ messageType: 1 });
ChatMessageSchema.index({ 'readBy.userId': 1 });

// Virtual for read status
ChatMessageSchema.virtual('isRead').get(function() {
  return this.readBy && this.readBy.length > 0;
});

// Virtual for attachment count
ChatMessageSchema.virtual('attachmentCount').get(function() {
  return this.attachments ? this.attachments.length : 0;
});

// Method to mark as read by user
ChatMessageSchema.methods.markAsRead = function(userId: ObjectId) {
  const existingRead = this.readBy.find((read: ReadReceipt) => 
    read.userId.toString() === userId.toString()
  );
  
  if (!existingRead) {
    this.readBy.push({
      userId,
      readAt: new Date()
    });
  }
  
  return this.save();
};

// Method to check if read by specific user
ChatMessageSchema.methods.isReadBy = function(userId: ObjectId): boolean {
  return this.readBy.some((read: ReadReceipt) => 
    read.userId.toString() === userId.toString()
  );
};

// Pre-save middleware for edited messages
ChatMessageSchema.pre('save', function(next) {
  if (this.isModified('content') && !this.isNew && !this.metadata?.originalContent) {
    this.metadata = this.metadata || {};
    this.metadata.originalContent = this.content;
    this.editedAt = new Date();
  }
  next();
});

export default model<IChatMessage>('ChatMessage', ChatMessageSchema);