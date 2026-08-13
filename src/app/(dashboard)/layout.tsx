import { requireActor } from "@/core/auth/server/actor";
import DashboardNavigation from "@/components/layout/DashboardNavigation";

import { getPendingAppointmentsForToday } from "@/modules/agenda/actions";

import SessionTimeout from "@/components/layout/SessionTimeout";
import ChatWidget from "@/components/ai/ChatWidget";
import { Toaster } from "react-hot-toast";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireActor();
  const rawUsername = actor.displayName;
  const capitalizedUsername = rawUsername.charAt(0).toUpperCase() + rawUsername.slice(1);
  const avatarUrl = actor.avatarUrl ?? undefined;

  // Traer citas pendientes del día
  const res = await getPendingAppointmentsForToday();
  const pendingAppointments = res.success ? res.data : [];

  const isAdmin = actor.role === "ADMIN";

  return (
    <>
      <SessionTimeout />
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: "#141414",
            color: "#E8E8E8",
            border: "1px solid rgba(255,255,255,0.1)",
          },
          success: {
            iconTheme: {
              primary: "#8B4513", // cognac
              secondary: "#fff",
            },
          },
        }}
      />
      <DashboardNavigation
        username={capitalizedUsername}
        avatarUrl={avatarUrl}
        pendingAppointments={pendingAppointments}
        isAdmin={isAdmin}
      >
        {children}
      </DashboardNavigation>
      <ChatWidget />
    </>
  );
}
