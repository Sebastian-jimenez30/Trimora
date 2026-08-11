import "server-only";

import { db } from "@/core/database/db";
import { transactionPayments, transactions } from "@/core/database/schema";
import { and, desc, eq, gt, gte, lt, notExists, or, sql, type SQL } from "drizzle-orm";

export type CashEntry = {
  id: string;
  transactionId: string;
  paymentId: string | null;
  type: string;
  amount: string;
  paymentMethod: string | null;
  createdAt: Date;
  source: "TRANSACTION" | "PAYMENT";
};

export type CashEntryCursor = {
  createdAt: Date;
  id: string;
};

export type CashFlowSummary = {
  income: number;
  expenses: number;
  movements: number;
  incomeMovements: number;
  trend: Array<{
    label: string;
    income: number;
    expenses: number;
    net: number;
  }>;
};

function getDirectConditions(
  organizationId: string,
  start?: Date,
  end?: Date,
  cursor?: CashEntryCursor,
) {
  const conditions: SQL[] = [eq(transactions.organizationId, organizationId)];
  if (start) conditions.push(gte(transactions.createdAt, start));
  if (end) conditions.push(lt(transactions.createdAt, end));
  if (cursor) {
    conditions.push(
      or(
        lt(transactions.createdAt, cursor.createdAt),
        and(
          eq(transactions.createdAt, cursor.createdAt),
          sql`('T:' || ${transactions.id}::text) < ${cursor.id}`,
        ),
      )!,
    );
  }

  const paymentExists = db
    .select({ id: transactionPayments.id })
    .from(transactionPayments)
    .where(eq(transactionPayments.transactionId, transactions.id));

  conditions.push(
    or(
      eq(transactions.type, "EXPENSE"),
      and(
        eq(transactions.type, "INCOME"),
        or(gt(transactions.paidAmount, "0"), eq(transactions.status, "COMPLETED")),
        notExists(paymentExists),
      ),
    )!,
  );

  return and(...conditions);
}

function getPaymentConditions(
  organizationId: string,
  start?: Date,
  end?: Date,
  cursor?: CashEntryCursor,
) {
  const conditions: SQL[] = [
    eq(transactions.organizationId, organizationId),
    eq(transactions.type, "INCOME"),
  ];
  if (start) conditions.push(gte(transactionPayments.createdAt, start));
  if (end) conditions.push(lt(transactionPayments.createdAt, end));
  if (cursor) {
    conditions.push(
      or(
        lt(transactionPayments.createdAt, cursor.createdAt),
        and(
          eq(transactionPayments.createdAt, cursor.createdAt),
          sql`('P:' || ${transactionPayments.id}::text) < ${cursor.id}`,
        ),
      )!,
    );
  }
  return and(...conditions);
}

function compareCashEntries(first: CashEntry, second: CashEntry) {
  return (
    second.createdAt.getTime() - first.createdAt.getTime() || second.id.localeCompare(first.id)
  );
}

function mapDirectEntry(row: {
  id: string;
  transactionId: string;
  type: string;
  amount: string;
  paymentMethod: string | null;
  createdAt: Date;
}): CashEntry {
  return { ...row, paymentId: null, source: "TRANSACTION" };
}

function mapPaymentEntry(row: {
  id: string;
  paymentId: string;
  transactionId: string;
  type: string;
  amount: string;
  paymentMethod: string;
  createdAt: Date;
}): CashEntry {
  return { ...row, source: "PAYMENT" };
}

function selectDirectEntries(
  organizationId: string,
  start?: Date,
  end?: Date,
  cursor?: CashEntryCursor,
) {
  return db
    .select({
      id: sql<string>`'T:' || ${transactions.id}::text`,
      transactionId: transactions.id,
      type: transactions.type,
      amount: sql<string>`case
      when ${transactions.type} = 'INCOME' and ${transactions.paidAmount} > 0 then ${transactions.paidAmount}
      else ${transactions.totalAmount}
    end`,
      paymentMethod: transactions.paymentMethod,
      createdAt: transactions.createdAt,
    })
    .from(transactions)
    .where(getDirectConditions(organizationId, start, end, cursor));
}

function selectPaymentEntries(
  organizationId: string,
  start?: Date,
  end?: Date,
  cursor?: CashEntryCursor,
) {
  return db
    .select({
      id: sql<string>`'P:' || ${transactionPayments.id}::text`,
      paymentId: transactionPayments.id,
      transactionId: transactionPayments.transactionId,
      type: transactions.type,
      amount: transactionPayments.amount,
      paymentMethod: transactionPayments.paymentMethod,
      createdAt: transactionPayments.createdAt,
    })
    .from(transactionPayments)
    .innerJoin(transactions, eq(transactionPayments.transactionId, transactions.id))
    .where(getPaymentConditions(organizationId, start, end, cursor));
}

