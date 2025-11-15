import { z, ZodSchema } from "zod";

// Verify ticket schema
export const verifyTicketSchema: ZodSchema<{
  ticketNumber: string;
}> = z.object({
  ticketNumber: z.string()
    .min(1, "Ticket number is required")
    .max(255, "Ticket number must be less than 255 characters")
});

// Add baggage schema
export const addBaggageSchema: ZodSchema<{
  ticketNumber: string;
  baggageAmount: number;
  method: "cash" | "stripe";
}> = z.object({
  ticketNumber: z.string()
    .min(1, "Ticket number is required")
    .max(255, "Ticket number must be less than 255 characters"),
  
    method: z.enum(["cash", "stripe"], {
      errorMap: () => ({ message: "Payment type must be either 'cash' or 'stripe'" })
    }),

  baggageAmount: z.number({
    required_error: "Baggage amount is required",
    invalid_type_error: "Baggage amount must be a number"
  })
    .positive("Baggage amount must be greater than 0")
    .max(10000, "Baggage amount cannot exceed 10000")
});

