import "server-only";

import { db } from "@/core/database/db";
import {
  appointments,
  auditLogs,
  clients,
  inventoryMovements,
  organizationMembers,
  products,
  serviceMaterials,
  services,
  transactionItems,
  transactionPayments,
  transactions,
} from "@/core/database/schema";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { fromMoneyCents, fromQuantityUnits, toMoneyCents, toQuantityUnits } from "../domain/money";

export type LedgerDatabase = typeof db;
export type SettledPaymentMethod = "CASH" | "CARD" | "TRANSFER";
export type SalePaymentMethod = SettledPaymentMethod | "CREDIT";

export type SaleLine = {
  id: string;
  type: "PRODUCT" | "SERVICE";
  quantity: number;
  staffId?: string;
};

export type CreateSaleInput = {
  organizationId: string;
  cart: SaleLine[];
  clientId: string | null;
  paymentMethod: SalePaymentMethod;
  appointmentId?: string | null;
  initialPaidAmount?: number;
  initialPaymentMethod?: SettledPaymentMethod;
  receivedAt?: Date;
};

export type SaleExecutionHooks = {
  afterTransactionCreated?: (transactionId: string) => void | Promise<void>;
  afterInventoryUpdated?: (transactionId: string) => void | Promise<void>;
};

type TrustedSaleLine = SaleLine & {
  name: string;
  unitPriceCents: number;
};

function itemQuantity(value: number) {
  const scaled = Math.round(value * 100);
  if (!Number.isSafeInteger(scaled) || scaled <= 0 || Math.abs(scaled / 100 - value) > 1e-9) {
    throw new Error("Las cantidades vendidas admiten maximo dos decimales");
  }
  return (scaled / 100).toFixed(2);
}

function addConsumption(target: Map<string, number>, productId: string, quantity: number | string) {
  const next = (target.get(productId) ?? 0) + toQuantityUnits(quantity);
  if (!Number.isSafeInteger(next) || next <= 0)
    throw new Error("La cantidad consumida no es valida");
  target.set(productId, next);
}

