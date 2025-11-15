import { z, ZodSchema } from "zod";
import { DeviceType, UserRole } from "../../models";

export const createDriverSchema: ZodSchema<{
    firstName: string;
    secondName: string;
    lastName: string;
    driverLicenseId: string;
    email: string;
    password: string;
  }> = z.object({
    firstName: z.string().max(255),
    secondName: z.string().max(255),
    lastName: z.string().max(255),
    driverLicenseId: z.string().max(255),
    email: z.string(),
    password: z
      .string()
      .min(8, "Password must be at least 8 characters long")
      .max(100)
  });

export const updateDriverSchema: ZodSchema<{
    firstName?: string;
    secondName?: string;
    lastName?: string;
    driverLicenceId?: string;
    email?: string;
    password?: string;
  }> = z.object({
    firstName: z.string().max(255).optional(),
    secondName: z.string().max(255).optional(),
    lastName: z.string().max(255).optional(),
    driverLicenceId: z.string().max(255).optional(),
    email: z.string().optional(),
    password: z.string().min(8, "Password must be at least 8 characters long").max(100).optional(),
  });

// Start trip schema
export const startTripSchema: ZodSchema<{
  tripId: string;
  driverId: string;
}> = z.object({
  tripId: z.string()
    .regex(/^[0-9a-fA-F]{24}$/, "Trip ID must be a valid MongoDB ObjectId")
    .min(1, "Trip ID is required"),
  
  driverId: z.string()
    .regex(/^[0-9a-fA-F]{24}$/, "Driver ID must be a valid MongoDB ObjectId")
    .min(1, "Driver ID is required")
});

// End trip schema
export const endTripSchema: ZodSchema<{
  tripId: string;
  actualArrivalTime?: string;
}> = z.object({
  tripId: z.string()
    .regex(/^[0-9a-fA-F]{24}$/, "Trip ID must be a valid MongoDB ObjectId")
    .min(1, "Trip ID is required"),
  
  actualArrivalTime: z.string()
    .datetime("Invalid date format")
    .optional()
});