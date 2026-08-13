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
