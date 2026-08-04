"use server";

import { db } from "@/core/database/db";
import { organizations, organizationMembers } from "@/core/database/schema";
import { supabaseAdmin } from "@/core/database/admin";
import { and, eq, sql, desc } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requirePlatformAdmin } from "@/core/auth/server/actor";
import { ORGANIZATION_ROLES } from "@/core/auth/domain/roles";
import { z } from "zod";

const uuidSchema = z.string().uuid();
const roleSchema = z.enum(ORGANIZATION_ROLES);
const emailSchema = z.string().trim().email().max(320);
const organizationNameSchema = z.string().trim().min(2).max(120);

// -------------------------------------------------------------
// ORGANIZACIONES
// -------------------------------------------------------------
export async function getAllOrganizations() {
  await requirePlatformAdmin();

  // Obtenemos todas las organizaciones con conteo de miembros
  const orgs = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      createdAt: organizations.createdAt,
      membersCount: sql<number>`count(${organizationMembers.id})`,
    })
    .from(organizations)
    .leftJoin(organizationMembers, eq(organizations.id, organizationMembers.organizationId))
    .groupBy(organizations.id)
    .orderBy(desc(organizations.createdAt));

  return orgs;
}

export async function createOrganization(name: string) {
  await requirePlatformAdmin();
  const validName = organizationNameSchema.parse(name);
  const [newOrg] = await db.insert(organizations).values({ name: validName }).returning({
    id: organizations.id,
    name: organizations.name,
  });
  revalidatePath("/superadmin/organizations");
  return newOrg;
}

// -------------------------------------------------------------
// USUARIOS GLOBALES (Supabase Auth)
// -------------------------------------------------------------
export async function getAllGlobalUsers() {
  await requirePlatformAdmin();
  const {
    data: { users },
    error,
  } = await supabaseAdmin.auth.admin.listUsers();
  if (error) throw error;
  return users.map((user) => ({
    id: user.id,
    email: user.email ?? null,
    created_at: user.created_at,
    last_sign_in_at: user.last_sign_in_at ?? null,
    banned_until: user.banned_until ?? null,
  }));
}

export async function deleteGlobalUser(userId: string) {
  await requirePlatformAdmin();
  const validUserId = uuidSchema.parse(userId);

  await db.delete(organizationMembers).where(eq(organizationMembers.userId, validUserId));
  const { error } = await supabaseAdmin.auth.admin.deleteUser(validUserId);
  if (error) throw error;

  revalidatePath("/superadmin/users");
  return true;
}

export async function getGlobalUser(userId: string) {
  await requirePlatformAdmin();
  const validUserId = uuidSchema.parse(userId);
  const {
    data: { user },
    error,
  } = await supabaseAdmin.auth.admin.getUserById(validUserId);
  if (error) throw error;
  if (!user) throw new Error("Usuario no encontrado");
  return {
    id: user.id,
    email: user.email ?? "",
    banned_until: user.banned_until ?? null,
  };
}

export async function updateGlobalUser(
  userId: string,
  updates: { email?: string; password?: string; ban_duration?: string },
) {
  await requirePlatformAdmin();
  const validUserId = uuidSchema.parse(userId);

  const payload: Parameters<typeof supabaseAdmin.auth.admin.updateUserById>[1] = {};
  if (updates.email) payload.email = emailSchema.parse(updates.email);
  if (updates.password) payload.password = z.string().min(12).max(128).parse(updates.password);
  if (updates.ban_duration !== undefined) payload.ban_duration = updates.ban_duration; // 'none' para desbanear, o '1000h' para banear

  const { error } = await supabaseAdmin.auth.admin.updateUserById(validUserId, payload);
  if (error) throw error;

  revalidatePath(`/superadmin/users/${userId}`);
  revalidatePath("/superadmin/users");
  return true;
}

// -------------------------------------------------------------
// MIEMBROS DE UNA ORGANIZACIÓN
// -------------------------------------------------------------
export async function getOrganizationMembers(organizationId: string) {
  await requirePlatformAdmin();
  const validOrganizationId = uuidSchema.parse(organizationId);
  const members = await db
    .select()
    .from(organizationMembers)
    .where(eq(organizationMembers.organizationId, validOrganizationId));

  // Para enriquecer con emails, traemos los usuarios de Supabase
  const globalUsers = await getAllGlobalUsers();

  return members.map((m) => {
    const user = globalUsers.find((u) => u.id === m.userId);
    return {
      ...m,
      email: user?.email || "Desconocido",
      lastSignIn: user?.last_sign_in_at,
    };
  });
}

