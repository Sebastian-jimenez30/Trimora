"use server";

import { db } from "@/core/database/db";
import { organizationMembers, invitations, organizations } from "@/core/database/schema";
import { requireActor } from "@/core/auth/server/actor";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { sendInvitationEmail } from "@/core/services/email";
import { ORGANIZATION_ROLES } from "@/core/auth/domain/roles";
import { z } from "zod";
import { getErrorMessage } from "@/core/errors";

const emailSchema = z.string().trim().email().max(320);
const roleSchema = z.enum(ORGANIZATION_ROLES);
const uuidSchema = z.string().uuid();

export async function inviteCollaborator(formData: FormData) {
  try {
    const { organizationId } = await requireActor({ roles: ["ADMIN"] });

    const email = emailSchema.parse(formData.get("email"));
    const role = roleSchema.parse(formData.get("role"));

    // Verificar si ya existe en la org
    // Como no podemos consultar emails en auth.users fácilmente, confiamos en las invitaciones previas
    const existingInvite = await db
      .select()
      .from(invitations)
      .where(
        and(
          eq(invitations.organizationId, organizationId),
          eq(invitations.email, email),
          eq(invitations.status, "PENDING"),
        ),
      );

    if (existingInvite.length > 0) {
      throw new Error("Ya existe una invitación pendiente para este correo");
    }

    const [invitation] = await db
      .insert(invitations)
      .values({
        organizationId,
        email,
        role,
        status: "PENDING",
      })
      .returning();

    const [org] = await db.select().from(organizations).where(eq(organizations.id, organizationId));
    const orgName = org?.name || "Nuestra Organización";

    // Enviar correo de invitación usando SendGrid
    await sendInvitationEmail(email, orgName, role, invitation.token);

    revalidatePath("/equipo");
    return { success: true };
  } catch (error: unknown) {
    return { success: false, error: getErrorMessage(error) };
  }
}

export async function removeCollaborator(formData: FormData) {
  try {
    const { organizationId, userId: currentUserId } = await requireActor({ roles: ["ADMIN"] });

    const userId = uuidSchema.parse(formData.get("userId"));

    if (userId === currentUserId) {
      throw new Error("No puedes eliminarte a ti mismo");
    }

    await db
      .delete(organizationMembers)
      .where(
        and(
          eq(organizationMembers.organizationId, organizationId),
          eq(organizationMembers.userId, userId),
        ),
      );

    revalidatePath("/equipo");
    return { success: true };
  } catch (error: unknown) {
    return { success: false, error: getErrorMessage(error) };
  }
}

export async function cancelInvitation(formData: FormData) {
  try {
    const { organizationId } = await requireActor({ roles: ["ADMIN"] });

    const invitationId = uuidSchema.parse(formData.get("invitationId"));

    await db
      .delete(invitations)
      .where(and(eq(invitations.id, invitationId), eq(invitations.organizationId, organizationId)));

    revalidatePath("/equipo");
    return { success: true };
  } catch (error: unknown) {
    return { success: false, error: getErrorMessage(error) };
  }
}

export async function updateCollaboratorRole(formData: FormData) {
  try {
    const { organizationId, userId: currentUserId } = await requireActor({ roles: ["ADMIN"] });

    const userId = uuidSchema.parse(formData.get("userId"));
    const newRole = roleSchema.parse(formData.get("role"));
    if (userId === currentUserId) throw new Error("No puedes cambiar tu propio rol");

    await db
      .update(organizationMembers)
      .set({ role: newRole })
      .where(
        and(
          eq(organizationMembers.organizationId, organizationId),
          eq(organizationMembers.userId, userId),
        ),
      );

    revalidatePath("/equipo");
    return { success: true };
  } catch (error: unknown) {
    return { success: false, error: getErrorMessage(error) };
  }
}
