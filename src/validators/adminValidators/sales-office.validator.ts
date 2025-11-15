import { z, ZodSchema } from "zod";

export const createSalesOfficeSchema: ZodSchema<{
  name: string;
  description?: string;
}> = z.object({
  name: z.string()
    .min(1, "Name is required")
    .max(50, "Name must be less than 50 characters"),
  
  description: z.string()
    .max(500, "Description must be less than 500 characters")
    .optional(),
  
});

export const updateSalesOfficeSchema: ZodSchema<{
  name?: string;
  description?: string;
}> = z.object({
  name: z.string()
    .max(50, "Name must be less than 50 characters")
    .optional(),
  description: z.string()
    .max(500, "Description must be less than 500 characters")
    .optional(),
});