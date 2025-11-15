import { z, ZodSchema } from "zod";
import { DaysEnums } from "../../models/common/types";

export const createRouteSchema: ZodSchema<{
  name: string;
  origin: string;
  destination: string;
  bus: string;
  dayTime: Array<{
    day: string;
    time: string;
  }>;
  intermediateStops?: string[];
  isActive?: boolean;
}> = z.object({
  name: z.string()
    .min(1, "Route name is required")
    .max(255, "Route name must be less than 255 characters"),
  
  origin: z.string()
    .regex(/^[0-9a-fA-F]{24}$/, "Origin must be a valid MongoDB ObjectId"),
  
  destination: z.string()
    .regex(/^[0-9a-fA-F]{24}$/, "Destination must be a valid MongoDB ObjectId"),
  
  bus: z.string()
    .regex(/^[0-9a-fA-F]{24}$/, "Bus must be a valid MongoDB ObjectId"),
  
  dayTime: z.array(
    z.object({
      day: z.enum([
        DaysEnums.MONDAY,
        DaysEnums.TUESDAY,
        DaysEnums.WEDNESDAY,
        DaysEnums.THURSDAY,
        DaysEnums.FRIDAY,
        DaysEnums.SATURDAY,
        DaysEnums.SUNDAY
      ], {
        errorMap: () => ({ message: "Day must be a valid day of the week" })
      }),
      time: z.string()
        .datetime("Time must be a valid ISO datetime string")
        .or(z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, "Time must be in HH:MM format")),
    })
  ).min(1, "At least one day-time entry is required")
   .max(7, "Maximum 7 day-time entries allowed"),
  
  intermediateStops: z.array(
    z.string()
      .regex(/^[0-9a-fA-F]{24}$/, "Each intermediate stop must be a valid MongoDB ObjectId")
  ).optional(),
  
  isActive: z.boolean().optional()
});

export const updateRouteSchema: ZodSchema<{
  name?: string;
  origin?: string;
  destination?: string;
  bus?: string;
  isActive?: boolean;
  dayTime?: Array<{
    day: string;
    time?: string;
  }>; 

}> = z.object({
  name: z.string()
    .max(255, "Name must be less than 255 characters")
    .optional(),
  origin: z.string()
    .regex(/^[0-9a-fA-F]{24}$/, "Origin must be a valid MongoDB ObjectId")
    .optional(),
  destination: z.string()
    .regex(/^[0-9a-fA-F]{24}$/, "Destination must be a valid MongoDB ObjectId")
    .optional(),
  bus: z.string()
    .regex(/^[0-9a-fA-F]{24}$/, "Bus must be a valid MongoDB ObjectId")
    .optional(),
  dayTime: z.array(
    z.object({
      day: z.enum([
        DaysEnums.MONDAY,
        DaysEnums.TUESDAY,
        DaysEnums.WEDNESDAY,
        DaysEnums.THURSDAY,
        DaysEnums.FRIDAY,
        DaysEnums.SATURDAY,
        DaysEnums.SUNDAY
      ], {
        errorMap: () => ({ message: "Day must be a valid day of the week" })
      }),
      time: z.string()
        .datetime("Time must be a valid ISO datetime string")
        .or(z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, "Time must be in HH:MM format"))
        .optional(),
    })
  ).optional(),
  isActive: z.boolean().optional()

});