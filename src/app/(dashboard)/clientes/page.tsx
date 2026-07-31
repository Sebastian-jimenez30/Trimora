import { createClient } from "@/core/database/server";
import { db } from "@/core/database/db";
import { organizationMembers, clients, transactions } from "@/core/database/schema";
import { eq, desc, and } from "drizzle-orm";
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

  const customerTransactions = await db.select({
    clientId: transactions.clientId,
    totalAmount: transactions.totalAmount,
  })
    .from(transactions)
    .where(and(
      eq(transactions.organizationId, orgId),
      eq(transactions.type, "INCOME")
    ));

  const totalsByClient = new Map<string, number>();
  for (const transaction of customerTransactions) {
    if (!transaction.clientId) continue;
    totalsByClient.set(
      transaction.clientId,
      (totalsByClient.get(transaction.clientId) || 0) + Number(transaction.totalAmount)
    );
  }

  const customersWithTotals = customers.map((customer) => ({
    ...customer,
    totalSpent: (totalsByClient.get(customer.id) || 0).toFixed(2),
  }));

  return (
    <div className="p-[30px] flex flex-col gap-6 h-full">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-serif text-sterling mb-1">Manejo de Clientes</h1>
          <p className="text-sm text-charcoal">Administra tu base de datos de clientes (CRM).</p>
        </div>
      </div>
      
      <ClientManager initialClients={customersWithTotals} />
    </div>
  );
}