export async function addMemberToOrganization(organizationId: string, email: string, role: string) {
  await requirePlatformAdmin();
  const validOrganizationId = uuidSchema.parse(organizationId);
  const validEmail = emailSchema.parse(email);
  const validRole = roleSchema.parse(role);

  // 1. Encontrar el user_id de ese email en Supabase
  const globalUsers = await getAllGlobalUsers();
  const user = globalUsers.find((u) => u.email?.toLowerCase() === validEmail.toLowerCase());

  if (!user) {
    throw new Error("El usuario no existe. Debe registrarse primero.");
  }

  // 2. Verificar si ya es miembro
  const existing = await db
    .select()
    .from(organizationMembers)
    .where(
      sql`${organizationMembers.organizationId} = ${validOrganizationId} AND ${organizationMembers.userId} = ${user.id}`,
    );

  if (existing.length > 0) {
    throw new Error("El usuario ya es miembro de esta organización.");
  }

  await db.insert(organizationMembers).values({
    organizationId: validOrganizationId,
    userId: user.id,
    role: validRole,
  });

  revalidatePath(`/superadmin/organizations/${organizationId}`);
  return true;
}

export async function updateMemberRole(memberId: string, newRole: string) {
  await requirePlatformAdmin();
  await db
    .update(organizationMembers)
    .set({ role: roleSchema.parse(newRole) })
    .where(eq(organizationMembers.id, uuidSchema.parse(memberId)));
  revalidatePath("/superadmin/organizations"); // simplificado
  return true;
}

export async function removeMember(memberId: string) {
  await requirePlatformAdmin();
  await db
    .delete(organizationMembers)
    .where(eq(organizationMembers.id, uuidSchema.parse(memberId)));
  revalidatePath("/superadmin/organizations");
  return true;
}

// -------------------------------------------------------------
// INVITACIONES
// -------------------------------------------------------------
import { sendInvitationEmail } from "@/core/services/email";
import { invitations } from "@/core/database/schema";

export async function sendInvitation(organizationId: string, email: string, role: string) {
  await requirePlatformAdmin();
  const validOrganizationId = uuidSchema.parse(organizationId);
  const validEmail = emailSchema.parse(email);
  const validRole = roleSchema.parse(role);

  // 1. Obtener nombre de la organización
  const [org] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, validOrganizationId));
  if (!org) throw new Error("Organización no encontrada");

  // 2. Crear la invitación en la base de datos
  const [invitation] = await db
    .insert(invitations)
    .values({
      organizationId: validOrganizationId,
      email: validEmail,
      role: validRole,
    })
    .returning();

  // 3. Enviar el correo
  const res = await sendInvitationEmail(validEmail, org.name, validRole, invitation.token);

  if (!res.success) {
    // Si falla el correo, borramos la invitación para que se intente de nuevo
    await db.delete(invitations).where(eq(invitations.id, invitation.id));
    throw new Error("No se pudo enviar el correo de invitación");
  }

  revalidatePath(`/superadmin/organizations/${organizationId}`);
  return true;
}

export async function getPendingInvitations(organizationId: string) {
  await requirePlatformAdmin();
  const validOrganizationId = uuidSchema.parse(organizationId);
  return db
    .select()
    .from(invitations)
    .where(
      sql`${invitations.organizationId} = ${validOrganizationId} AND ${invitations.status} = 'PENDING'`,
    );
}

export async function cancelInvitation(invitationId: string, organizationId: string) {
  await requirePlatformAdmin();
  const validInvitationId = uuidSchema.parse(invitationId);
  const validOrganizationId = uuidSchema.parse(organizationId);
  await db
    .delete(invitations)
    .where(
      and(
        eq(invitations.id, validInvitationId),
        eq(invitations.organizationId, validOrganizationId),
      ),
    );
  revalidatePath(`/superadmin/organizations/${organizationId}`);
  return true;
}