export async function getCashEntries(
  organizationId: string,
  start?: Date,
  end?: Date,
): Promise<CashEntry[]> {
  const [directRows, paymentRows] = await Promise.all([
    selectDirectEntries(organizationId, start, end),
    selectPaymentEntries(organizationId, start, end),
  ]);

  return [...directRows.map(mapDirectEntry), ...paymentRows.map(mapPaymentEntry)].sort(
    compareCashEntries,
  );
}

export async function getCashEntriesPage(
  organizationId: string,
  start: Date,
  end: Date,
  cursor: CashEntryCursor | undefined,
  limit: number,
): Promise<CashEntry[]> {
  const [directRows, paymentRows] = await Promise.all([
    selectDirectEntries(organizationId, start, end, cursor)
      .orderBy(desc(transactions.createdAt), desc(transactions.id))
      .limit(limit),
    selectPaymentEntries(organizationId, start, end, cursor)
      .orderBy(desc(transactionPayments.createdAt), desc(transactionPayments.id))
      .limit(limit),
  ]);

  return [...directRows.map(mapDirectEntry), ...paymentRows.map(mapPaymentEntry)]
    .sort(compareCashEntries)
    .slice(0, limit);
}

export async function getCashFlowSummary(
  organizationId: string,
  start: Date,
  end: Date,
  granularity: "day" | "month",
): Promise<CashFlowSummary> {
  const directBucket =
    granularity === "day"
      ? sql<string>`to_char(date_trunc('day', timezone('America/Bogota', ${transactions.createdAt})), 'YYYY-MM-DD')`
      : sql<string>`to_char(date_trunc('month', timezone('America/Bogota', ${transactions.createdAt})), 'YYYY-MM')`;
  const paymentBucket =
    granularity === "day"
      ? sql<string>`to_char(date_trunc('day', timezone('America/Bogota', ${transactionPayments.createdAt})), 'YYYY-MM-DD')`
      : sql<string>`to_char(date_trunc('month', timezone('America/Bogota', ${transactionPayments.createdAt})), 'YYYY-MM')`;

  const [directRows, paymentRows] = await Promise.all([
    db
      .select({
        label: directBucket,
        income: sql<string>`coalesce(sum(case
        when ${transactions.type} = 'INCOME' then case
          when ${transactions.paidAmount} > 0 then ${transactions.paidAmount}
          else ${transactions.totalAmount}
        end
        else 0
      end), 0)`,
        expenses: sql<string>`coalesce(sum(case when ${transactions.type} = 'EXPENSE' then ${transactions.totalAmount} else 0 end), 0)`,
        movements: sql<number>`count(*)::int`,
        incomeMovements: sql<number>`count(*) filter (where ${transactions.type} = 'INCOME')::int`,
      })
      .from(transactions)
      .where(getDirectConditions(organizationId, start, end))
      .groupBy(directBucket),
    db
      .select({
        label: paymentBucket,
        income: sql<string>`coalesce(sum(${transactionPayments.amount}), 0)`,
        expenses: sql<string>`0`,
        movements: sql<number>`count(*)::int`,
        incomeMovements: sql<number>`count(*)::int`,
      })
      .from(transactionPayments)
      .innerJoin(transactions, eq(transactionPayments.transactionId, transactions.id))
      .where(getPaymentConditions(organizationId, start, end))
      .groupBy(paymentBucket),
  ]);

  const buckets = new Map<string, CashFlowSummary["trend"][number]>();
  let movements = 0;
  let incomeMovements = 0;

  for (const row of [...directRows, ...paymentRows]) {
    const current = buckets.get(row.label) ?? { label: row.label, income: 0, expenses: 0, net: 0 };
    current.income += Number(row.income);
    current.expenses += Number(row.expenses);
    current.net = current.income - current.expenses;
    buckets.set(row.label, current);
    movements += Number(row.movements);
    incomeMovements += Number(row.incomeMovements);
  }

  const trend = [...buckets.values()].sort((first, second) =>
    first.label.localeCompare(second.label),
  );
  const income = trend.reduce((total, point) => total + point.income, 0);
  const expenses = trend.reduce((total, point) => total + point.expenses, 0);

  return { income, expenses, movements, incomeMovements, trend };
}