export async function createSale(
  input: CreateSaleInput,
  options: { database?: LedgerDatabase; hooks?: SaleExecutionHooks } = {},
) {
  const database = options.database ?? db;
  const receivedAt = input.receivedAt ?? new Date();

  return database.transaction(async (tx) => {
    if (input.cart.length === 0) throw new Error("La venta debe incluir al menos un articulo");
    if (input.paymentMethod === "CREDIT" && !input.clientId) {
      throw new Error("Debe seleccionar un cliente para las ventas a credito");
    }

    const productIds = [
      ...new Set(input.cart.filter((line) => line.type === "PRODUCT").map((line) => line.id)),
    ];
    const serviceIds = [
      ...new Set(input.cart.filter((line) => line.type === "SERVICE").map((line) => line.id)),
    ];
    const staffIds = [
      ...new Set(input.cart.flatMap((line) => (line.staffId ? [line.staffId] : []))),
    ];

    const [clientRows, appointmentRows, staffRows, catalogProducts, catalogServices] =
      await Promise.all([
        input.clientId
          ? tx
              .select({ id: clients.id })
              .from(clients)
              .where(
                and(
                  eq(clients.id, input.clientId),
                  eq(clients.organizationId, input.organizationId),
                ),
              )
          : [],
        input.appointmentId
          ? tx
              .select({ id: appointments.id })
              .from(appointments)
              .where(
                and(
                  eq(appointments.id, input.appointmentId),
                  eq(appointments.organizationId, input.organizationId),
                ),
              )
          : [],
        staffIds.length
          ? tx
              .select({ id: organizationMembers.id })
              .from(organizationMembers)
              .where(
                and(
                  eq(organizationMembers.organizationId, input.organizationId),
                  inArray(organizationMembers.id, staffIds),
                ),
              )
          : [],
        productIds.length
          ? tx
              .select({ id: products.id, name: products.name, price: products.salePrice })
              .from(products)
              .where(
                and(
                  eq(products.organizationId, input.organizationId),
                  inArray(products.id, productIds),
                ),
              )
          : [],
        serviceIds.length
          ? tx
              .select({ id: services.id, name: services.name, price: services.price })
              .from(services)
              .where(
                and(
                  eq(services.organizationId, input.organizationId),
                  inArray(services.id, serviceIds),
                ),
              )
          : [],
      ]);

    if (input.clientId && clientRows.length !== 1)
      throw new Error("El cliente no pertenece a la organizacion");
    if (input.appointmentId && appointmentRows.length !== 1)
      throw new Error("La cita no pertenece a la organizacion");
    if (staffRows.length !== staffIds.length)
      throw new Error("El colaborador no pertenece a la organizacion");
    if (
      catalogProducts.length !== productIds.length ||
      catalogServices.length !== serviceIds.length
    ) {
      throw new Error("Uno de los articulos no pertenece a la organizacion");
    }

    const productCatalog = new Map(catalogProducts.map((row) => [row.id, row]));
    const serviceCatalog = new Map(catalogServices.map((row) => [row.id, row]));
    const trustedCart: TrustedSaleLine[] = input.cart.map((line) => {
      const catalog =
        line.type === "PRODUCT" ? productCatalog.get(line.id) : serviceCatalog.get(line.id);
      if (!catalog || catalog.price === null)
        throw new Error("El articulo no tiene un precio valido");
      itemQuantity(line.quantity);
      return {
        ...line,
        name: catalog.name,
        unitPriceCents: toMoneyCents(catalog.price),
      };
    });

    const totalCents = trustedCart.reduce((total, line) => {
      const lineCents = Math.round(line.unitPriceCents * line.quantity);
      if (!Number.isSafeInteger(lineCents))
        throw new Error("El total de la venta excede el rango permitido");
      return total + lineCents;
    }, 0);
    if (totalCents <= 0) throw new Error("El total de la venta debe ser mayor a cero");

    const paidCents =
      input.paymentMethod === "CREDIT" ? toMoneyCents(input.initialPaidAmount ?? 0) : totalCents;
    if (paidCents < 0 || paidCents > totalCents) {
      throw new Error("El abono inicial no puede ser mayor al total de la venta");
    }

    const materials = serviceIds.length
      ? await tx
          .select({
            serviceId: serviceMaterials.serviceId,
            productId: serviceMaterials.productId,
            quantityUsed: serviceMaterials.quantityUsed,
          })
          .from(serviceMaterials)
          .where(inArray(serviceMaterials.serviceId, serviceIds))
      : [];
    const materialsByService = new Map<string, typeof materials>();
    for (const material of materials) {
      const group = materialsByService.get(material.serviceId) ?? [];
      group.push(material);
      materialsByService.set(material.serviceId, group);
    }

    const consumption = new Map<string, number>();
    for (const line of trustedCart) {
      if (line.type === "PRODUCT") {
        addConsumption(consumption, line.id, line.quantity);
        continue;
      }
      for (const material of materialsByService.get(line.id) ?? []) {
        const quantityUnits = toQuantityUnits(material.quantityUsed) * line.quantity;
        if (!Number.isSafeInteger(quantityUnits))
          throw new Error("El consumo calculado no es valido");
        addConsumption(consumption, material.productId, quantityUnits / 10_000);
      }
    }

    const consumptionIds = [...consumption.keys()].sort();
    const lockedProducts = consumptionIds.length
      ? await tx
          .select({ id: products.id, name: products.name, currentStock: products.currentStock })
          .from(products)
          .where(
            and(
              eq(products.organizationId, input.organizationId),
              inArray(products.id, consumptionIds),
            ),
          )
          .orderBy(asc(products.id))
          .for("update")
      : [];
    if (lockedProducts.length !== consumptionIds.length) {
      throw new Error("Uno de los productos de inventario ya no esta disponible");
    }

    const stockByProduct = new Map(lockedProducts.map((product) => [product.id, product]));
    for (const productId of consumptionIds) {
      const product = stockByProduct.get(productId);
      const required = consumption.get(productId) ?? 0;
      if (!product) throw new Error("Producto de inventario no encontrado");
      if (toQuantityUnits(product.currentStock) < required) {
        throw new Error(`Stock insuficiente para ${product.name}`);
      }
    }

    const [sale] = await tx
      .insert(transactions)
      .values({
        organizationId: input.organizationId,
        clientId: input.clientId,
        type: "INCOME",
        totalAmount: fromMoneyCents(totalCents),
        paymentMethod: input.paymentMethod,
        status: paidCents === totalCents ? "COMPLETED" : "PENDING",
        paidAmount: fromMoneyCents(paidCents),
        createdAt: receivedAt,
      })
      .returning({ id: transactions.id });
    await options.hooks?.afterTransactionCreated?.(sale.id);

    await tx.insert(transactionItems).values(
      trustedCart.map((line) => ({
        transactionId: sale.id,
        itemType: line.type,
        itemId: line.id,
        quantity: itemQuantity(line.quantity),
        unitPrice: fromMoneyCents(line.unitPriceCents),
        subtotal: fromMoneyCents(Math.round(line.unitPriceCents * line.quantity)),
      })),
    );

    if (input.paymentMethod === "CREDIT" && paidCents > 0) {
      await tx.insert(transactionPayments).values({
        transactionId: sale.id,
        amount: fromMoneyCents(paidCents),
        paymentMethod: input.initialPaymentMethod ?? "CASH",
        createdAt: receivedAt,
      });
    }

    for (const productId of consumptionIds) {
      const product = stockByProduct.get(productId)!;
      const previousUnits = toQuantityUnits(product.currentStock);
      const quantityUnits = consumption.get(productId)!;
      const nextUnits = previousUnits - quantityUnits;
      await tx
        .update(products)
        .set({ currentStock: fromQuantityUnits(nextUnits) })
        .where(and(eq(products.id, productId), eq(products.organizationId, input.organizationId)));
      await tx.insert(inventoryMovements).values({
        organizationId: input.organizationId,
        productId,
        transactionId: sale.id,
        type: "OUT",
        quantity: Number(fromQuantityUnits(quantityUnits)),
        previousStock: Number(fromQuantityUnits(previousUnits)),
        newStock: Number(fromQuantityUnits(nextUnits)),
        notes: `SALE transaction ${sale.id}`,
      });
    }
    await options.hooks?.afterInventoryUpdated?.(sale.id);

    if (input.appointmentId) {
      await tx
        .update(appointments)
        .set({ status: "COMPLETED" })
        .where(
          and(
            eq(appointments.id, input.appointmentId),
            eq(appointments.organizationId, input.organizationId),
          ),
        );
    }

    return { transactionId: sale.id, totalAmount: fromMoneyCents(totalCents) };
  });
}

