import { z, ZodSchema } from "zod";

export const updateCurrencySchema: ZodSchema<{
  USD: number;
  MXN: number;
}> = z.object({
  USD: z.number(),
  MXN: z.number(),
});