import { db } from "@/core/database/db";
import { organizationMembers, invitations } from "@/core/database/schema";
import { createClient } from "@/core/database/server";
import { eq, and } from "drizzle-orm";
import { redirect } from "next/navigation";
import TeamManager from "./TeamManager";

export default async function TeamPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user || !user.user_metadata?.organization_id) {
    redirect("/login");
  }

  const organizationId = user.user_metadata.organization_id;

  // Verificar si es ADMIN
  const [member] = await db.select().from(organizationMembers).where(and(
    eq(organizationMembers.organizationId, organizationId),
    eq(organizationMembers.userId, user.id)
  ));

  if (!member || member.role !== 'ADMIN') {
    redirect("/dashboard"); // O mostrar un un-authorized
  }

  // Obtener invitaciones pendientes
  const pendingInvites = await db.select().from(invitations).where(and(
    eq(invitations.organizationId, organizationId),
    eq(invitations.status, 'PENDING')
  ));

  // Obtener miembros activos
  const members = await db.select().from(organizationMembers).where(
    eq(organizationMembers.organizationId, organizationId)
  );

  // Cruzar con auth.users usando la API de Admin
  const { createClient: createSupabaseAdmin } = await import('@supabase/supabase-js');
  const adminAuth = createSupabaseAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  ).auth.admin;

  const { data: authUsers } = await adminAuth.listUsers();
  
  const enrichedMembers = members.map(m => {
    const authUser = authUsers.users.find(u => u.id === m.userId);
    return {
      ...m,
      email: authUser?.email || "Usuario Eliminado",
      fullName: authUser?.user_metadata?.full_name || authUser?.email?.split('@')[0] || "Desconocido",
      avatarUrl: authUser?.user_metadata?.avatar_url || null,
      isCurrentUser: m.userId === user.id
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
        invitations={pendingInvites} 
      />
    </div>
  );
}
