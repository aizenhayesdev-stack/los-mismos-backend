import { Schema, model, Document } from "mongoose";
import { ObjectId } from "./common/types";

// Support ticket enums
export enum TicketStatus {
  OPEN = "open",
  IN_PROGRESS = "in_progress",
  RESOLVED = "resolved",
  CLOSED = "closed",
}

export enum TicketPriority {
  LOW = "low",
  MEDIUM = "medium",
  HIGH = "high",
  URGENT = "urgent",
}

export enum TicketCategory {
  BOOKING_ISSUE = "booking_issue",
  PAYMENT_PROBLEM = "payment_problem",
  SCHEDULE_INQUIRY = "schedule_inquiry",
  REFUND_REQUEST = "refund_request",
  TECHNICAL_ISSUE = "technical_issue",
  COMPLAINT = "complaint",
  SUGGESTION = "suggestion",
  ACCOUNT_ISSUE = "account_issue",
  OTHER = "other",
}

// Interface for ticket comments
export interface TicketComment {
  authorId: ObjectId;
  authorType: "customer" | "admin" | "manager";
  content: string;
  createdAt: Date;
}

// Main support ticket interface
export interface ISupportTicket extends Document {
  ticketNumber: string;
  customerId: ObjectId;
  assignedTo?: ObjectId; // Admin or Manager assigned to handle the ticket
  category: TicketCategory;
  priority: TicketPriority;
  status: TicketStatus;
  subject: string;
  description: string;
  comments: TicketComment[];
  createdAt: Date;
  updatedAt: Date;
  resolvedAt?: Date;
}

// Support Ticket Schema
const SupportTicketSchema = new Schema<ISupportTicket>(
  {
    ticketNumber: {
      type: String,
      unique: true,
      required: false,
    },
    customerId: {
      type: Schema.Types.ObjectId,
      ref: "Auth",
      required: true,
      index: true,
    },
    assignedTo: {
      type: Schema.Types.ObjectId,
      ref: "Auth",
      index: true,
    },
    category: {
      type: String,
      enum: Object.values(TicketCategory),
      required: true,
      index: true,
    },
    priority: {
      type: String,
      enum: Object.values(TicketPriority),
      default: TicketPriority.MEDIUM,
      index: true,
    },
    status: {
      type: String,
      enum: Object.values(TicketStatus),
      default: TicketStatus.OPEN,
      index: true,
    },
    subject: {
      type: String,
      required: true,
      maxlength: 200,
    },
    description: {
      type: String,
      required: true,
      maxlength: 5000,
    },
    comments: [
      {
        authorId: { type: Schema.Types.ObjectId, ref: "Auth", required: true },
        authorType: {
          type: String,
          enum: ["customer", "admin", "manager"],
          required: true,
        },
        content: { type: String, required: true, maxlength: 2000 },
        createdAt: { type: Date, default: Date.now },
      },
    ],
    resolvedAt: Date,
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes for performance
SupportTicketSchema.index({ customerId: 1, createdAt: -1 });
SupportTicketSchema.index({ assignedTo: 1, status: 1 });
SupportTicketSchema.index({ status: 1, priority: -1, createdAt: 1 });
SupportTicketSchema.index({ category: 1, createdAt: -1 });
// SupportTicketSchema.index({ ticketNumber: 1 });

// Pre-save middleware to generate ticket number
// SupportTicketSchema.pre("save", async function (next) {
//   if (this.isNew && !this.ticketNumber) {
//     const Model = this.constructor as any;
//     const count = await Model.countDocuments();
//     const today = new Date();
//     const dateStr = today.toISOString().slice(0, 10).replace(/-/g, "");
//     this.ticketNumber = `TKT-${dateStr}-${String(count + 1).padStart(6, "0")}`;
//   }

//   // Update resolvedAt timestamp when status changes to resolved
//   if (this.isModified("status")) {
//     if (this.status === TicketStatus.RESOLVED && !this.resolvedAt) {
//       this.resolvedAt = new Date();
//     }
//   }

//   next();
// });

export default model<ISupportTicket>("SupportTicket", SupportTicketSchema);
