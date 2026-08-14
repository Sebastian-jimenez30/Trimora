import { z } from "zod";

export const publicOrganizationSlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u);

export const timeZoneSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .refine((timeZone) => {
    try {
      new Intl.DateTimeFormat("es-CO", { timeZone }).format();
      return true;
    } catch {
      return false;
    }
  }, "Zona horaria inválida");

export const publicAvailabilityQuerySchema = z.object({
  serviceId: z.string().uuid(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/u)
    .refine((date) => {
      const parsed = new Date(`${date}T00:00:00.000Z`);
      return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
    }, "Fecha inválida"),
});

export const bookingPolicySchema = z.object({
  timeZone: timeZoneSchema,
  minimumNoticeMinutes: z.number().int().min(0).max(43_200),
  maximumAdvanceDays: z.number().int().min(1).max(730),
  slotIntervalMinutes: z.number().int().min(5).max(240),
  bufferMinutes: z.number().int().min(0).max(240),
});

export const weeklyWindowSchema = z.object({
  dayOfWeek: z.number().int().min(1).max(7),
  startMinute: z.number().int().min(0).max(1439),
  endMinute: z.number().int().min(0).max(1439),
});

export const weeklyAvailabilityInputSchema = z.object({
  staffId: z.string().uuid().nullable(),
  windows: z.array(weeklyWindowSchema).max(28),
});

export const staffServicesInputSchema = z.object({
  staffId: z.string().uuid(),
  serviceIds: z.array(z.string().uuid()).max(100),
});

export const availabilityBlockInputSchema = z
  .object({
    staffId: z.string().uuid().nullable(),
    kind: z.enum(["CLOSED", "BREAK", "ABSENCE"]),
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime(),
    notes: z.string().trim().max(500).nullable(),
  })
  .refine((value) => new Date(value.endsAt) > new Date(value.startsAt), {
    message: "La fecha final debe ser posterior a la inicial",
    path: ["endsAt"],
  });

export const publicContactChannelSchema = z.enum(["EMAIL", "PHONE"]);

export const publicIdentityRequestSchema = z.object({
  channel: publicContactChannelSchema,
  contact: z.string().trim().min(3).max(254),
});

export const publicIdentityVerificationSchema = publicIdentityRequestSchema.extend({
  challengeId: z.string().uuid(),
  name: z.string().trim().min(2).max(120),
  token: z
    .string()
    .trim()
    .regex(/^\d{6,8}$/u),
});