export async function createExpense(input: {
  organizationId: string;
  userId: string;
  amount: number;
  description: string;
  paymentMethod: SettledPaymentMethod;
  receivedAt?: Date;
  database?: LedgerDatabase;
}) {
  const database = input.database ?? db;
  const amount = fromMoneyCents(toMoneyCents(input.amount));

  return database.transaction(async (tx) => {
    const [expense] = await tx
      .insert(transactions)
      .values({
        organizationId: input.organizationId,
        type: "EXPENSE",
        totalAmount: amount,
        paymentMethod: input.paymentMethod,
        status: "COMPLETED",
        createdAt: input.receivedAt ?? new Date(),
      })
      .returning({ id: transactions.id });
    await tx.insert(auditLogs).values({
      organizationId: input.organizationId,
      userId: input.userId,
      action: "REGISTER_EXPENSE",
      entityType: "TRANSACTION",
      entityId: expense.id,
      details: input.description,
    });
    return { transactionId: expense.id };
  });
}

export async function createManualCashEntry(input: {
  organizationId: string;
  type: "INCOME" | "EXPENSE";
  amount: number;
  description: string;
  paymentMethod: SettledPaymentMethod;
  receivedAt?: Date;
  database?: LedgerDatabase;
}) {
  const database = input.database ?? db;
  const amount = fromMoneyCents(toMoneyCents(input.amount));
  return database.transaction(async (tx) => {
    const [entry] = await tx
      .insert(transactions)
      .values({
        organizationId: input.organizationId,
        type: input.type,
        totalAmount: amount,
        paidAmount: input.type === "INCOME" ? amount : "0.00",
        paymentMethod: input.paymentMethod,
        status: "COMPLETED",
        notes: input.description,
        createdAt: input.receivedAt ?? new Date(),
      })
      .returning({ id: transactions.id });
    return { transactionId: entry.id };
  });
}

export async function recordTransactionPayment(input: {
  organizationId: string;
  transactionId: string;
  amount: number;
  paymentMethod: SettledPaymentMethod;
  receivedAt?: Date;
  database?: LedgerDatabase;
}) {
  const database = input.database ?? db;
  const amountCents = toMoneyCents(input.amount);
  if (amountCents <= 0) throw new Error("El abono debe ser mayor a cero");

  return database.transaction(async (tx) => {
    const [transaction] = await tx
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.id, input.transactionId),
          eq(transactions.organizationId, input.organizationId),
          eq(transactions.type, "INCOME"),
        ),
      )
      .for("update");
    if (!transaction) throw new Error("Transaccion no encontrada");

    const currentPaidCents = toMoneyCents(transaction.paidAmount);
    const totalCents = toMoneyCents(transaction.totalAmount);
    if (currentPaidCents >= totalCents)
      throw new Error("La transaccion ya esta pagada por completo");
    if (currentPaidCents + amountCents > totalCents)
      throw new Error("El abono supera la deuda restante");

    const nextPaidCents = currentPaidCents + amountCents;
    const nextStatus = nextPaidCents === totalCents ? "COMPLETED" : "PENDING";
    await tx.insert(transactionPayments).values({
      transactionId: transaction.id,
      amount: fromMoneyCents(amountCents),
      paymentMethod: input.paymentMethod,
      createdAt: input.receivedAt ?? new Date(),
    });
    await tx
      .update(transactions)
      .set({ paidAmount: fromMoneyCents(nextPaidCents), status: nextStatus })
      .where(eq(transactions.id, transaction.id));
    return { newStatus: nextStatus };
  });
}

