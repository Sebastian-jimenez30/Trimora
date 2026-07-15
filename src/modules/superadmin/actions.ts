'use server';

import { db } from '@/core/database/db';
import { organizations, organizationMembers } from '@/core/database/schema';
import { supabaseAdmin } from '@/core/database/admin';
import { eq, sql, desc } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/core/database/server';

// Middleware / Auth check para asegurarse de que solo trimoraerp@gmail.com puede ejecutar esto
async function requireSuperAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user || user.email !== 'trimoraerp@gmail.com') {
    throw new Error('Unauthorized');
  }
}

// -------------------------------------------------------------
// ORGANIZACIONES
// -------------------------------------------------------------
export async function getAllOrganizations() {
  await requireSuperAdmin();
  
  // Obtenemos todas las organizaciones con conteo de miembros
  const orgs = await db.select({
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
  await requireSuperAdmin();
  const [newOrg] = await db.insert(organizations).values({ name }).returning();
  revalidatePath('/superadmin/organizations');
  return newOrg;
}

// -------------------------------------------------------------
// USUARIOS GLOBALES (Supabase Auth)
// -------------------------------------------------------------
export async function getAllGlobalUsers() {
  await requireSuperAdmin();
  const { data: { users }, error } = await supabaseAdmin.auth.admin.listUsers();
  if (error) throw error;
  return users;
}

export async function deleteGlobalUser(userId: string) {
  await requireSuperAdmin();
  
  await db.delete(organizationMembers).where(eq(organizationMembers.userId, userId));
  const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
  if (error) throw error;

  revalidatePath('/superadmin/users');
  return true;
}

export async function getGlobalUser(userId: string) {
  await requireSuperAdmin();
  const { data: { user }, error } = await supabaseAdmin.auth.admin.getUserById(userId);
  if (error) throw error;
  return user;
}

export async function updateGlobalUser(userId: string, updates: { email?: string, password?: string, ban_duration?: string }) {
  await requireSuperAdmin();
  
  const payload: any = {};
  if (updates.email) payload.email = updates.email;
  if (updates.password) payload.password = updates.password;
  if (updates.ban_duration !== undefined) payload.ban_duration = updates.ban_duration; // 'none' para desbanear, o '1000h' para banear

  const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, payload);
  if (error) throw error;

  revalidatePath(`/superadmin/users/${userId}`);
  revalidatePath('/superadmin/users');
  return true;
}

// -------------------------------------------------------------
// MIEMBROS DE UNA ORGANIZACIÓN
// -------------------------------------------------------------
export async function getOrganizationMembers(organizationId: string) {
  await requireSuperAdmin();
  const members = await db.select().from(organizationMembers).where(eq(organizationMembers.organizationId, organizationId));
  
  // Para enriquecer con emails, traemos los usuarios de Supabase
  const globalUsers = await getAllGlobalUsers();
  
  return members.map(m => {
    const user = globalUsers.find(u => u.id === m.userId);
    return {
      ...m,
      email: user?.email || 'Desconocido',
      lastSignIn: user?.last_sign_in_at
    };
  });
}

export async function addMemberToOrganization(organizationId: string, email: string, role: string) {
  await requireSuperAdmin();
  
  // 1. Encontrar el user_id de ese email en Supabase
  const globalUsers = await getAllGlobalUsers();
  const user = globalUsers.find(u => u.email === email);
  
  if (!user) {
    throw new Error('El usuario no existe. Debe registrarse primero.');
  }

  // 2. Verificar si ya es miembro
  const existing = await db.select().from(organizationMembers).where(sql`${organizationMembers.organizationId} = ${organizationId} AND ${organizationMembers.userId} = ${user.id}`);
  
  if (existing.length > 0) {
    throw new Error('El usuario ya es miembro de esta organización.');
  }

  await db.insert(organizationMembers).values({
    organizationId,
    userId: user.id,
    role
  });

  revalidatePath(`/superadmin/organizations/${organizationId}`);
  return true;
}

export async function updateMemberRole(memberId: string, newRole: string) {
  await requireSuperAdmin();
  await db.update(organizationMembers).set({ role: newRole }).where(eq(organizationMembers.id, memberId));
  revalidatePath('/superadmin/organizations'); // simplificado
  return true;
}

export async function removeMember(memberId: string) {
  await requireSuperAdmin();
  await db.delete(organizationMembers).where(eq(organizationMembers.id, memberId));
  revalidatePath('/superadmin/organizations');
  return true;
}

// -------------------------------------------------------------
// INVITACIONES
// -------------------------------------------------------------
import { sendInvitationEmail } from '@/core/services/email';
import { invitations } from '@/core/database/schema';

export async function sendInvitation(organizationId: string, email: string, role: string) {
  await requireSuperAdmin();
  
  // 1. Obtener nombre de la organización
  const [org] = await db.select().from(organizations).where(eq(organizations.id, organizationId));
  if (!org) throw new Error('Organización no encontrada');

  // 2. Crear la invitación en la base de datos
  const [invitation] = await db.insert(invitations).values({
    organizationId,
    email,
    role
  }).returning();

  // 3. Enviar el correo
  const res = await sendInvitationEmail(email, org.name, role, invitation.token);
  
  if (!res.success) {
    // Si falla el correo, borramos la invitación para que se intente de nuevo
    await db.delete(invitations).where(eq(invitations.id, invitation.id));
    throw new Error('No se pudo enviar el correo de invitación');
  }

  revalidatePath(`/superadmin/organizations/${organizationId}`);
  return true;
}

export async function getPendingInvitations(organizationId: string) {
  await requireSuperAdmin();
  return db.select().from(invitations).where(sql`${invitations.organizationId} = ${organizationId} AND ${invitations.status} = 'PENDING'`);
}

export async function cancelInvitation(invitationId: string, organizationId: string) {
  await requireSuperAdmin();
  await db.delete(invitations).where(eq(invitations.id, invitationId));
  revalidatePath(`/superadmin/organizations/${organizationId}`);
  return true;
}
