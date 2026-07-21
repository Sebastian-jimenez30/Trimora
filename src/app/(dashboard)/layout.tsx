import { createClient } from "@/core/database/server";
import { redirect } from "next/navigation";
import DashboardNavigation from "@/components/layout/DashboardNavigation";

import { getPendingAppointmentsForToday } from "@/modules/agenda/actions";

import SessionTimeout from "@/components/layout/SessionTimeout";
import ChatWidget from "@/components/ai/ChatWidget";
import { Toaster } from "react-hot-toast";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Obtenemos los datos del metadata, con fallback al email
  const metadataName = user.user_metadata?.full_name;
  const emailName = user.email?.split("@")[0] || "Administrador";
  
  const rawUsername = metadataName || emailName;
  const capitalizedUsername = rawUsername.charAt(0).toUpperCase() + rawUsername.slice(1);
  const avatarUrl = user.user_metadata?.avatar_url;

  // Traer citas pendientes del día
  const res = await getPendingAppointmentsForToday();
  const pendingAppointments = res.success ? res.data : [];

  // Verificar si el usuario es administrador de la organización activa
  let isAdmin = false;
  if (user.user_metadata?.organization_id) {
    const { db } = await import('@/core/database/db');
    const { organizationMembers } = await import('@/core/database/schema');
    const { eq, and } = await import('drizzle-orm');
    
    const [member] = await db.select()
      .from(organizationMembers)
      .where(and(
        eq(organizationMembers.organizationId, user.user_metadata.organization_id),
        eq(organizationMembers.userId, user.id)
      ));
      
    if (member && member.role === 'ADMIN') {
      isAdmin = true;
    }
  }

  return (
    <>
      <SessionTimeout />
      <Toaster 
        position="top-right" 
        toastOptions={{
          style: {
            background: '#141414',
            color: '#E8E8E8',
            border: '1px solid rgba(255,255,255,0.1)',
          },
          success: {
            iconTheme: {
              primary: '#8B4513', // cognac
              secondary: '#fff',
            },
          },
        }} 
      />
      <DashboardNavigation username={capitalizedUsername} avatarUrl={avatarUrl} pendingAppointments={pendingAppointments} isAdmin={isAdmin}>
        {children}
      </DashboardNavigation>
      <ChatWidget />
    </>
  );
}
