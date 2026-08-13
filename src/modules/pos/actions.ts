"use server";

import { requireActor } from "@/core/auth/server/actor";
import { db } from "@/core/database/db";
import {
  auditLogs,
  products,
  services,
  transactionItems,
  transactions,
} from "@/core/database/schema";
import { getErrorMessage } from "@/core/errors";
import { getCashEntries } from "@/modules/pos/cash-flow";
import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { buildFinancialReportCsv } from "./domain/csv";
import {
  cartSchema,
  descriptionSchema,
  moneySchema,
  nonNegativeMoneySchema,
  optionalClientIdSchema,
  paymentMethodSchema,
  reportRangeSchema,
  resourceIdSchema,
  settledPaymentMethodSchema,
  transactionUpdateSchema,
} from "./domain/schemas";
import {
  createExpense,
  createSale,
  editTransaction,
  recordClientPayment,
  recordTransactionPayment,
  removeTransaction,
} from "./server/ledger";

export type CartItem = {
  id: string;
  type: "PRODUCT" | "SERVICE";
  name: string;
  price: number;
  quantity: number;
  staffId?: string;
};

function revalidateFinancialViews({ inventory = false, agenda = false } = {}) {
  revalidatePath("/pos");
  revalidatePath("/dashboard");
  revalidatePath("/clientes");
  revalidatePath("/analitica");
  if (inventory) revalidatePath("/inventario");
  if (agenda) revalidatePath("/agenda");
}

export async function processSale(
  cart: CartItem[],
  clientId: string | null,
  paymentMethod: string,
  appointmentId?: string,
  initialPaidAmount?: number,
  initialPaymentMethod?: string,
) {
  try {
    const { organizationId } = await requireActor();
    const parsedCart = cartSchema.parse(cart);
    const validClientId = optionalClientIdSchema.parse(clientId);
    const validPaymentMethod = paymentMethodSchema.parse(paymentMethod);
    const validAppointmentId = appointmentId ? resourceIdSchema.parse(appointmentId) : null;
    const validInitialPaymentMethod = initialPaymentMethod
      ? settledPaymentMethodSchema.parse(initialPaymentMethod)
      : "CASH";
    const validInitialAmount =
      validPaymentMethod === "CREDIT"
        ? nonNegativeMoneySchema.parse(initialPaidAmount ?? 0)
        : undefined;

    const result = await createSale({
      organizationId,
      cart: parsedCart,
      clientId: validClientId,
      paymentMethod: validPaymentMethod,
      appointmentId: validAppointmentId,
      initialPaidAmount: validInitialAmount,
      initialPaymentMethod: validInitialPaymentMethod,
    });

    revalidateFinancialViews({ inventory: true, agenda: Boolean(validAppointmentId) });
    return { success: true, transactionId: result.transactionId };
  } catch (error: unknown) {
    console.error("Error processSale:", error);
    return { success: false, error: getErrorMessage(error) };
  }
}

export async function registerExpense(amount: number, description: string, paymentMethod: string) {
  try {
    const actor = await requireActor();
    await createExpense({
      organizationId: actor.organizationId,
      userId: actor.userId,
      amount: moneySchema.parse(amount),
      description: descriptionSchema.parse(description),
      paymentMethod: settledPaymentMethodSchema.parse(paymentMethod),
    });
    revalidateFinancialViews();
    return { success: true };
  } catch (error: unknown) {
    console.error("Error registerExpense:", error);
    return { success: false, error: getErrorMessage(error) };
  }
}

export async function registerPayment(
  transactionId: string,
  amount: number,
  paymentMethod: string,
) {
  try {
    const { organizationId } = await requireActor();
    const result = await recordTransactionPayment({
      organizationId,
      transactionId: resourceIdSchema.parse(transactionId),
      amount: moneySchema.parse(amount),
      paymentMethod: settledPaymentMethodSchema.parse(paymentMethod),
    });
    revalidateFinancialViews();
    return { success: true, newStatus: result.newStatus };
  } catch (error: unknown) {
    console.error("Error registerPayment:", error);
    return { success: false, error: getErrorMessage(error) };
  }
}

