import "server-only";

import { db } from "@/core/database/db";
import {
  appointments,
  auditLogs,
  clients,
  products,
  services,
  transactionItems,
  transactionPayments,
  transactions,
} from "@/core/database/schema";
import { and, desc, eq, gte, inArray, lt, ne, sql } from "drizzle-orm";
import { fromZonedTime } from "date-fns-tz";
import { getCashEntriesPage, getCashFlowSummary } from "@/modules/pos/cash-flow";
import type {
  AnalyticsData,
  AnalyticsMovement,
  AnalyticsPeriod,
  AnalyticsPeriodType,
  DemandPoint,
  RankingItem,
} from "./types";

const TIMEZONE = "America/Bogota";
const PAGE_SIZE = 25;
const MONTH_NAMES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

type AnalyticsFilters = {
  type?: string;
  year?: string;
  segment?: string;
  cursor?: string;
};

function normalizePeriodType(value?: string): AnalyticsPeriodType {
  return value === "quarter" || value === "semester" || value === "year" ? value : "month";
}

function normalizeYear(value?: string) {
  const parsed = Number(value);
  const currentYear = Number(
    new Intl.DateTimeFormat("en-US", { timeZone: TIMEZONE, year: "numeric" }).format(new Date()),
  );
  return Number.isInteger(parsed) && parsed >= 2000 && parsed <= currentYear + 1
    ? parsed
    : currentYear;
}

function createRange(year: number, startMonth: number, months: number) {
  const normalizedStartYear = year + Math.floor(startMonth / 12);
  const normalizedStartMonth = ((startMonth % 12) + 12) % 12;
  const rawEndMonth = normalizedStartMonth + months;
  const endYear = normalizedStartYear + Math.floor(rawEndMonth / 12);
  const endMonth = rawEndMonth % 12;
  const start = fromZonedTime(
    `${normalizedStartYear}-${String(normalizedStartMonth + 1).padStart(2, "0")}-01T00:00:00`,
    TIMEZONE,
  );
  const end = fromZonedTime(
    `${endYear}-${String(endMonth + 1).padStart(2, "0")}-01T00:00:00`,
    TIMEZONE,
  );
  return { start, end };
}

export function resolveAnalyticsPeriod(
  filters: AnalyticsFilters,
): AnalyticsPeriod & { start: Date; end: Date; previousStart: Date; previousEnd: Date } {
  const type = normalizePeriodType(filters.type);
  const year = normalizeYear(filters.year);
  const maxSegment = type === "month" ? 12 : type === "quarter" ? 4 : type === "semester" ? 2 : 1;
  const requestedSegment = Number(filters.segment);
  const defaultSegment =
    type === "month"
      ? Number(
          new Intl.DateTimeFormat("en-US", { timeZone: TIMEZONE, month: "numeric" }).format(
            new Date(),
          ),
        )
      : 1;
  const segment =
    Number.isInteger(requestedSegment) && requestedSegment >= 1 && requestedSegment <= maxSegment
      ? requestedSegment
      : defaultSegment;
  const months = type === "month" ? 1 : type === "quarter" ? 3 : type === "semester" ? 6 : 12;
  const startMonth = (segment - 1) * months;
  const { start, end } = createRange(year, startMonth, months);
  const previous = createRange(year, startMonth - months, months);
  const label =
    type === "month"
      ? `${MONTH_NAMES[startMonth]} ${year}`
      : type === "quarter"
        ? `Trimestre ${segment} · ${year}`
        : type === "semester"
          ? `Semestre ${segment} · ${year}`
          : `Año ${year}`;

  return {
    type,
    year,
    segment,
    label,
    startIso: start.toISOString(),
    endIso: end.toISOString(),
    granularity: type === "month" ? "day" : "month",
    start,
    end,
    previousStart: previous.start,
    previousEnd: previous.end,
  };
}

