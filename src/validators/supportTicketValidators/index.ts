import { z, ZodSchema } from "zod";
import { TicketStatus, TicketPriority, TicketCategory } from "../../models/support-ticket.model";

// Create ticket schema
export const createTicketSchema: ZodSchema<{
  subject: string;
  description: string;
  category: string;
  priority?: string;
}> = z.object({
  subject: z.string()
    .min(1, "Subject is required")
    .max(200, "Subject must be less than 200 characters"),
  
  description: z.string()
    .min(1, "Description is required")
    .max(5000, "Description must be less than 5000 characters"),
  
  category: z.enum([
    TicketCategory.BOOKING_ISSUE,
    TicketCategory.PAYMENT_PROBLEM,
    TicketCategory.SCHEDULE_INQUIRY,
    TicketCategory.REFUND_REQUEST,
    TicketCategory.TECHNICAL_ISSUE,
    TicketCategory.COMPLAINT,
    TicketCategory.SUGGESTION,
    TicketCategory.ACCOUNT_ISSUE,
    TicketCategory.OTHER,
  ], {
    errorMap: () => ({ message: "Invalid category" })
  }),
  
  priority: z.enum([
    TicketPriority.LOW,
    TicketPriority.MEDIUM,
    TicketPriority.HIGH,
    TicketPriority.URGENT,
  ], {
    errorMap: () => ({ message: "Invalid priority" })
  }).optional(),
});

// Add comment schema
export const addCommentSchema: ZodSchema<{
  content: string;
}> = z.object({
  content: z.string()
    .min(1, "Comment content is required")
    .max(2000, "Comment must be less than 2000 characters"),
});

// Update ticket status schema
export const updateTicketStatusSchema: ZodSchema<{
  status: string;
}> = z.object({
  status: z.enum([
    TicketStatus.OPEN,
    TicketStatus.IN_PROGRESS,
    TicketStatus.RESOLVED,
    TicketStatus.CLOSED,
  ], {
    errorMap: () => ({ message: "Invalid status" })
  }),
});

// Assign ticket schema
export const assignTicketSchema: ZodSchema<{
  assignedTo: string;
}> = z.object({
  assignedTo: z.string()
    .regex(/^[0-9a-fA-F]{24}$/, "Assigned user ID must be a valid MongoDB ObjectId"),
});

