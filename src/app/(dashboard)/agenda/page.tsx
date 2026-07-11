import { db } from "@/core/database/db";
import { appointments, clients, services, organizationMembers } from "@/core/database/schema";
import { createClient } from "@/core/database/server";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import AgendaManager from "./AgendaManager";

export default async function AgendaPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const organizationId = user.user_metadata?.organization_id;

  if (!organizationId) {
    return <div className="p-10 text-white">Error: Usuario no tiene una organización asignada.</div>;
  }

  // Obtener datos relacionados para la agenda
  const appointmentsData = await db.select().from(appointments).where(eq(appointments.organizationId, organizationId));
  const clientsData = await db.select().from(clients).where(eq(clients.organizationId, organizationId));
  const servicesData = await db.select().from(services).where(eq(services.organizationId, organizationId));
  const staffData = await db.select().from(organizationMembers).where(eq(organizationMembers.organizationId, organizationId));

  // Como no hay tabla de "users" para el nombre del staff en el esquema actual,
  // simularemos los nombres del staff o usaremos el ID / Role por ahora.
  // En una app real cruzarías con la auth.users de Supabase.
  const staffFormatted = staffData.map(s => ({
    id: s.id,
    role: s.role,
    name: `Staff ${s.id.substring(0, 4)} (${s.role})`
  }));

  return (
    <div className="flex flex-col h-full bg-[#0f0f0f]">
      <AgendaManager 
        initialAppointments={appointmentsData.map(a => ({
          ...a,
          startTime: a.startTime.toISOString(),
          endTime: a.endTime.toISOString(),
        }))} 
        clients={clientsData} 
        services={servicesData} 
        staff={staffFormatted} 
      />
    </div>
  );
}
