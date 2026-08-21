"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { requireActor } from "@/core/auth/server/actor";
import { db } from "@/core/database/db";
import {
  auditLogs,
  availabilityBlocks,
  availabilityWindows,
  organizationMembers,
  organizationPublicProfiles,
  publicBookingSettings,
  services,
  staffServices,
} from "@/core/database/schema";
import { getErrorMessage } from "@/core/errors";
import {
  availabilityBlockInputSchema,
  bookingPolicySchema,
  staffServicesInputSchema,
  weeklyAvailabilityInputSchema,
} from "../domain/schemas";

const uuidSchema = staffServicesInputSchema.shape.staffId;
const SETTINGS_PATH = "/agenda/disponibilidad";

async function ensureStaff(organizationId: string, staffId: string) {
  const [staff] = await db
    .select({ id: organizationMembers.id })
    .from(organizationMembers)
    .where(
      and(
        eq(organizationMembers.organizationId, organizationId),
        eq(organizationMembers.id, staffId),
      ),
    )
    .limit(1);
  if (!staff) throw new Error("El profesional no pertenece a la organización");
}

function availabilityAudit(
  organizationId: string,
  userId: string,
  action: string,
  entityId?: string,
) {
  return {
    organizationId,
    userId,
    action,
    entityType: "PUBLIC_AVAILABILITY",
    entityId,
  };
}

export async function saveBookingPolicy(rawInput: unknown) {
  try {
    const actor = await requireActor({ roles: ["ADMIN"] });
    const input = bookingPolicySchema.parse(rawInput);

    await db.transaction(async (tx) => {
      await tx
        .insert(publicBookingSettings)
        .values({
          organizationId: actor.organizationId,
          minimumNoticeMinutes: input.minimumNoticeMinutes,
          maximumAdvanceDays: input.maximumAdvanceDays,
          slotIntervalMinutes: input.slotIntervalMinutes,
          bufferMinutes: input.bufferMinutes,
        })
        .onConflictDoUpdate({
          target: publicBookingSettings.organizationId,
          set: {
            minimumNoticeMinutes: input.minimumNoticeMinutes,
            maximumAdvanceDays: input.maximumAdvanceDays,
            slotIntervalMinutes: input.slotIntervalMinutes,
            bufferMinutes: input.bufferMinutes,
          },
        });
      await tx
        .update(organizationPublicProfiles)
        .set({ timeZone: input.timeZone })
        .where(eq(organizationPublicProfiles.organizationId, actor.organizationId));
      await tx
        .insert(auditLogs)
        .values(availabilityAudit(actor.organizationId, actor.userId, "UPDATE_POLICY"));
    });

    revalidatePath(SETTINGS_PATH);
    return { success: true } as const;
  } catch (error: unknown) {
    return { success: false, error: getErrorMessage(error) } as const;
  }
}

export async function setCustomerIdentityPilotEnabled(rawEnabled: unknown) {
  try {
    const actor = await requireActor({ roles: ["ADMIN"] });
    if (typeof rawEnabled !== "boolean") throw new Error("Estado de activación inválido");

    await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(organizationPublicProfiles)
        .set(
          rawEnabled
            ? { publicProfileEnabled: true, publicIdentityEnabled: true }
            : { publicIdentityEnabled: false },
        )
        .where(eq(organizationPublicProfiles.organizationId, actor.organizationId))
        .returning({ id: organizationPublicProfiles.organizationId });
      if (!updated) throw new Error("No existe el perfil público de la organización");
      await tx
        .insert(auditLogs)
        .values(
          availabilityAudit(
            actor.organizationId,
            actor.userId,
            rawEnabled ? "ENABLE_CUSTOMER_IDENTITY_PILOT" : "DISABLE_CUSTOMER_IDENTITY_PILOT",
          ),
        );
    });

    revalidatePath(SETTINGS_PATH);
    return { success: true } as const;
  } catch (error: unknown) {
    return { success: false, error: getErrorMessage(error) } as const;
  }
}

