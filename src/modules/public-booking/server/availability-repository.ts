import "server-only";

import { addDays } from "date-fns";
import { fromZonedTime } from "date-fns-tz";
import { and, eq, gt, inArray, lt, or } from "drizzle-orm";
import { db } from "@/core/database/db";
import {
  appointments,
  availabilityBlocks,
  availabilityWindows,
  organizationPublicProfiles,
  publicBookingSettings,
  services,
  staffServices,
} from "@/core/database/schema";
import type {
  PublicAvailabilityReader,
  PublicAvailabilitySource,
} from "../domain/availability-source";

const DEFAULT_POLICY = Object.freeze({
  minimumNoticeMinutes: 60,
  maximumAdvanceDays: 60,
  slotIntervalMinutes: 15,
  bufferMinutes: 0,
});

export const publicAvailabilityRepository: PublicAvailabilityReader = {
  async findAvailabilitySource({
    slug,
    serviceId,
    date,
  }): Promise<PublicAvailabilitySource | null> {
    const [catalog] = await db
      .select({
        organizationId: organizationPublicProfiles.organizationId,
        timeZone: organizationPublicProfiles.timeZone,
        serviceId: services.id,
        serviceName: services.name,
        durationMinutes: services.durationMinutes,
      })
      .from(organizationPublicProfiles)
      .innerJoin(
        services,
        and(
          eq(services.organizationId, organizationPublicProfiles.organizationId),
          eq(services.id, serviceId),
          eq(services.isActive, true),
        ),
      )
      .where(
        and(
          eq(organizationPublicProfiles.slug, slug),
          eq(organizationPublicProfiles.publicProfileEnabled, true),
          or(
            eq(organizationPublicProfiles.publicCatalogEnabled, true),
            eq(organizationPublicProfiles.publicBookingEnabled, true),
          ),
        ),
      )
      .limit(1);

    if (!catalog) return null;

    const localDayStart = fromZonedTime(`${date}T00:00:00`, catalog.timeZone);
    const localDayEnd = fromZonedTime(
      `${addDays(new Date(`${date}T00:00:00Z`), 1)
        .toISOString()
        .slice(0, 10)}T00:00:00`,
      catalog.timeZone,
    );

    const [settingsRows, professionalRows, windowRows, blockRows] = await Promise.all([
      db
        .select({
          minimumNoticeMinutes: publicBookingSettings.minimumNoticeMinutes,
          maximumAdvanceDays: publicBookingSettings.maximumAdvanceDays,
          slotIntervalMinutes: publicBookingSettings.slotIntervalMinutes,
          bufferMinutes: publicBookingSettings.bufferMinutes,
        })
        .from(publicBookingSettings)
        .where(eq(publicBookingSettings.organizationId, catalog.organizationId))
        .limit(1),
      db
        .select({ id: staffServices.staffId })
        .from(staffServices)
        .where(
          and(
            eq(staffServices.organizationId, catalog.organizationId),
            eq(staffServices.serviceId, catalog.serviceId),
          ),
        ),
      db
        .select({
          staffId: availabilityWindows.staffId,
          dayOfWeek: availabilityWindows.dayOfWeek,
          startMinute: availabilityWindows.startMinute,
          endMinute: availabilityWindows.endMinute,
        })
        .from(availabilityWindows)
        .where(eq(availabilityWindows.organizationId, catalog.organizationId)),
      db
        .select({
          staffId: availabilityBlocks.staffId,
          startsAt: availabilityBlocks.startsAt,
          endsAt: availabilityBlocks.endsAt,
        })
        .from(availabilityBlocks)
        .where(
          and(
            eq(availabilityBlocks.organizationId, catalog.organizationId),
            lt(availabilityBlocks.startsAt, localDayEnd),
            gt(availabilityBlocks.endsAt, localDayStart),
          ),
        ),
    ]);

    const policy = settingsRows[0] ?? DEFAULT_POLICY;
    const appointmentRangeStart = new Date(localDayStart.getTime() - policy.bufferMinutes * 60_000);
    const professionalIds = professionalRows.map((professional) => professional.id);
    const appointmentRows =
      professionalIds.length === 0
        ? []
        : await db
            .select({
              staffId: appointments.staffId,
              startsAt: appointments.startTime,
              endsAt: appointments.endTime,
            })
            .from(appointments)
            .where(
              and(
                eq(appointments.organizationId, catalog.organizationId),
                inArray(appointments.staffId, professionalIds),
                inArray(appointments.status, ["PENDING", "CONFIRMED"]),
                lt(appointments.startTime, localDayEnd),
                gt(appointments.endTime, appointmentRangeStart),
              ),
            );

    return Object.freeze({
      timeZone: catalog.timeZone,
      service: Object.freeze({
        id: catalog.serviceId,
        name: catalog.serviceName,
        durationMinutes: catalog.durationMinutes,
      }),
      policy: Object.freeze({ ...policy }),
      professionals: Object.freeze(
        professionalRows.map((professional) => Object.freeze(professional)),
      ),
      windows: Object.freeze(windowRows.map((window) => Object.freeze(window))),
      blocks: Object.freeze(blockRows.map((block) => Object.freeze(block))),
      appointments: Object.freeze(appointmentRows.map((appointment) => Object.freeze(appointment))),
    });
  },
};