export async function registerClientPayment(
  clientId: string,
  amount: number,
  paymentMethod: string,
) {
  try {
    const { organizationId } = await requireActor();
    const result = await recordClientPayment({
      organizationId,
      clientId: resourceIdSchema.parse(clientId),
      amount: moneySchema.parse(amount),
      paymentMethod: settledPaymentMethodSchema.parse(paymentMethod),
    });
    revalidateFinancialViews();
    return { success: true, allocationCount: result.allocationCount };
  } catch (error: unknown) {
    console.error("Error registerClientPayment:", error);
    return { success: false, error: getErrorMessage(error) };
  }
}

export async function updateTransaction(transactionId: string, formData: FormData) {
  try {
    const { organizationId } = await requireActor();
    const input = transactionUpdateSchema.parse({
      transactionId,
      totalAmount: Number(formData.get("totalAmount")),
      paymentMethod: formData.get("paymentMethod"),
      clientId: formData.get("clientId") || null,
      description: formData.get("description") || "",
    });
    await editTransaction({ organizationId, ...input });
    revalidateFinancialViews();
    return { success: true };
  } catch (error: unknown) {
    return { success: false, error: getErrorMessage(error) };
  }
}

export async function deleteTransaction(transactionId: string) {
  try {
    const { organizationId } = await requireActor();
    await removeTransaction({
      organizationId,
      transactionId: resourceIdSchema.parse(transactionId),
    });
    revalidateFinancialViews({ inventory: true });
    return { success: true };
  } catch (error: unknown) {
    return { success: false, error: getErrorMessage(error) };
  }
}

export async function exportFinancialReport(startDate: string, endDate: string) {
  try {
    const { organizationId } = await requireActor();
    const { start, end } = reportRangeSchema.parse({ start: startDate, end: endDate });
    const entries = await getCashEntries(organizationId, start, new Date(end.getTime() + 1));
    const transactionIds = [...new Set(entries.map((entry) => entry.transactionId))];

    if (transactionIds.length === 0) {
      return { success: true, csv: buildFinancialReportCsv([]) };
    }

    const [transactionRows, itemRows, productRows, serviceRows, expenseRows] = await Promise.all([
      db
        .select()
        .from(transactions)
        .where(
          and(
            eq(transactions.organizationId, organizationId),
            inArray(transactions.id, transactionIds),
          ),
        ),
      db
        .select()
        .from(transactionItems)
        .where(inArray(transactionItems.transactionId, transactionIds)),
      db
        .select({ id: products.id, name: products.name })
        .from(products)
        .where(eq(products.organizationId, organizationId)),
      db
        .select({ id: services.id, name: services.name })
        .from(services)
        .where(eq(services.organizationId, organizationId)),
      db
        .select({ entityId: auditLogs.entityId, details: auditLogs.details })
        .from(auditLogs)
        .where(
          and(
            eq(auditLogs.organizationId, organizationId),
            eq(auditLogs.action, "REGISTER_EXPENSE"),
            inArray(auditLogs.entityId, transactionIds),
          ),
        ),
    ]);

    const transactionsById = new Map(
      transactionRows.map((transaction) => [transaction.id, transaction]),
    );
    const namesById = new Map([...productRows, ...serviceRows].map((item) => [item.id, item.name]));
    const descriptionsById = new Map<string, string>();
    for (const log of expenseRows) {
      if (log.entityId) descriptionsById.set(log.entityId, log.details ?? "");
    }
    const itemsByTransaction = new Map<string, typeof itemRows>();
    for (const item of itemRows) {
      const group = itemsByTransaction.get(item.transactionId) ?? [];
      group.push(item);
      itemsByTransaction.set(item.transactionId, group);
    }

    const reportEntries = entries.flatMap((entry) => {
      const transaction = transactionsById.get(entry.transactionId);
      if (!transaction) return [];
      return [
        {
          entry,
          transaction,
          description: descriptionsById.get(transaction.id) || transaction.notes,
          items: (itemsByTransaction.get(transaction.id) ?? []).map((item) => ({
            name:
              namesById.get(item.itemId) ||
              (item.itemType === "SERVICE" ? "Servicio eliminado" : "Producto eliminado"),
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            subtotal: item.subtotal,
          })),
        },
      ];
    });

    return { success: true, csv: buildFinancialReportCsv(reportEntries) };
  } catch (error: unknown) {
    console.error("Error exportFinancialReport:", error);
    return { success: false, error: getErrorMessage(error) };
  }
}
