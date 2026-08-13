import { z } from "zod";

export const paymentMethodSchema = z.enum(["CASH", "CARD", "TRANSFER", "CREDIT"]);
export const settledPaymentMethodSchema = z.enum(["CASH", "CARD", "TRANSFER"]);
export const optionalClientIdSchema = z.string().uuid().nullable();
export const resourceIdSchema = z.string().uuid();
export const moneySchema = z.number().finite().positive().max(99_999_999.99);
export const nonNegativeMoneySchema = z.number().finite().nonnegative().max(99_999_999.99);
export const descriptionSchema = z.string().trim().min(1).max(500);
export const transactionUpdateSchema = z.object({
  transactionId: resourceIdSchema,
  totalAmount: moneySchema,
  paymentMethod: paymentMethodSchema,
  clientId: optionalClientIdSchema,
  description: z.string().trim().max(500),
});
export const reportRangeSchema = z
  .object({
    start: z.coerce.date(),
    end: z.coerce.date(),
  })
  .refine(({ start, end }) => end >= start, "El rango de fechas no es válido");

export const cartSchema = z
  .array(
    z.object({
      id: z.string().uuid(),
      type: z.enum(["PRODUCT", "SERVICE"]),
      quantity: z.number().finite().positive().max(10_000),
      staffId: z.string().uuid().optional(),
    }),
  )
  .min(1)
  .max(200);
