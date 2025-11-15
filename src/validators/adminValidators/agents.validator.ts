import { z, ZodSchema } from "zod";
import { UserRole } from "../../models/common/types";

// Create Agent Schema
export const createAgentSchema: ZodSchema<{
  username: string;
  firstName: string;
  secondName?: string;
  lastName?: string;
  role: UserRole;
  password: string;
  isActive?: boolean;
  salesOfficeId?: string;
}> = z.object({
  username: z.string().min(1, "Username is required"),
  
  firstName: z.string()
    .min(1, "First name is required")
    .max(50, "First name must be less than 50 characters"),

  secondName: z.string().optional(),
  
  lastName: z.string().optional(),
  
  role: z.nativeEnum(UserRole, {
    errorMap: () => ({ message: "Invalid role selected" })
  }).refine(
    (role) => [UserRole.SUPER_ADMIN, UserRole.MANAGER, UserRole.CASHIER].includes(role),
    { message: "Role must be SUPER_ADMIN, MANAGER, or CASHIER" }
  ),
  
  password: z.string()
    .min(8, "Password must be at least 8 characters"),
  isActive: z.boolean().optional().default(true),
  salesOfficeId: z.string().optional(),
});

// Update Agent Schema
export const updateAgentSchema: ZodSchema<{
  username?: string;
  firstName?: string;
  secondName?: string;
  lastName?: string;
  role?: UserRole;
  salesOfficeId?: string;
  password?: string;
  isActive?: boolean;
}> = z.object({
  username: z.string()
    .optional(),
  
  firstName: z.string()
    .min(1, "First name is required")
    .max(50, "First name must be less than 50 characters")
    .optional(),
  
  secondName: z.string().optional(),
  
  lastName: z.string()
    .optional(),
  
  role: z.nativeEnum(UserRole, {
    errorMap: () => ({ message: "Invalid role selected" })
  }).refine(
    (role) => [UserRole.SUPER_ADMIN, UserRole.MANAGER, UserRole.CASHIER].includes(role),
    { message: "Role must be SUPER_ADMIN, MANAGER, or CASHIER" }
  ).optional(),
  
  salesOfficeId: z.string().optional(),
  
  password: z.string()
    .min(8, "Password must be at least 8 characters").optional(),
  
  isActive: z.boolean().optional()
});

// Get Agents Query Schema
export const getAgentsQuerySchema = z.object({
  page: z.string().optional().default("1").transform(Number).pipe(z.number().min(1)),
  limit: z.string().optional().default("10").transform(Number).pipe(z.number().min(1).max(100)), 
  role: z.nativeEnum(UserRole).optional(),
  isActive: z.string().transform(val => val === 'true').optional(),
  search: z.string().optional()
});
