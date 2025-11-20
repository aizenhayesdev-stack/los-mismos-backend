import { z, ZodSchema } from "zod";
import { Gender, TripType } from "../../models/common/types";

// Passenger schema for nested validation
const passengerSchema = z.object({
  seatLabel: z.string()
    .min(1, "Seat label is required"),
    
  fullName: z.string()
    .min(1, "Full name is required")
    .max(255, "Full name must be less than 255 characters"),
  
  gender: z.enum(["male", "female", "other", "prefer_not_say"], {
    errorMap: () => ({ message: "Gender must be male, female, other, or prefer_not_say" })
  }),
  
  dob: z.string()
    .min(1, "Date of birth is required")
    .or(z.coerce.date())
    .optional(),
  
  contactNumber: z.string()
    .min(1, "Contact number is required")
    .max(20, "Contact number must be less than 20 characters"),
  
  DocumentId: z.string()
    .min(1, "Document ID is required")
    .max(100, "Document ID must be less than 100 characters")
    .optional(),
});

// Book seats schema (for both cash and Stripe payment intent creation)
export const bookSeatsSchema: ZodSchema<{
  routeId: string;
  busId: string;
  paymentType: string;
  tripType: string;
  additionalBaggage?: string;
  roundTripDate?: string;
  passengers: Array<{
    seatLabel: string;
    fullName: string;
    gender: string;
    dob?: string | Date | null;
    contactNumber: string;
    DocumentId?: string | null;
  }>;
}> = z.object({
  routeId: z.string()
    .regex(/^[0-9a-fA-F]{24}$/, "Route ID must be a valid MongoDB ObjectId"),
  
  busId: z.string()
    .regex(/^[0-9a-fA-F]{24}$/, "Bus ID must be a valid MongoDB ObjectId"),
  
  paymentType: z.enum(["cash", "stripe","points"], {
    errorMap: () => ({ message: "Payment type must be either 'cash' or 'stripe' or 'points'" })
  }),
  tripType: z.enum([TripType.ONE_WAY, TripType.ROUND_TRIP], {
    errorMap: () => ({ message: "Trip type must be either 'one_way' or 'round_trip'" })
  }),
  roundTripDate: z.string()
    .optional(),
  additionalBaggage: z.string()
    .optional(),
  passengers: z.array(passengerSchema)
    .min(1, "At least one passenger is required")
    .max(10, "Maximum 10 passengers allowed per booking")
});

// Confirm Stripe payment schema
export const confirmStripePaymentSchema: ZodSchema<{
  paymentIntentId: string;
}> = z.object({
  paymentIntentId: z.string()
    .min(1, "Payment Intent ID is required")
    .startsWith("pi_", "Payment Intent ID must start with 'pi_'")
    .max(255, "Payment Intent ID must be less than 255 characters")
});


// Cancel booking schema
export const cancelBookingSchema: ZodSchema<{
  ticketNumber: string;
  type: "All" | "Single"
  reason?: string;
}> = z.object({
  ticketNumber: z.string()
    .min(1, "Ticket number is required")
    .max(100, "Ticket number must be less than 100 characters"),
  
    type:  z.enum(["All", "Single"], {
      errorMap: () => ({ message: "type must be All or Single" })
    }),
  reason: z.string()
    .max(500, "Reason must be less than 500 characters")
    .optional()
});

// Optional: Schema for validating individual passenger (if needed separately)
export const singlePassengerSchema = passengerSchema;