export async function recordClientPayment(input: {
  organizationId: string;
  clientId: string;
  amount: number;
  paymentMethod: SettledPaymentMethod;
  receivedAt?: Date;
  database?: LedgerDatabase;
}) {
  const database = input.database ?? db;
  const amountCents = toMoneyCents(input.amount);
  if (amountCents <= 0) throw new Error("El abono debe ser mayor a cero");
  const receivedAt = input.receivedAt ?? new Date();

  return database.transaction(async (tx) => {
    const pending = await tx
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.organizationId, input.organizationId),
          eq(transactions.clientId, input.clientId),
          eq(transactions.type, "INCOME"),
          eq(transactions.status, "PENDING"),
        ),
      )
      .orderBy(asc(transactions.createdAt), asc(transactions.id))
      .for("update");
    if (pending.length === 0) throw new Error("El cliente no tiene cuentas pendientes");

    const outstandingCents = pending.reduce(
      (total, transaction) =>
        total + toMoneyCents(transaction.totalAmount) - toMoneyCents(transaction.paidAmount),
      0,
    );
    if (amountCents > outstandingCents)
      throw new Error("El abono supera la deuda total del cliente");

    let remainingCents = amountCents;
    let allocationCount = 0;
    for (const transaction of pending) {
      if (remainingCents === 0) break;
      const paidCents = toMoneyCents(transaction.paidAmount);
      const totalCents = toMoneyCents(transaction.totalAmount);
      const allocationCents = Math.min(remainingCents, totalCents - paidCents);
      if (allocationCents <= 0) continue;

      const nextPaidCents = paidCents + allocationCents;
      await tx.insert(transactionPayments).values({
        transactionId: transaction.id,
        amount: fromMoneyCents(allocationCents),
        paymentMethod: input.paymentMethod,
        createdAt: receivedAt,
      });
      await tx
        .update(transactions)
        .set({
          paidAmount: fromMoneyCents(nextPaidCents),
          status: nextPaidCents === totalCents ? "COMPLETED" : "PENDING",
        })
        .where(eq(transactions.id, transaction.id));
      remainingCents -= allocationCents;
      allocationCount += 1;
    }
    if (remainingCents !== 0) throw new Error("No fue posible distribuir todo el abono");
    return { allocationCount };
  });
}

export async function editTransaction(input: {
  organizationId: string;
  transactionId: string;
  totalAmount: number;
  paymentMethod: SalePaymentMethod;
  clientId: string | null;
  description: string;
  database?: LedgerDatabase;
}) {
  const database = input.database ?? db;
  const totalCents = toMoneyCents(input.totalAmount);
  if (totalCents <= 0) throw new Error("El monto debe ser mayor a cero");

  return database.transaction(async (tx) => {
    const [transaction] = await tx
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.id, input.transactionId),
          eq(transactions.organizationId, input.organizationId),
        ),
      )
      .for("update");
    if (!transaction) throw new Error("Movimiento no encontrado");
    if (transaction.type === "EXPENSE" && input.paymentMethod === "CREDIT")
      throw new Error("Un gasto no puede registrarse como fiado");
    if (transaction.type === "INCOME" && input.paymentMethod === "CREDIT" && !input.clientId)
      throw new Error("Las ventas fiadas deben tener un cliente asignado");
    if (
      transaction.type === "INCOME" &&
      transaction.paymentMethod !== "CREDIT" &&
      input.paymentMethod === "CREDIT"
    ) {
      throw new Error("Una venta cobrada no puede convertirse en deuda");
    }
    if (
      transaction.type === "INCOME" &&
      transaction.status === "PENDING" &&
      input.paymentMethod !== "CREDIT"
    ) {
      throw new Error("Use la opcion de abonar para completar una deuda");
    }

    if (transaction.type === "INCOME" && input.clientId) {
      const [client] = await tx
        .select({ id: clients.id })
        .from(clients)
        .where(
          and(eq(clients.id, input.clientId), eq(clients.organizationId, input.organizationId)),
        );
      if (!client) throw new Error("Cliente no encontrado");
    }

    const paymentRows = await tx
      .select({ amount: transactionPayments.amount })
      .from(transactionPayments)
      .where(eq(transactionPayments.transactionId, transaction.id));
    const settledCents = paymentRows.reduce(
      (sum, payment) => sum + toMoneyCents(payment.amount),
      0,
    );
    if (settledCents > totalCents)
      throw new Error("El monto no puede ser menor que los abonos registrados");

    const nextPaidCents =
      transaction.type === "EXPENSE"
        ? 0
        : input.paymentMethod === "CREDIT"
          ? settledCents
          : totalCents;
    await tx
      .update(transactions)
      .set({
        totalAmount: fromMoneyCents(totalCents),
        paidAmount: fromMoneyCents(nextPaidCents),
        paymentMethod: input.paymentMethod,
        status:
          transaction.type === "EXPENSE" || nextPaidCents === totalCents ? "COMPLETED" : "PENDING",
        clientId: transaction.type === "INCOME" ? input.clientId : null,
      })
      .where(eq(transactions.id, transaction.id));

    if (transaction.type === "EXPENSE") {
      await tx
        .update(auditLogs)
        .set({ details: input.description })
        .where(
          and(
            eq(auditLogs.organizationId, input.organizationId),
            eq(auditLogs.entityId, transaction.id),
            eq(auditLogs.entityType, "TRANSACTION"),
          ),
        );
    }
  });
}

