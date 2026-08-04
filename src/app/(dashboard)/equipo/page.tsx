import { db } from "@/core/database/db";
import { organizationMembers, invitations } from "@/core/database/schema";
import { requireActor } from "@/core/auth/server/actor";
import { supabaseAdmin } from "@/core/database/admin";
import { eq, and } from "drizzle-orm";
import TeamManager from "./TeamManager";

export default async function TeamPage() {
  const actor = await requireActor({ roles: ["ADMIN"] });
  const { organizationId } = actor;

  // Obtener invitaciones pendientes
  const pendingInvites = await db
    .select()
    .from(invitations)
    .where(and(eq(invitations.organizationId, organizationId), eq(invitations.status, "PENDING")));

  // Obtener miembros activos
  const members = await db
    .select()
    .from(organizationMembers)
    .where(eq(organizationMembers.organizationId, organizationId));

  // Cruzar con auth.users usando la API de Admin
  const { data: authUsers } = await supabaseAdmin.auth.admin.listUsers();

  const enrichedMembers = members.map((m) => {
    const authUser = authUsers.users.find((u) => u.id === m.userId);
    return {
      id: m.id,
      userId: m.userId,
      role: m.role,
      email: authUser?.email || "Usuario Eliminado",
      fullName:
        authUser?.user_metadata?.full_name || authUser?.email?.split("@")[0] || "Desconocido",
      avatarUrl: authUser?.user_metadata?.avatar_url || null,
      isCurrentUser: m.userId === actor.userId,
    };
  });

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto w-full">
      <div className="mb-8">
        <h1 className="text-3xl font-serif font-bold text-white mb-2">Equipo de Trabajo</h1>
        <p className="text-charcoal text-sm">Gestiona los colaboradores y accesos a tu barbería.</p>
      </div>

      <TeamManager
        members={enrichedMembers}
        invitations={pendingInvites.map((invitation) => ({
          id: invitation.id,
          email: invitation.email,
          role: invitation.role,
        }))}
      />
    </div>
  );
}