export async function replaceWeeklyAvailability(rawInput: unknown) {
  try {
    const actor = await requireActor({ roles: ["ADMIN"] });
    const input = weeklyAvailabilityInputSchema.parse(rawInput);
    if (input.staffId) await ensureStaff(actor.organizationId, input.staffId);

    await db.transaction(async (tx) => {
      const scope = input.staffId
        ? and(
            eq(availabilityWindows.organizationId, actor.organizationId),
            eq(availabilityWindows.staffId, input.staffId),
          )
        : and(
            eq(availabilityWindows.organizationId, actor.organizationId),
            isNull(availabilityWindows.staffId),
          );
      await tx.delete(availabilityWindows).where(scope);
      if (input.windows.length > 0) {
        await tx.insert(availabilityWindows).values(
          input.windows.map((window) => ({
            organizationId: actor.organizationId,
            staffId: input.staffId,
            ...window,
          })),
        );
      }
      await tx
        .insert(auditLogs)
        .values(
          availabilityAudit(
            actor.organizationId,
            actor.userId,
            input.staffId ? "UPDATE_STAFF_SCHEDULE" : "UPDATE_ORGANIZATION_SCHEDULE",
            input.staffId ?? undefined,
          ),
        );
    });

    revalidatePath(SETTINGS_PATH);
    return { success: true } as const;
  } catch (error: unknown) {
    return { success: false, error: getErrorMessage(error) } as const;
  }
}

export async function replaceStaffServices(rawInput: unknown) {
  try {
    const actor = await requireActor({ roles: ["ADMIN"] });
    const input = staffServicesInputSchema.parse(rawInput);
    await ensureStaff(actor.organizationId, input.staffId);

    const uniqueServiceIds = [...new Set(input.serviceIds)];
    if (uniqueServiceIds.length > 0) {
      const ownedServices = await db
        .select({ id: services.id })
        .from(services)
        .where(
          and(
            eq(services.organizationId, actor.organizationId),
            inArray(services.id, uniqueServiceIds),
          ),
        );
      if (ownedServices.length !== uniqueServiceIds.length) {
        throw new Error("Uno o más servicios no pertenecen a la organización");
      }
    }

    await db.transaction(async (tx) => {
      await tx
        .delete(staffServices)
        .where(
          and(
            eq(staffServices.organizationId, actor.organizationId),
            eq(staffServices.staffId, input.staffId),
          ),
        );
      if (uniqueServiceIds.length > 0) {
        await tx.insert(staffServices).values(
          uniqueServiceIds.map((serviceId) => ({
            organizationId: actor.organizationId,
            staffId: input.staffId,
            serviceId,
          })),
        );
      }
      await tx
        .insert(auditLogs)
        .values(
          availabilityAudit(
            actor.organizationId,
            actor.userId,
            "UPDATE_STAFF_SERVICES",
            input.staffId,
          ),
        );
    });

    revalidatePath(SETTINGS_PATH);
    return { success: true } as const;
  } catch (error: unknown) {
    return { success: false, error: getErrorMessage(error) } as const;
  }
}

export async function createAvailabilityBlock(rawInput: unknown) {
  try {
    const actor = await requireActor({ roles: ["ADMIN"] });
    const input = availabilityBlockInputSchema.parse(rawInput);
    if (input.staffId) await ensureStaff(actor.organizationId, input.staffId);

    await db.transaction(async (tx) => {
      const [block] = await tx
        .insert(availabilityBlocks)
        .values({
          organizationId: actor.organizationId,
          staffId: input.staffId,
          kind: input.kind,
          startsAt: new Date(input.startsAt),
          endsAt: new Date(input.endsAt),
          notes: input.notes || null,
        })
        .returning({ id: availabilityBlocks.id });
      await tx
        .insert(auditLogs)
        .values(
          availabilityAudit(
            actor.organizationId,
            actor.userId,
            "CREATE_AVAILABILITY_BLOCK",
            block.id,
          ),
        );
    });

    revalidatePath(SETTINGS_PATH);
    return { success: true } as const;
  } catch (error: unknown) {
    return { success: false, error: getErrorMessage(error) } as const;
  }
}

export async function deleteAvailabilityBlock(rawId: unknown) {
  try {
    const actor = await requireActor({ roles: ["ADMIN"] });
    const id = uuidSchema.parse(rawId);
    await db.transaction(async (tx) => {
      const [deleted] = await tx
        .delete(availabilityBlocks)
        .where(
          and(
            eq(availabilityBlocks.organizationId, actor.organizationId),
            eq(availabilityBlocks.id, id),
          ),
        )
        .returning({ id: availabilityBlocks.id });
      if (!deleted) throw new Error("El bloqueo no existe");
      await tx
        .insert(auditLogs)
        .values(
          availabilityAudit(
            actor.organizationId,
            actor.userId,
            "DELETE_AVAILABILITY_BLOCK",
            deleted.id,
          ),
        );
    });

    revalidatePath(SETTINGS_PATH);
    return { success: true } as const;
  } catch (error: unknown) {
    return { success: false, error: getErrorMessage(error) } as const;
  }
}
