import { createClient } from "@/core/database/server";
import { redirect } from "next/navigation";
import DashboardNavigation from "@/components/layout/DashboardNavigation";

import { getPendingAppointmentsForToday } from "@/modules/agenda/actions";

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

  // Obtenemos el nombre de usuario del email (todo antes del @)
  const username = user.email?.split("@")[0] || "Administrador";
  const capitalizedUsername = username.charAt(0).toUpperCase() + username.slice(1);

  // Traer citas pendientes del día
  const res = await getPendingAppointmentsForToday();
  const pendingAppointments = res.success ? res.data : [];

  return (
    <DashboardNavigation username={capitalizedUsername} pendingAppointments={pendingAppointments}>
      {children}
    </DashboardNavigation>
  );
}
