import { z, ZodSchema } from "zod";

// Route seat report schema
export const routeSeatReportSchema: ZodSchema<{
  routeId: string;
  date: string;
}> = z.object({
  routeId: z.string()
    .regex(/^[0-9a-fA-F]{24}$/, "Route ID must be a valid MongoDB ObjectId")
    .min(1, "Route ID is required"),
  
  date: z.string()
    .min(1, "Date is required")
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format")
});

// Sales report schema
export const salesReportSchema = z.object({
  fromDate: z.string()
    .optional()
    .refine((val) => !val || /^\d{4}-\d{2}-\d{2}$/.test(val), {
      message: "From date must be in YYYY-MM-DD format"
    }),
  
  toDate: z.string()
    .optional()
    .refine((val) => !val || /^\d{4}-\d{2}-\d{2}$/.test(val), {
      message: "To date must be in YYYY-MM-DD format"
    }),
  
  salesDateType: z.enum(['sale', 'departure']).optional(),
  
  salesAgent: z.string()
    .optional()
    .refine((val) => !val || /^[0-9a-fA-F]{24}$/.test(val), {
      message: "Sales agent ID must be a valid MongoDB ObjectId"
    }),
  
  salesOffice: z.string()
    .optional()
    .refine((val) => !val || /^[0-9a-fA-F]{24}$/.test(val), {
      message: "Sales office ID must be a valid MongoDB ObjectId"
    }),
  
  format: z.enum(['excel', 'pdf']).optional(),
  
  page: z.string()
    .optional()
    .refine((val) => !val || (!isNaN(Number(val)) && Number(val) > 0), {
      message: "Page must be a positive number"
    }),
  
  limit: z.string()
    .optional()
    .refine((val) => !val || (!isNaN(Number(val)) && Number(val) > 0), {
      message: "Limit must be a positive number"
    })
});

// Drivers report schema
export const driversReportSchema = z.object({
  fromDate: z.string()
    .optional()
    .refine((val) => !val || /^\d{4}-\d{2}-\d{2}$/.test(val), {
      message: "From date must be in YYYY-MM-DD format"
    }),
  
  toDate: z.string()
    .optional()
    .refine((val) => !val || /^\d{4}-\d{2}-\d{2}$/.test(val), {
      message: "To date must be in YYYY-MM-DD format"
    }),
  
  driverId: z.string()
    .optional()
    .refine((val) => !val || /^[0-9a-fA-F]{24}$/.test(val), {
      message: "Driver ID must be a valid MongoDB ObjectId"
    }),
  
  page: z.string()
    .optional()
    .refine((val) => !val || (!isNaN(Number(val)) && Number(val) > 0), {
      message: "Page must be a positive number"
    }),
  
  limit: z.string()
    .optional()
    .refine((val) => !val || (!isNaN(Number(val)) && Number(val) > 0), {
      message: "Limit must be a positive number"
    })
});

// Export the schema for use in routes
export default routeSeatReportSchema;