function percentChange(current: number, previous: number) {
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

function encodeCursor(createdAt: Date, id: string) {
  return Buffer.from(`${createdAt.toISOString()}|${id}`, "utf8").toString("base64url");
}

function decodeCursor(cursor?: string) {
  if (!cursor) return null;
  try {
    const [dateValue, id] = Buffer.from(cursor, "base64url").toString("utf8").split("|");
    const date = new Date(dateValue);
    return id && !Number.isNaN(date.getTime()) ? { date, id } : null;
  } catch {
    return null;
  }
}

function toRanking(
  rows: { id: string; label: string; value: string | number; secondary: string | number }[],
): RankingItem[] {
  return rows.map((row) => ({
    id: row.id,
    label: row.label,
    value: Number(row.value),
    secondary: Number(row.secondary),
  }));
}

async function getMovementTrace(
  organizationId: string,
  start: Date,
  end: Date,
  cursorValue?: string,
) {
  const cursor = decodeCursor(cursorValue);
  const cashEntries = await getCashEntriesPage(
    organizationId,
    start,
    end,
    cursor ? { createdAt: cursor.date, id: cursor.id } : undefined,
    PAGE_SIZE + 1,
  );
  const hasNextPage = cashEntries.length > PAGE_SIZE;
  const pageEntries = cashEntries.slice(0, PAGE_SIZE);
  const transactionIds = [...new Set(pageEntries.map((entry) => entry.transactionId))];
  if (transactionIds.length === 0)
    return { movements: [] as AnalyticsMovement[], nextCursor: null };

  const rows = await db
    .select({
      id: transactions.id,
      type: transactions.type,
      amount: transactions.totalAmount,
      paidAmount: transactions.paidAmount,
      status: transactions.status,
      paymentMethod: transactions.paymentMethod,
      notes: transactions.notes,
      createdAt: transactions.createdAt,
      clientFirstName: clients.firstName,
      clientLastName: clients.lastName,
    })
    .from(transactions)
    .leftJoin(clients, eq(transactions.clientId, clients.id))
    .where(
      and(
        eq(transactions.organizationId, organizationId),
        inArray(transactions.id, transactionIds),
      ),
    );

  const [itemRows, paymentRows, logRows] = await Promise.all([
    db
      .select()
      .from(transactionItems)
      .where(inArray(transactionItems.transactionId, transactionIds)),
    db
      .select()
      .from(transactionPayments)
      .where(inArray(transactionPayments.transactionId, transactionIds))
      .orderBy(transactionPayments.createdAt),
    db
      .select({ entityId: auditLogs.entityId, details: auditLogs.details })
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.organizationId, organizationId),
          eq(auditLogs.entityType, "TRANSACTION"),
          inArray(auditLogs.entityId, transactionIds),
        ),
      ),
  ]);

  const serviceIds = [
    ...new Set(itemRows.filter((item) => item.itemType === "SERVICE").map((item) => item.itemId)),
  ];
  const productIds = [
    ...new Set(itemRows.filter((item) => item.itemType === "PRODUCT").map((item) => item.itemId)),
  ];
  const [serviceRows, productRows] = await Promise.all([
    serviceIds.length
      ? db
          .select({ id: services.id, name: services.name })
          .from(services)
          .where(and(eq(services.organizationId, organizationId), inArray(services.id, serviceIds)))
      : [],
    productIds.length
      ? db
          .select({ id: products.id, name: products.name })
          .from(products)
          .where(and(eq(products.organizationId, organizationId), inArray(products.id, productIds)))
      : [],
  ]);
  const itemNames = new Map([...serviceRows, ...productRows].map((item) => [item.id, item.name]));
  const expenseDescriptions = new Map(
    logRows.filter((log) => log.entityId).map((log) => [log.entityId as string, log.details]),
  );

  const rowsById = new Map(rows.map((row) => [row.id, row]));
  const movements = pageEntries.flatMap((entry): AnalyticsMovement[] => {
    const row = rowsById.get(entry.transactionId);
    if (!row) return [];
    const items = itemRows
      .filter((item) => item.transactionId === row.id)
      .map((item) => ({
        name: itemNames.get(item.itemId) || (item.itemType === "SERVICE" ? "Servicio" : "Producto"),
        type: item.itemType,
        quantity: Number(item.quantity),
        unitPrice: Number(item.unitPrice),
        subtotal: Number(item.subtotal),
      }));
    const description =
      row.type === "EXPENSE"
        ? row.notes || expenseDescriptions.get(row.id) || "Gasto sin descripción"
        : items.length > 0
          ? items
              .map((item) => (item.quantity === 1 ? item.name : `${item.quantity} × ${item.name}`))
              .join(", ")
          : row.notes?.replace(/\s+para\s+.+$/i, "").trim() || "Venta sin detalle registrado";

    return [
      {
        id: `${entry.source.toLowerCase()}:${entry.id}`,
        type: row.type,
        amount: Number(entry.amount),
        paidAmount: Number(entry.amount),
        status: "COMPLETED",
        paymentMethod: entry.paymentMethod,
        clientName:
          row.type === "EXPENSE"
            ? "No aplica"
            : row.clientFirstName
              ? `${row.clientFirstName} ${row.clientLastName || ""}`.trim()
              : "Cliente general",
        description,
        createdAt: entry.createdAt.toISOString(),
        items,
        payments: paymentRows
          .filter((payment) => payment.transactionId === row.id)
          .map((payment) => ({
            amount: Number(payment.amount),
            method: payment.paymentMethod,
            createdAt: payment.createdAt.toISOString(),
          })),
      },
    ];
  });
  const lastEntry = pageEntries[pageEntries.length - 1];
  return {
    movements,
    nextCursor: hasNextPage && lastEntry ? encodeCursor(lastEntry.createdAt, lastEntry.id) : null,
  };
}

