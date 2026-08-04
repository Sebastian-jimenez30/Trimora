import { db } from "@/core/database/db";
import {
  services,
  products,
  clients,
  organizationMembers,
  transactions,
  transactionItems,
  auditLogs,
} from "@/core/database/schema";
import { requireActor } from "@/core/auth/server/actor";
import { getCashEntries } from "@/modules/pos/cash-flow";
import { and, desc, eq, inArray } from "drizzle-orm";
import { addDays, format, startOfWeek } from "date-fns";
import { fromZonedTime, toZonedTime } from "date-fns-tz";
import POSManager from "./POSManager";

const TIMEZONE = "America/Bogota";
const HISTORY_RANGES = ["DAY", "WEEK", "MONTH", "YEAR", "CUSTOM", "HISTORIC"] as const;
type HistoryRange = (typeof HISTORY_RANGES)[number];

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
  const { organizationId: orgId } = await requireActor();

  const params = await searchParams;
  const requestedRange = firstParam(params.historyRange);
  const historyRange: HistoryRange = HISTORY_RANGES.includes(requestedRange as HistoryRange)
    ? (requestedRange as HistoryRange)
    : "MONTH";
  const requestedStart = firstParam(params.historyStart);
  const requestedEnd = firstParam(params.historyEnd);
  const historyStart = isDateInput(requestedStart) ? requestedStart : "";
  const historyEnd = isDateInput(requestedEnd) ? requestedEnd : "";
  const historyBounds = getHistoryBounds(historyRange, historyStart, historyEnd);

  const activeServices = await db.select().from(services).where(eq(services.organizationId, orgId));
  const activeProducts = await db.select().from(products).where(eq(products.organizationId, orgId));
  const orgClients = await db.select().from(clients).where(eq(clients.organizationId, orgId));
  const staff = await db
    .select()
    .from(organizationMembers)
    .where(eq(organizationMembers.organizationId, orgId));

  const staffFormatted = staff.map((s) => ({
    id: s.id,
    name: `Staff ${s.id.substring(0, 4)} (${s.role})`,
  }));

  const [cashEntries, allPendingTransactions] = await Promise.all([
    getCashEntries(orgId, historyBounds?.start, historyBounds?.end),
    db
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.organizationId, orgId),
          eq(transactions.type, "INCOME"),
          eq(transactions.status, "PENDING"),
        ),
      )
      .orderBy(desc(transactions.createdAt)),
  ]);
  const pendingTransactions = historyBounds
    ? allPendingTransactions.filter(
        (transaction) =>
          transaction.createdAt >= historyBounds.start && transaction.createdAt < historyBounds.end,
      )
    : allPendingTransactions;

  const transactionIds = [
    ...new Set([
      ...cashEntries.map((entry) => entry.transactionId),
      ...allPendingTransactions.map((transaction) => transaction.id),
    ]),
  ];
  const [relatedTransactions, historyItems, historyLogs] =
    transactionIds.length > 0
      ? await Promise.all([
          db
            .select()
            .from(transactions)
            .where(
              and(eq(transactions.organizationId, orgId), inArray(transactions.id, transactionIds)),
            ),
          db
            .select()
            .from(transactionItems)
            .where(inArray(transactionItems.transactionId, transactionIds)),
          db
            .select()
            .from(auditLogs)
            .where(
              and(eq(auditLogs.organizationId, orgId), inArray(auditLogs.entityId, transactionIds)),
            ),
        ])
      : [[], [], []];

  const servicesById = new Map(activeServices.map((service) => [service.id, service]));
  const productsById = new Map(activeProducts.map((product) => [product.id, product]));
  const clientsById = new Map(orgClients.map((client) => [client.id, client]));
  const transactionsById = new Map(
    relatedTransactions.map((transaction) => [transaction.id, transaction]),
  );
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

  const mapTransactionDetails = (tx: (typeof relatedTransactions)[number]) => {
    const items = itemsByTransaction.get(tx.id) ?? [];
    const itemDetails = items.map((item) => {
      const catalogItem =
        item.itemType === "SERVICE" ? servicesById.get(item.itemId) : productsById.get(item.itemId);
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
      description = itemDetails
        .map((item) => {
          const quantity = Number(item.quantity);
          return quantity === 1 ? item.name : `${quantity} × ${item.name}`;
        })
        .join(", ");
    } else {
      description = getSaleDescriptionFromNote(tx.notes);
    }

    const clientObj = tx.clientId ? clientsById.get(tx.clientId) : null;
    const clientName = clientObj
      ? `${clientObj.firstName} ${clientObj.lastName || ""}`.trim()
      : "Cliente General";

    return {
      description,
      notes: tx.notes,
      clientName: tx.type === "INCOME" ? clientName : "---",
      itemDetails,
    };
  };

  const cashHistory = cashEntries.flatMap((entry) => {
    const tx = transactionsById.get(entry.transactionId);
    if (!tx) return [];

    return [
      {
        id: `${entry.source.toLowerCase()}:${entry.id}`,
        transactionId: tx.id,
        movementKind: entry.source === "PAYMENT" ? "PAYMENT" : "TRANSACTION",
        canEdit: entry.source === "TRANSACTION",
        type: tx.type,
        totalAmount: entry.amount,
        originalTotalAmount: tx.totalAmount,
        paidAmount: tx.paidAmount,
        status: "COMPLETED",
        transactionStatus: tx.status,
        paymentMethod: entry.paymentMethod,
        clientId: tx.clientId,
        createdAt: entry.createdAt.toISOString(),
        ...mapTransactionDetails(tx),
      },
    ];
  });

  const pendingHistory = pendingTransactions.map((tx) => ({
    id: `pending:${tx.id}`,
    transactionId: tx.id,
    movementKind: "PENDING",
    canEdit: true,
    type: tx.type,
    totalAmount: tx.totalAmount,
    originalTotalAmount: tx.totalAmount,
    paidAmount: tx.paidAmount,
    status: tx.status,
    transactionStatus: tx.status,
    paymentMethod: tx.paymentMethod,
    clientId: tx.clientId,
    createdAt: tx.createdAt.toISOString(),
    ...mapTransactionDetails(tx),
  }));

  const history = [...cashHistory, ...pendingHistory].sort(
    (first, second) => new Date(second.createdAt).getTime() - new Date(first.createdAt).getTime(),
  );

  const receivablesByClient = new Map<
    string,
    {
      clientId: string;
      clientName: string;
      totalDebt: number;
      movements: Array<{
        transactionId: string;
        createdAt: string;
        description: string;
        totalAmount: string;
        paidAmount: string;
        remaining: number;
        itemDetails: ReturnType<typeof mapTransactionDetails>["itemDetails"];
      }>;
    }
  >();

  for (const transaction of allPendingTransactions) {
    if (!transaction.clientId) continue;
    const remaining = Math.max(0, Number(transaction.totalAmount) - Number(transaction.paidAmount));
    if (remaining <= 0) continue;

    const details = mapTransactionDetails(transaction);
    const account = receivablesByClient.get(transaction.clientId) ?? {
      clientId: transaction.clientId,
      clientName: details.clientName,
      totalDebt: 0,
      movements: [],
    };
    account.totalDebt += remaining;
    account.movements.push({
      transactionId: transaction.id,
      createdAt: transaction.createdAt.toISOString(),
      description: details.description,
      totalAmount: transaction.totalAmount,
      paidAmount: transaction.paidAmount,
      remaining,
      itemDetails: details.itemDetails,
    });
    receivablesByClient.set(transaction.clientId, account);
  }

  const receivables = [...receivablesByClient.values()]
    .map((account) => ({
      ...account,
      totalDebt: account.totalDebt.toFixed(2),
      movements: account.movements.sort(
        (first, second) =>
          new Date(first.createdAt).getTime() - new Date(second.createdAt).getTime(),
      ),
    }))
    .sort((first, second) => Number(second.totalDebt) - Number(first.totalDebt));

  const pendingRes = await import("@/modules/agenda/actions").then((m) =>
    m.getPendingAppointmentsForToday(),
  );
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
        receivables={receivables}
        historyRange={historyRange}
        historyStart={historyStart}
        historyEnd={historyEnd}
        pendingAppointments={pendingAppointments}
      />
    </div>
  );
}
