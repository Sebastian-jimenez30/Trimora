import { db } from "@/core/database/db";
import { services, products, clients, organizationMembers, transactions, transactionItems, auditLogs } from "@/core/database/schema";
import { createClient } from "@/core/database/server";
import { eq, desc } from "drizzle-orm";
import { redirect } from "next/navigation";
import POSManager from "./POSManager";

export default async function POSPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const orgId = user.user_metadata?.organization_id;
  if (!orgId) return <div className="p-10 text-white">Error: Sin organización asignada.</div>;

  // Cargar catálogo activo
  const activeServices = await db.select().from(services).where(eq(services.organizationId, orgId));
  const activeProducts = await db.select().from(products).where(eq(products.organizationId, orgId));

  // Cargar dependencias para la venta
  const orgClients = await db.select().from(clients).where(eq(clients.organizationId, orgId));
  const staff = await db.select().from(organizationMembers).where(eq(organizationMembers.organizationId, orgId));

  // Simular nombres del staff
  const staffFormatted = staff.map(s => ({
    id: s.id,
    name: `Staff ${s.id.substring(0, 4)} (${s.role})`
  }));

  // Cargar transacciones recientes para el historial (últimas 50)
  const recentTx = await db.select()
    .from(transactions)
    .where(eq(transactions.organizationId, orgId))
    .orderBy(desc(transactions.createdAt))
    .limit(50);

  // Mapear historial incluyendo descripción si es gasto
  const history = await Promise.all(recentTx.map(async (tx) => {
    let description = "";
    if (tx.type === "EXPENSE") {
      const logs = await db.select().from(auditLogs).where(eq(auditLogs.entityId, tx.id)).limit(1);
      description = logs[0]?.details || "Gasto sin descripción";
    } else {
      // Venta: traer nombres de los items
      const items = await db.select().from(transactionItems).where(eq(transactionItems.transactionId, tx.id));
      const count = items.length;
      if (count === 1) {
        if (items[0].itemType === "SERVICE") {
          const srv = activeServices.find(s => s.id === items[0].itemId);
          description = srv?.name || "Servicio";
        } else {
          const prd = activeProducts.find(p => p.id === items[0].itemId);
          description = prd?.name || "Producto";
        }
      } else {
        description = `Venta múltiple (${count} ítems)`;
      }
    }

    const clientObj = tx.clientId ? orgClients.find(c => c.id === tx.clientId) : null;
    const clientName = clientObj ? `${clientObj.firstName} ${clientObj.lastName || ""}` : "Cliente General";

    return {
      id: tx.id,
      type: tx.type,
      totalAmount: tx.totalAmount,
      paymentMethod: tx.paymentMethod,
      createdAt: tx.createdAt.toISOString(),
      description,
      clientName: tx.type === "INCOME" ? clientName : "---"
    };
  }));

  const pendingRes = await import("@/modules/agenda/actions").then(m => m.getPendingAppointmentsForToday());
  const pendingAppointments = pendingRes.success ? pendingRes.data : [];

  return (
    <div className="flex flex-col h-full bg-[#0f0f0f]">
      <POSManager 
        services={activeServices} 
        products={activeProducts} 
        clients={orgClients} 
        staff={staffFormatted} 
        history={history}
        pendingAppointments={pendingAppointments}
      />
    </div>
  );
}
