import { createClient } from "@/core/database/server";
import { redirect } from "next/navigation";
import DashboardNavigation from "@/components/layout/DashboardNavigation";

import { getPendingAppointmentsForToday } from "@/modules/agenda/actions";

import SessionTimeout from "@/components/layout/SessionTimeout";

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

  return (
    <>
      <SessionTimeout />
      <DashboardNavigation username={capitalizedUsername} avatarUrl={avatarUrl} pendingAppointments={pendingAppointments}>
        {children}
      </DashboardNavigation>
    </>
  );
}