export async function removeTransaction(input: {
  organizationId: string;
  transactionId: string;
  database?: LedgerDatabase;
}) {
  const database = input.database ?? db;

  return database.transaction(async (tx) => {
    const [transaction] = await tx
      .select({ id: transactions.id })
      .from(transactions)
      .where(
        and(
          eq(transactions.id, input.transactionId),
          eq(transactions.organizationId, input.organizationId),
        ),
      )
      .for("update");
    if (!transaction) throw new Error("Movimiento no encontrado");

    const movements = await tx
      .select()
      .from(inventoryMovements)
      .where(
        and(
          eq(inventoryMovements.organizationId, input.organizationId),
          eq(inventoryMovements.transactionId, transaction.id),
        ),
      );
    const productIds = [...new Set(movements.map((movement) => movement.productId))].sort();
    const lockedProducts = productIds.length
      ? await tx
          .select({ id: products.id, currentStock: products.currentStock })
          .from(products)
          .where(
            and(
              eq(products.organizationId, input.organizationId),
              inArray(products.id, productIds),
            ),
          )
          .orderBy(asc(products.id))
          .for("update")
      : [];
    if (lockedProducts.length !== productIds.length)
      throw new Error("No se puede restaurar todo el inventario de la venta");

    const restoredByProduct = new Map<string, number>();
    for (const movement of movements) {
      const quantityUnits = toQuantityUnits(movement.quantity);
      const signedUnits = movement.type === "OUT" ? quantityUnits : -quantityUnits;
      restoredByProduct.set(
        movement.productId,
        (restoredByProduct.get(movement.productId) ?? 0) + signedUnits,
      );
    }
    for (const product of lockedProducts) {
      const nextUnits =
        toQuantityUnits(product.currentStock) + (restoredByProduct.get(product.id) ?? 0);
      if (nextUnits < 0) throw new Error("La eliminacion dejaria un stock negativo");
      await tx
        .update(products)
        .set({ currentStock: fromQuantityUnits(nextUnits) })
        .where(and(eq(products.id, product.id), eq(products.organizationId, input.organizationId)));
    }

    await tx.delete(inventoryMovements).where(eq(inventoryMovements.transactionId, transaction.id));
    await tx
      .delete(transactionPayments)
      .where(eq(transactionPayments.transactionId, transaction.id));
    await tx.delete(transactionItems).where(eq(transactionItems.transactionId, transaction.id));
    await tx
      .delete(auditLogs)
      .where(
        and(
          eq(auditLogs.organizationId, input.organizationId),
          eq(auditLogs.entityId, transaction.id),
        ),
      );
    await tx
      .delete(transactions)
      .where(
        and(
          eq(transactions.id, transaction.id),
          eq(transactions.organizationId, input.organizationId),
        ),
      );
  });
}

export async function rebuildClientTotals(organizationId: string, database: LedgerDatabase = db) {
  await database.execute(sql`
    update public.clients as client
    set total_spent = coalesce((
      select sum(tx.total_amount)
      from public.transactions as tx
      where tx.organization_id = client.organization_id
        and tx.client_id = client.id
        and tx.type = 'INCOME'
        and tx.status <> 'REFUNDED'
    ), 0)
    where client.organization_id = ${organizationId}
  `);
}
