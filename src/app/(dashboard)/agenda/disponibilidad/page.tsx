import Link from "next/link";
import { and, asc, eq, gt } from "drizzle-orm";
import { requireActor } from "@/core/auth/server/actor";
import { supabaseAdmin } from "@/core/database/admin";
import { db } from "@/core/database/db";
import {
  availabilityBlocks,
  availabilityWindows,
  organizationMembers,
  organizationPublicProfiles,
  publicBookingSettings,
  services,
  staffServices,
} from "@/core/database/schema";
import AvailabilityManager from "./AvailabilityManager";

export default async function AvailabilityPage() {
  const actor = await requireActor({ roles: ["ADMIN"] });
  const organizationId = actor.organizationId;

  const [
    settingsRows,
    profileRows,
    members,
    serviceRows,
    windows,
    assignments,
    blocks,
    authResult,
  ] = await Promise.all([
    db
      .select()
      .from(publicBookingSettings)
      .where(eq(publicBookingSettings.organizationId, organizationId))
      .limit(1),
    db
      .select({
        timeZone: organizationPublicProfiles.timeZone,
      })
      .from(organizationPublicProfiles)
      .where(eq(organizationPublicProfiles.organizationId, organizationId))
      .limit(1),
    db
      .select({
        id: organizationMembers.id,
        userId: organizationMembers.userId,
        role: organizationMembers.role,
      })
      .from(organizationMembers)
      .where(eq(organizationMembers.organizationId, organizationId))
      .orderBy(asc(organizationMembers.createdAt)),
    db
      .select({ id: services.id, name: services.name, isActive: services.isActive })
      .from(services)
      .where(eq(services.organizationId, organizationId))
      .orderBy(asc(services.name)),
    db
      .select({
        id: availabilityWindows.id,
        staffId: availabilityWindows.staffId,
        dayOfWeek: availabilityWindows.dayOfWeek,
        startMinute: availabilityWindows.startMinute,
        endMinute: availabilityWindows.endMinute,
      })
      .from(availabilityWindows)
      .where(eq(availabilityWindows.organizationId, organizationId)),
    db
      .select({ staffId: staffServices.staffId, serviceId: staffServices.serviceId })
      .from(staffServices)
      .where(eq(staffServices.organizationId, organizationId)),
    db
      .select({
        id: availabilityBlocks.id,
        staffId: availabilityBlocks.staffId,
        kind: availabilityBlocks.kind,
        startsAt: availabilityBlocks.startsAt,
        endsAt: availabilityBlocks.endsAt,
        notes: availabilityBlocks.notes,
      })
      .from(availabilityBlocks)
      .where(
        and(
          eq(availabilityBlocks.organizationId, organizationId),
          gt(availabilityBlocks.endsAt, new Date()),
        ),
      )
      .orderBy(asc(availabilityBlocks.startsAt)),
    supabaseAdmin.auth.admin.listUsers(),
  ]);

  const authUsers = authResult.data.users;
  const staff = members.map((member) => {
    const user = authUsers.find((candidate) => candidate.id === member.userId);
    return {
      id: member.id,
      role: member.role,
      name:
        (typeof user?.user_metadata?.full_name === "string" && user.user_metadata.full_name) ||
        user?.email?.split("@")[0] ||
        `Profesional ${member.id.slice(0, 4)}`,
    };
  });

  const settings = settingsRows[0];
  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto w-full space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-3xl font-serif font-bold text-white mb-2">Disponibilidad</h1>
          <p className="text-charcoal text-sm max-w-3xl">
            Define cuándo atiende la barbería, qué servicios presta cada profesional y qué periodos
            deben permanecer bloqueados.
          </p>
        </div>
        <Link
          href="/agenda"
          className="self-start rounded-full border border-white/10 px-5 py-2 text-sm text-sterling hover:bg-white/5"
        >
          Volver a Agenda
        </Link>
      </div>

      <AvailabilityManager
        policy={{
          timeZone: profileRows[0]?.timeZone ?? "America/Bogota",
          minimumNoticeMinutes: settings?.minimumNoticeMinutes ?? 60,
          maximumAdvanceDays: settings?.maximumAdvanceDays ?? 60,
          slotIntervalMinutes: settings?.slotIntervalMinutes ?? 15,
          bufferMinutes: settings?.bufferMinutes ?? 0,
        }}
        staff={staff}
        services={serviceRows}
        windows={windows}
        assignments={assignments}
        blocks={blocks.map((block) => ({
          ...block,
          startsAt: block.startsAt.toISOString(),
          endsAt: block.endsAt.toISOString(),
        }))}
      />
    </div>
  );
}