export async function getAnalyticsData(
  organizationId: string,
  filters: AnalyticsFilters,
): Promise<AnalyticsData> {
  const resolved = resolveAnalyticsPeriod(filters);
  const periodCondition = and(
    eq(transactions.organizationId, organizationId),
    gte(transactions.createdAt, resolved.start),
    lt(transactions.createdAt, resolved.end),
  );
  const expenseDescription = sql<string>`coalesce(${transactions.notes}, ${auditLogs.details}, 'Gasto sin descripción')`;

  const outstandingQuery = db
    .select({
      outstanding: sql<string>`coalesce(sum(case when ${transactions.type} = 'INCOME' and ${transactions.status} = 'PENDING' then ${transactions.totalAmount} - ${transactions.paidAmount} else 0 end), 0)`,
    })
    .from(transactions)
    .where(periodCondition);

  const [currentCashSummary, previousCashSummary] = await Promise.all([
    getCashFlowSummary(organizationId, resolved.start, resolved.end, resolved.granularity),
    getCashFlowSummary(
      organizationId,
      resolved.previousStart,
      resolved.previousEnd,
      resolved.granularity,
    ),
  ]);

  const [
    outstandingRows,
    serviceRows,
    productRows,
    clientRows,
    expenseRows,
    demandRows,
    yearRows,
    trace,
  ] = await Promise.all([
    outstandingQuery,
    db
      .select({
        id: transactionItems.itemId,
        label: sql<string>`coalesce(${services.name}, 'Servicio eliminado')`,
        value: sql<string>`coalesce(sum(${transactionItems.quantity}), 0)`,
        secondary: sql<string>`coalesce(sum(${transactionItems.subtotal}), 0)`,
      })
      .from(transactionItems)
      .innerJoin(transactions, eq(transactionItems.transactionId, transactions.id))
      .leftJoin(services, eq(transactionItems.itemId, services.id))
      .where(and(periodCondition, eq(transactionItems.itemType, "SERVICE")))
      .groupBy(transactionItems.itemId, services.name)
      .orderBy(desc(sql`sum(${transactionItems.quantity})`))
      .limit(6),
    db
      .select({
        id: transactionItems.itemId,
        label: sql<string>`coalesce(${products.name}, 'Producto eliminado')`,
        value: sql<string>`coalesce(sum(${transactionItems.quantity}), 0)`,
        secondary: sql<string>`coalesce(sum(${transactionItems.subtotal}), 0)`,
      })
      .from(transactionItems)
      .innerJoin(transactions, eq(transactionItems.transactionId, transactions.id))
      .leftJoin(products, eq(transactionItems.itemId, products.id))
      .where(and(periodCondition, eq(transactionItems.itemType, "PRODUCT")))
      .groupBy(transactionItems.itemId, products.name)
      .orderBy(desc(sql`sum(${transactionItems.quantity})`))
      .limit(6),
    db
      .select({
        id: clients.id,
        label: sql<string>`concat(${clients.firstName}, case when ${clients.lastName} is not null then concat(' ', ${clients.lastName}) else '' end)`,
        value: sql<string>`coalesce(sum(${transactions.totalAmount}), 0)`,
        secondary: sql<number>`count(${transactions.id})::int`,
      })
      .from(transactions)
      .innerJoin(clients, eq(transactions.clientId, clients.id))
      .where(and(periodCondition, eq(transactions.type, "INCOME")))
      .groupBy(clients.id, clients.firstName, clients.lastName)
      .orderBy(desc(sql`sum(${transactions.totalAmount})`))
      .limit(6),
    db
      .select({
        id: expenseDescription,
        label: expenseDescription,
        value: sql<string>`coalesce(sum(${transactions.totalAmount}), 0)`,
        secondary: sql<number>`count(${transactions.id})::int`,
      })
      .from(transactions)
      .leftJoin(
        auditLogs,
        and(
          eq(auditLogs.organizationId, organizationId),
          eq(auditLogs.entityType, "TRANSACTION"),
          eq(auditLogs.entityId, transactions.id),
        ),
      )
      .where(and(periodCondition, eq(transactions.type, "EXPENSE")))
      .groupBy(expenseDescription)
      .orderBy(desc(sql`sum(${transactions.totalAmount})`))
      .limit(6),
    db
      .select({
        day: sql<number>`extract(isodow from timezone('America/Bogota', ${appointments.startTime}))::int`,
        hour: sql<number>`extract(hour from timezone('America/Bogota', ${appointments.startTime}))::int`,
        value: sql<number>`count(*)::int`,
      })
      .from(appointments)
      .where(
        and(
          eq(appointments.organizationId, organizationId),
          gte(appointments.startTime, resolved.start),
          lt(appointments.startTime, resolved.end),
          ne(appointments.status, "CANCELLED"),
        ),
      )
      .groupBy(
        sql`extract(isodow from timezone('America/Bogota', ${appointments.startTime}))`,
        sql`extract(hour from timezone('America/Bogota', ${appointments.startTime}))`,
      ),
    db
      .select({
        year: sql<number>`extract(year from timezone('America/Bogota', ${transactions.createdAt}))::int`,
      })
      .from(transactions)
      .where(eq(transactions.organizationId, organizationId))
      .groupBy(sql`extract(year from timezone('America/Bogota', ${transactions.createdAt}))`)
      .orderBy(desc(sql`extract(year from timezone('America/Bogota', ${transactions.createdAt}))`)),
    getMovementTrace(organizationId, resolved.start, resolved.end, filters.cursor),
  ]);

  const { income, expenses, movements, incomeMovements, trend } = currentCashSummary;
  const previousIncome = previousCashSummary.income;
  const previousExpenses = previousCashSummary.expenses;

  return {
    period: {
      type: resolved.type,
      year: resolved.year,
      segment: resolved.segment,
      label: resolved.label,
      startIso: resolved.startIso,
      endIso: resolved.endIso,
      granularity: resolved.granularity,
    },
    availableYears: [...new Set([resolved.year, ...yearRows.map((row) => Number(row.year))])].sort(
      (a, b) => b - a,
    ),
    metrics: {
      income,
      expenses,
      net: income - expenses,
      transactions: movements,
      averageTicket: incomeMovements > 0 ? income / incomeMovements : 0,
      outstanding: Number(outstandingRows[0]?.outstanding || 0),
      incomeChange: percentChange(income, previousIncome),
      expenseChange: percentChange(expenses, previousExpenses),
      netChange: percentChange(income - expenses, previousIncome - previousExpenses),
    },
    trend,
    topServices: toRanking(serviceRows),
    topProducts: toRanking(productRows),
    topClients: toRanking(clientRows),
    topExpenses: toRanking(expenseRows),
    demand: demandRows.map((row): DemandPoint => ({
      day: Number(row.day),
      hour: Number(row.hour),
      value: Number(row.value),
    })),
    movements: trace.movements,
    nextCursor: trace.nextCursor,
  };
}
