import { z, ZodSchema } from "zod";
import { DaysEnums } from "../../models/common/types";

export const createBusSchema: ZodSchema<{
  code: string;
  capacity: number;
  description?: string;
  serialNumber: string;
  isActive?: boolean;
  driverId?: string;
  mxdriverId?: string;
  departureTime?: string;
  departureDays?: string[];
}> = z.object({
  code: z.string()
    .min(1, "Bus code is required")
    .max(50, "Bus code must be less than 50 characters")
    .regex(/^[A-Z0-9_-]+$/, "Bus code must contain only uppercase letters, numbers, underscores, and hyphens"),
  
  description: z.string()
    .max(500, "Description must be less than 500 characters")
    .optional(),
  
  serialNumber: z.string()
    .min(1, "Serial number is required")
    .max(100, "Serial number must be less than 100 characters"),
  
  capacity: z.number()
    .int("Capacity must be an integer")
    .positive("Capacity must be a positive number"),

  isActive: z.boolean().optional(),
  
  driverId: z.string()
    .regex(/^[0-9a-fA-F]{24}$/, "Driver ID must be a valid MongoDB ObjectId")
    .optional(),
  mxdriverId: z.string()
    .regex(/^[0-9a-fA-F]{24}$/, "MX Driver ID must be a valid MongoDB ObjectId")
    .optional(),
  
  departureTime: z.string()
    .datetime("Departure time must be a valid ISO datetime string")
    .optional(),
  
  departureDays: z.array(
    z.enum([
      DaysEnums.MONDAY,
      DaysEnums.TUESDAY,
      DaysEnums.WEDNESDAY,
      DaysEnums.THURSDAY,
      DaysEnums.FRIDAY,
      DaysEnums.SATURDAY,
      DaysEnums.SUNDAY
    ])
  ).optional()
});

export const updateBusSchema: ZodSchema<{
  description?: string;
  code?: string;
  serialNumber?: string;
  capacity?: number;
  isActive?: boolean;
  driverId?: string;
  mxdriverId?: string;
  departureTime?: string;
  departureDays?: string[];
}> = z.object({
  description: z.string()
    .max(500, "Description must be less than 500 characters")
    .optional(),
  code: z.string()
    .min(1, "Bus code is required")
    .optional(),
  serialNumber: z.string()
    .min(1, "Serial number is required")
    .max(100, "Serial number must be less than 100 characters")
    .optional(),
  capacity: z.number()
    .int("Capacity must be an integer")
    .positive("Capacity must be a positive number")
    .optional(),
  isActive: z.boolean().optional(),
  driverId: z.string()
    .regex(/^[0-9a-fA-F]{24}$/, "Driver ID must be a valid MongoDB ObjectId")
    .optional(),
  mxdriverId: z.string()
    .regex(/^[0-9a-fA-F]{24}$/, "MX Driver ID must be a valid MongoDB ObjectId")
    .optional(),
  departureTime: z.string()
    .datetime("Departure time must be a valid ISO datetime string")
    .optional(),
  departureDays: z.array(
    z.enum([
      DaysEnums.MONDAY,
      DaysEnums.TUESDAY,
      DaysEnums.WEDNESDAY,
      DaysEnums.THURSDAY,
      DaysEnums.FRIDAY,
      DaysEnums.SATURDAY,
      DaysEnums.SUNDAY
    ])
  ).optional()
});