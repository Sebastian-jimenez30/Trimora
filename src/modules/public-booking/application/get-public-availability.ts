import { calculateAvailability } from "../domain/availability";
import type { PublicAvailabilityReader } from "../domain/availability-source";
import { publicAvailabilityQuerySchema, publicOrganizationSlugSchema } from "../domain/schemas";
import type { PublicAvailabilityDto } from "../interface/dto";

export async function getPublicAvailability(
  reader: PublicAvailabilityReader,
  rawSlug: string,
  rawQuery: unknown,
  now = new Date(),
): Promise<PublicAvailabilityDto | null> {
  const slug = publicOrganizationSlugSchema.safeParse(rawSlug);
  const query = publicAvailabilityQuerySchema.safeParse(rawQuery);
  if (!slug.success || !query.success) return null;

  const source = await reader.findAvailabilitySource({
    slug: slug.data,
    serviceId: query.data.serviceId,
    date: query.data.date,
  });
  if (!source) return null;

  const slots = calculateAvailability({
    date: query.data.date,
    timeZone: source.timeZone,
    durationMinutes: source.service.durationMinutes,
    policy: source.policy,
    professionals: source.professionals,
    windows: source.windows,
    blocks: source.blocks,
    appointments: source.appointments,
    now,
  });

  return Object.freeze({
    date: query.data.date,
    timeZone: source.timeZone,
    service: Object.freeze({ ...source.service }),
    slots: Object.freeze(
      slots.map((slot) =>
        Object.freeze({
          startsAt: slot.startsAt.toISOString(),
          endsAt: slot.endsAt.toISOString(),
          availableStaffCount: slot.staffIds.length,
        }),
      ),
    ),
  });
}
