import { z } from "zod";

export const appointmentStatusSchema = z.enum(["PENDING", "CONFIRMED", "COMPLETED", "CANCELLED"]);

export const appointmentInputSchema = z
  .object({
    clientId: z.string().uuid(),
    staffId: z.string().uuid(),
    serviceId: z.string().uuid(),
    startTime: z.coerce.date(),
    endTime: z.coerce.date(),
    status: appointmentStatusSchema.default("PENDING"),
    notes: z.string().trim().max(1000).nullable(),
  })
  .refine((value) => value.endTime > value.startTime, {
    message: "La hora de finalización debe ser posterior al inicio",
  });

export const resourceIdSchema = z.string().uuid();
