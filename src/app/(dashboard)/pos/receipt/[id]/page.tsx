import { db } from "@/core/database/db";
import { transactions, transactionItems, products, services, clients, organizations } from "@/core/database/schema";
import { eq, inArray, and } from "drizzle-orm";
import { createClient } from "@/core/database/server";
import { notFound } from "next/navigation";
import PrintReceiptClient from "./PrintReceiptClient";

export default async function ReceiptPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const transactionId = params.id;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !user.user_metadata?.organization_id) notFound();
  const orgId = user.user_metadata.organization_id;

  const [tx] = await db.select().from(transactions).where(and(eq(transactions.id, transactionId), eq(transactions.organizationId, orgId)));
  if (!tx) notFound();

  const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId));
  const orgName = org?.name || "Empresa";

  const items = await db.select().from(transactionItems).where(eq(transactionItems.transactionId, transactionId));
  
  // Resolve item names efficiently (N+1 fix)
  const productIds = items.filter(i => i.itemType === "PRODUCT").map(i => i.itemId);
  const serviceIds = items.filter(i => i.itemType === "SERVICE").map(i => i.itemId);

  const productNames: Record<string, string> = {};
  const serviceNames: Record<string, string> = {};

  if (productIds.length > 0) {
    const pData = await db.select({ id: products.id, name: products.name }).from(products).where(inArray(products.id, productIds));
    pData.forEach(p => productNames[p.id] = p.name);
  }

  if (serviceIds.length > 0) {
    const sData = await db.select({ id: services.id, name: services.name }).from(services).where(inArray(services.id, serviceIds));
    sData.forEach(s => serviceNames[s.id] = s.name);
  }

  const itemsWithNames = items.map(item => {
    let name = "Item";
    if (item.itemType === "PRODUCT") name = productNames[item.itemId] || name;
    else if (item.itemType === "SERVICE") name = serviceNames[item.itemId] || name;
    return { ...item, name };
  });

  let clientName = "Consumidor Final";
  if (tx.clientId) {
    const [c] = await db.select().from(clients).where(eq(clients.id, tx.clientId));
    if (c) clientName = `${c.firstName} ${c.lastName || ""}`;
  }

  const isPending = tx.status === 'PENDING';
  const remaining = isPending ? (parseFloat(tx.totalAmount) - parseFloat(tx.paidAmount || '0')).toFixed(2) : '0.00';

  return (
    <div className="bg-white min-h-screen text-black font-mono text-[12px] print:m-0 print:p-0">
      <div className="w-[80mm] max-w-full mx-auto p-4 print:p-0 print:w-[80mm]">
        {/* Encabezado */}
        <div className="text-center mb-4 border-b border-dashed border-black/50 pb-4">
          <h1 className="text-lg font-bold uppercase">{orgName}</h1>
          <p className="mt-1">Ticket: {tx.id.substring(0, 8).toUpperCase()}</p>
          <p>Fecha: {new Date(tx.createdAt).toLocaleDateString()} {new Date(tx.createdAt).toLocaleTimeString()}</p>
          <p>Cliente: {clientName}</p>
        </div>

        {/* Detalles */}
        <table className="w-full mb-4">
          <thead>
            <tr className="border-b border-black/50">
              <th className="text-left py-1">Cant</th>
              <th className="text-left py-1">Desc</th>
              <th className="text-right py-1">Total</th>
            </tr>
          </thead>
          <tbody>
            {itemsWithNames.map(item => (
              <tr key={item.id}>
                <td className="py-1 align-top">{item.quantity}</td>
                <td className="py-1">{item.name}</td>
                <td className="py-1 text-right align-top">${item.subtotal}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totales */}
        <div className="border-t border-dashed border-black/50 pt-2 mb-4">
          <div className="flex justify-between font-bold text-sm">
            <span>TOTAL</span>
            <span>${tx.totalAmount}</span>
          </div>
          {tx.paymentMethod === 'CREDIT' && (
             <>
               <div className="flex justify-between mt-1">
                 <span>Abonado</span>
                 <span>${tx.paidAmount}</span>
               </div>
               <div className="flex justify-between mt-1 text-sm font-bold">
                 <span>Saldo Pendiente</span>
                 <span>${remaining}</span>
               </div>
             </>
          )}
          {tx.paymentMethod !== 'CREDIT' && (
            <div className="flex justify-between mt-1">
              <span>Pagado ({tx.paymentMethod})</span>
              <span>${tx.totalAmount}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="text-center mt-6 pt-4 text-[10px]">
          <p>¡Gracias por su preferencia!</p>
          <p>Generado por Trimora</p>
        </div>
        
        {/* Cliente para auto-impresión */}
        <PrintReceiptClient />
      </div>
    </div>
  );
}
