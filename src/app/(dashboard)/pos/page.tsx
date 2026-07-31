import { db } from "@/core/database/db";
import { services, products, clients, organizationMembers, transactions, transactionItems, auditLogs } from "@/core/database/schema";
import { createClient } from "@/core/database/server";
import { and, desc, eq, gte, inArray, lt } from "drizzle-orm";
import { addDays, format, startOfWeek } from "date-fns";
import { fromZonedTime, toZonedTime } from "date-fns-tz";
import { redirect } from "next/navigation";
import POSManager from "./POSManager";

const TIMEZONE = "America/Bogota";
const HISTORY_RANGES = ["DAY", "WEEK", "MONTH", "YEAR", "CUSTOM", "HISTORIC"] as const;
type HistoryRange = typeof HISTORY_RANGES[number];

type POSPageProps = {
  searchParams: Promise<{
    historyRange?: string | string[];
    historyStart?: string | string[];
    historyEnd?: string | string[];
  }>;
};

function firstParam(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

function isDateInput(value?: string): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function getHistoryBounds(range: HistoryRange, customStart?: string, customEnd?: string) {
  if (range === "HISTORIC") return null;

  const nowInBogota = toZonedTime(new Date(), TIMEZONE);
  let startDate = format(nowInBogota, "yyyy-MM-dd");
  let endDate = startDate;

  if (range === "WEEK") {
    startDate = format(startOfWeek(nowInBogota, { weekStartsOn: 1 }), "yyyy-MM-dd");
  } else if (range === "MONTH") {
    startDate = format(nowInBogota, "yyyy-MM-01");
  } else if (range === "YEAR") {
    startDate = format(nowInBogota, "yyyy-01-01");
  } else if (range === "CUSTOM" && isDateInput(customStart) && isDateInput(customEnd)) {
    startDate = customStart <= customEnd ? customStart : customEnd;
    endDate = customStart <= customEnd ? customEnd : customStart;
  }

  const endLocalDate = format(addDays(new Date(`${endDate}T12:00:00`), 1), "yyyy-MM-dd");
  return {
    start: fromZonedTime(`${startDate}T00:00:00`, TIMEZONE),
    end: fromZonedTime(`${endLocalDate}T00:00:00`, TIMEZONE),
  };
}

function getSaleDescriptionFromNote(note: string | null) {
  if (!note) return "Venta sin detalle registrado";
  return note.replace(/\s+para\s+.+$/i, "").trim();
}

export default async function POSPage({ searchParams }: POSPageProps) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const orgId = user.user_metadata?.organization_id;
  if (!orgId) return <div className="p-10 text-white">Error: Sin organización asignada.</div>;

  const params = await searchParams;
  const requestedRange = firstParam(params.historyRange);
  const historyRange: HistoryRange = HISTORY_RANGES.includes(requestedRange as HistoryRange)
    ? requestedRange as HistoryRange
    : "MONTH";
  const requestedStart = firstParam(params.historyStart);
  const requestedEnd = firstParam(params.historyEnd);
  const historyStart = isDateInput(requestedStart) ? requestedStart : "";
  const historyEnd = isDateInput(requestedEnd) ? requestedEnd : "";
  const historyBounds = getHistoryBounds(historyRange, historyStart, historyEnd);

  const activeServices = await db.select().from(services).where(eq(services.organizationId, orgId));
  const activeProducts = await db.select().from(products).where(eq(products.organizationId, orgId));
  const orgClients = await db.select().from(clients).where(eq(clients.organizationId, orgId));
  const staff = await db.select().from(organizationMembers).where(eq(organizationMembers.organizationId, orgId));

  const staffFormatted = staff.map(s => ({
    id: s.id,
    name: `Staff ${s.id.substring(0, 4)} (${s.role})`
  }));

  const historyWhere = historyBounds
    ? and(
        eq(transactions.organizationId, orgId),
        gte(transactions.createdAt, historyBounds.start),
        lt(transactions.createdAt, historyBounds.end),
      )
    : eq(transactions.organizationId, orgId);

  const historyTransactions = await db.select()
    .from(transactions)
    .where(historyWhere)
    .orderBy(desc(transactions.createdAt));

  const transactionIds = historyTransactions.map(transaction => transaction.id);
  const [historyItems, historyLogs] = transactionIds.length > 0
    ? await Promise.all([
        db.select().from(transactionItems).where(inArray(transactionItems.transactionId, transactionIds)),
        db.select().from(auditLogs).where(inArray(auditLogs.entityId, transactionIds)),
      ])
    : [[], []];

  const servicesById = new Map(activeServices.map(service => [service.id, service]));
  const productsById = new Map(activeProducts.map(product => [product.id, product]));
  const clientsById = new Map(orgClients.map(client => [client.id, client]));
  const itemsByTransaction = new Map<string, typeof historyItems>();
  const descriptionsByTransaction = new Map<string, string>();

  for (const item of historyItems) {
    const items = itemsByTransaction.get(item.transactionId) ?? [];
    items.push(item);
    itemsByTransaction.set(item.transactionId, items);
  }
  for (const log of historyLogs) {
    if (log.entityId && !descriptionsByTransaction.has(log.entityId)) {
      descriptionsByTransaction.set(log.entityId, log.details || "");
    }
  }

  const history = historyTransactions.map(tx => {
    const items = itemsByTransaction.get(tx.id) ?? [];
    const itemDetails = items.map(item => {
      const catalogItem = item.itemType === "SERVICE"
        ? servicesById.get(item.itemId)
        : productsById.get(item.itemId);
      return {
        name: catalogItem?.name || (item.itemType === "SERVICE" ? "Servicio" : "Producto"),
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        subtotal: item.subtotal,
      };
    });

    let description: string;
    if (tx.type === "EXPENSE") {
      description = descriptionsByTransaction.get(tx.id) || tx.notes || "Gasto sin descripción";
    } else if (items.length > 0) {
      description = itemDetails.map(item => {
        const quantity = Number(item.quantity);
        return quantity === 1 ? item.name : `${quantity} × ${item.name}`;
      }).join(", ");
    } else {
      description = getSaleDescriptionFromNote(tx.notes);
    }

    const clientObj = tx.clientId ? clientsById.get(tx.clientId) : null;
    const clientName = clientObj ? `${clientObj.firstName} ${clientObj.lastName || ""}`.trim() : "Cliente General";

    return {
      id: tx.id,
      type: tx.type,
      totalAmount: tx.totalAmount,
      paidAmount: tx.paidAmount,
      status: tx.status,
      paymentMethod: tx.paymentMethod,
      clientId: tx.clientId,
      createdAt: tx.createdAt.toISOString(),
      description,
      notes: tx.notes,
      clientName: tx.type === "INCOME" ? clientName : "---",
      itemDetails,
    };
  });

  const pendingRes = await import("@/modules/agenda/actions").then(m => m.getPendingAppointmentsForToday());
  const pendingAppointments = pendingRes.success ? pendingRes.data : [];

  return (
    <div className="flex flex-col h-full bg-[#0f0f0f]">
      <POSManager
        key={`${historyRange}:${historyStart}:${historyEnd}`}
        services={activeServices}
        products={activeProducts}
        clients={orgClients}
        staff={staffFormatted}
        history={history}
        historyRange={historyRange}
        historyStart={historyStart}
        historyEnd={historyEnd}
        pendingAppointments={pendingAppointments}
      />
    </div>
  );
}
