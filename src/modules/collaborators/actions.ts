"use server"

import { db } from "@/core/database/db";
import { organizationMembers, invitations, organizations } from "@/core/database/schema";
import { createClient } from "@/core/database/server";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { sendInvitationEmail } from "@/core/services/email";

// Helper para asegurar que el usuario actual es ADMIN de su organización
async function requireAdminAuth() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");
  
  const organizationId = user.user_metadata?.organization_id;
  if (!organizationId) throw new Error("Usuario sin organización");

  const [member] = await db.select().from(organizationMembers).where(and(
    eq(organizationMembers.organizationId, organizationId),
    eq(organizationMembers.userId, user.id)
  ));

  if (!member || member.role !== 'ADMIN') {
    throw new Error("Acceso denegado: Se requiere rol de administrador");
  }

  return { user, organizationId };
}

export async function inviteCollaborator(formData: FormData) {
  try {
    const { organizationId } = await requireAdminAuth();
    
    const email = formData.get("email") as string;
    const role = formData.get("role") as string;

    if (!email || !role) throw new Error("Faltan datos");

    // Verificar si ya existe en la org
    // Como no podemos consultar emails en auth.users fácilmente, confiamos en las invitaciones previas
    const existingInvite = await db.select().from(invitations).where(and(
      eq(invitations.organizationId, organizationId),
      eq(invitations.email, email),
      eq(invitations.status, 'PENDING')
    ));

    if (existingInvite.length > 0) {
      throw new Error("Ya existe una invitación pendiente para este correo");
    }

    const [invitation] = await db.insert(invitations).values({
      organizationId,
      email,
      role,
      status: 'PENDING'
    }).returning();

    const [org] = await db.select().from(organizations).where(eq(organizations.id, organizationId));
    const orgName = org?.name || "Nuestra Organización";

    // Enviar correo de invitación usando SendGrid
    await sendInvitationEmail(email, orgName, role, invitation.token);

    revalidatePath('/equipo');
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function removeCollaborator(formData: FormData) {
  try {
    const { organizationId, user: currentUser } = await requireAdminAuth();
    
    const userId = formData.get("userId") as string;
    if (!userId) throw new Error("ID de usuario requerido");
    
    if (userId === currentUser.id) {
      throw new Error("No puedes eliminarte a ti mismo");
    }

    await db.delete(organizationMembers).where(and(
      eq(organizationMembers.organizationId, organizationId),
      eq(organizationMembers.userId, userId)
    ));

    // Si queremos quitarle el organization_id de user_metadata, necesitamos el supabaseAdmin
    const { createClient: createSupabaseAdmin } = await import('@supabase/supabase-js');
    const adminAuth = createSupabaseAdmin(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SECRET_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    ).auth.admin;

    const { data: userToUpdate } = await adminAuth.getUserById(userId);
    if (userToUpdate.user) {
      // Remove organization_id so they get logged out of the dashboard
      const metadata = { ...userToUpdate.user.user_metadata };
      delete metadata.organization_id;
      await adminAuth.updateUserById(userId, { user_metadata: metadata });
    }

    revalidatePath('/equipo');
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function cancelInvitation(formData: FormData) {
  try {
    const { organizationId } = await requireAdminAuth();
    
    const invitationId = formData.get("invitationId") as string;
    if (!invitationId) throw new Error("ID de invitación requerido");

    await db.delete(invitations).where(and(
      eq(invitations.id, invitationId),
      eq(invitations.organizationId, organizationId)
    ));

    revalidatePath('/equipo');
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function updateCollaboratorRole(formData: FormData) {
  try {
    const { organizationId, user: currentUser } = await requireAdminAuth();
    
    const userId = formData.get("userId") as string;
    const newRole = formData.get("role") as string;
    
    if (!userId || !newRole) throw new Error("Faltan datos");
    if (userId === currentUser.id) throw new Error("No puedes cambiar tu propio rol");

    await db.update(organizationMembers)
      .set({ role: newRole })
      .where(and(
        eq(organizationMembers.organizationId, organizationId),
        eq(organizationMembers.userId, userId)
      ));

    revalidatePath('/equipo');
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
