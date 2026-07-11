import { createClient } from "@/core/database/server";
import { db } from "@/core/database/db";
import { organizationMembers, clients } from "@/core/database/schema";
import { eq, desc } from "drizzle-orm";
import { redirect } from "next/navigation";
import ClientManager from "./ClientManager";

export default async function ClientesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Obtener la Organización
  const member = await db.select().from(organizationMembers).where(eq(organizationMembers.userId, user.id)).limit(1);
  const orgId = member[0]?.organizationId;

  if (!orgId) {
    return <div className="p-10 text-white">No tienes una organización asignada.</div>;
  }

  // Cargar clientes
  const customers = await db.select()
    .from(clients)
    .where(eq(clients.organizationId, orgId))
    .orderBy(desc(clients.createdAt));

  return (
    <div className="p-[30px] flex flex-col gap-6 h-full">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-serif text-sterling mb-1">Manejo de Clientes</h1>
          <p className="text-sm text-charcoal">Administra tu base de datos de clientes (CRM).</p>
        </div>
      </div>
      
      <ClientManager initialClients={customers} />
    </div>
  );
}
