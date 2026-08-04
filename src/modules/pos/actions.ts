"use server";

import { db } from "@/core/database/db";
import {
  appointments,
  transactions,
  transactionItems,
  products,
  services,
  inventoryMovements,
  serviceMaterials,
  auditLogs,
  transactionPayments,
  clients,
  organizationMembers,
} from "@/core/database/schema";
import { requireActor } from "@/core/auth/server/actor";
import { getCashEntries } from "@/modules/pos/cash-flow";
import { asc, eq, and, sql, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getErrorMessage } from "@/core/errors";
import {
  cartSchema,
  descriptionSchema,
  moneySchema,
  nonNegativeMoneySchema,
  optionalClientIdSchema,
  paymentMethodSchema,
  resourceIdSchema,
  reportRangeSchema,
  settledPaymentMethodSchema,
  transactionUpdateSchema,
} from "./domain/schemas";

async function getOrganizationId() {
  return (await requireActor()).organizationId;
}

export type CartItem = {
  id: string;
  type: "PRODUCT" | "SERVICE";
  name: string;
  price: number;
  quantity: number;
  staffId?: string; // Solo para servicios
};

export async function processSale(
  cart: CartItem[],
  clientId: string | null,
  paymentMethod: string,
  appointmentId?: string,
  initialPaidAmount?: number,
  initialPaymentMethod?: string,
) {
  try {
    const orgId = await getOrganizationId();
    const parsedCart = cartSchema.parse(cart);
    const validClientId = optionalClientIdSchema.parse(clientId);
    const validPaymentMethod = paymentMethodSchema.parse(paymentMethod);
    const validAppointmentId = appointmentId ? resourceIdSchema.parse(appointmentId) : null;
    const validInitialPaymentMethod = initialPaymentMethod
      ? settledPaymentMethodSchema.parse(initialPaymentMethod)
      : "CASH";
    if (validPaymentMethod === "CREDIT" && !validClientId) {
      return {
        success: false,
        error: "Debe seleccionar un cliente para las ventas a crédito (fiados).",
      };
    }

    const staffIds = [
      ...new Set(parsedCart.flatMap((item) => (item.staffId ? [item.staffId] : []))),
    ];
    const [validClient, validAppointment, validStaff] = await Promise.all([
      validClientId
        ? db.query.clients.findFirst({
            where: and(eq(clients.id, validClientId), eq(clients.organizationId, orgId)),
          })
        : Promise.resolve(null),
      validAppointmentId
        ? db.query.appointments.findFirst({
            where: and(
              eq(appointments.id, validAppointmentId),
              eq(appointments.organizationId, orgId),
            ),
          })
        : Promise.resolve(null),
      staffIds.length > 0
        ? db
            .select({ id: organizationMembers.id })
            .from(organizationMembers)
            .where(
              and(
                eq(organizationMembers.organizationId, orgId),
                inArray(organizationMembers.id, staffIds),
              ),
            )
        : Promise.resolve([]),
    ]);
    if (validClientId && !validClient) throw new Error("El cliente no pertenece a la organización");
    if (validAppointmentId && !validAppointment)
      throw new Error("La cita no pertenece a la organización");
    if (validStaff.length !== staffIds.length)
      throw new Error("El colaborador no pertenece a la organización");

    const [catalogProducts, catalogServices] = await Promise.all([
      db
        .select({ id: products.id, name: products.name, price: products.salePrice })
        .from(products)
        .where(eq(products.organizationId, orgId)),
      db
        .select({ id: services.id, name: services.name, price: services.price })
        .from(services)
        .where(eq(services.organizationId, orgId)),
    ]);
    const productsById = new Map(catalogProducts.map((item) => [item.id, item]));
    const servicesById = new Map(catalogServices.map((item) => [item.id, item]));
    const trustedCart = parsedCart.map((item) => {
      const catalogItem =
        item.type === "PRODUCT" ? productsById.get(item.id) : servicesById.get(item.id);
      if (!catalogItem?.price)
        throw new Error("Uno de los artículos no pertenece a la organización");
      return { ...item, name: catalogItem.name, price: Number(catalogItem.price) };
    });
    const totalAmount = trustedCart.reduce((total, item) => total + item.price * item.quantity, 0);

    let paidAmount = totalAmount;
    if (validPaymentMethod === "CREDIT") {
      paidAmount = nonNegativeMoneySchema.parse(initialPaidAmount ?? 0);
      if (paidAmount > totalAmount)
        return {
          success: false,
          error: "El abono inicial no puede ser mayor al total de la venta.",
        };
    }

    const status = paidAmount < totalAmount ? "PENDING" : "COMPLETED";

    const transaction = await db.transaction(async (databaseTransaction) => {
      const [sale] = await databaseTransaction
        .insert(transactions)
        .values({
          organizationId: orgId,
          clientId: validClientId,
          type: "INCOME",
          totalAmount: totalAmount.toFixed(2),
          paymentMethod: validPaymentMethod,
          status,
          paidAmount: paidAmount.toFixed(2),
        })
        .returning();

      if (validClientId) {
        await databaseTransaction
          .update(clients)
          .set({ totalSpent: sql`${clients.totalSpent} + ${totalAmount}` })
          .where(and(eq(clients.id, validClientId), eq(clients.organizationId, orgId)));
      }

      if (validPaymentMethod === "CREDIT" && paidAmount > 0) {
        await databaseTransaction.insert(transactionPayments).values({
          transactionId: sale.id,
          amount: paidAmount.toFixed(2),
          paymentMethod: validInitialPaymentMethod,
        });
      }

      for (const item of trustedCart) {
        if (item.quantity <= 0)
          throw new Error(`La cantidad de ${item.name} debe ser mayor a cero.`);

        await databaseTransaction.insert(transactionItems).values({
          transactionId: sale.id,
          itemType: item.type,
          itemId: item.id,
          quantity: item.quantity.toString(),
          unitPrice: item.price.toFixed(2),
          subtotal: (item.price * item.quantity).toFixed(2),
        });

        if (item.type === "PRODUCT") {
          const [productData] = await databaseTransaction
            .select()
            .from(products)
            .where(and(eq(products.id, item.id), eq(products.organizationId, orgId)))
            .for("update");
          if (!productData) throw new Error(`El producto ${item.name} ya no está disponible.`);

          const previousStock = parseFloat(productData.currentStock);
          if (previousStock < item.quantity) {
            throw new Error(
              `Stock insuficiente para ${productData.name}. Disponible: ${previousStock}.`,
            );
          }
          const newStock = previousStock - item.quantity;

          await databaseTransaction
            .update(products)
            .set({ currentStock: newStock.toString() })
            .where(and(eq(products.id, item.id), eq(products.organizationId, orgId)));
          await databaseTransaction.insert(inventoryMovements).values({
            organizationId: orgId,
            productId: item.id,
            type: "OUT",
            quantity: item.quantity,
            previousStock,
            newStock,
            notes: `SALE transaction ${sale.id}`,
          });
        } else {
          const materials = await databaseTransaction
            .select()
            .from(serviceMaterials)
            .where(eq(serviceMaterials.serviceId, item.id));

          for (const material of materials) {
            const [productData] = await databaseTransaction
              .select()
              .from(products)
              .where(and(eq(products.id, material.productId), eq(products.organizationId, orgId)))
              .for("update");
            if (!productData) continue;

            const quantityUsed = parseFloat(material.quantityUsed) * item.quantity;
            const previousStock = parseFloat(productData.currentStock);
            const newStock = previousStock - quantityUsed;

            await databaseTransaction
              .update(products)
              .set({ currentStock: newStock.toString() })
              .where(and(eq(products.id, material.productId), eq(products.organizationId, orgId)));
            await databaseTransaction.insert(inventoryMovements).values({
              organizationId: orgId,
              productId: material.productId,
              type: "OUT",
              quantity: quantityUsed,
              previousStock,
              newStock,
              notes: `USAGE transaction ${sale.id}`,
            });
          }
        }
      }

      if (validAppointmentId) {
        await databaseTransaction
          .update(appointments)
          .set({ status: "COMPLETED" })
          .where(
            and(eq(appointments.id, validAppointmentId), eq(appointments.organizationId, orgId)),
          );
      }

      return sale;
    });

    revalidatePath("/pos");
    revalidatePath("/inventario");
    revalidatePath("/dashboard");
    revalidatePath("/agenda"); // Revalidar la agenda porque se completó la cita
    revalidatePath("/clientes");
    revalidatePath("/analitica");
    return { success: true, transactionId: transaction.id };
  } catch (error: unknown) {
    console.error("Error processSale:", error);
    return { success: false, error: getErrorMessage(error) };
  }
}

export async function registerExpense(amount: number, description: string, paymentMethod: string) {
  try {
    const actor = await requireActor();
    const orgId = actor.organizationId;
    const validAmount = moneySchema.parse(amount);
    const validDescription = descriptionSchema.parse(description);
    const validPaymentMethod = settledPaymentMethodSchema.parse(paymentMethod);

    // Crear la transacción de gasto
    const [transaction] = await db
      .insert(transactions)
      .values({
        organizationId: orgId,
        type: "EXPENSE",
        totalAmount: validAmount.toFixed(2),
        paymentMethod: validPaymentMethod,
        status: "COMPLETED",
      })
      .returning();

    // Guardar la descripción en AuditLogs ya que no tenemos campo notes en transactions ni item asociado
    await db.insert(auditLogs).values({
      organizationId: orgId,
      userId: actor.userId,
      action: "REGISTER_EXPENSE",
      entityType: "TRANSACTION",
      entityId: transaction.id,
      details: validDescription,
    });

    revalidatePath("/pos");
    revalidatePath("/dashboard");
    revalidatePath("/analitica");
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
    const orgId = await getOrganizationId();
    const validTransactionId = resourceIdSchema.parse(transactionId);
    const validAmount = moneySchema.parse(amount);
    const validPaymentMethod = settledPaymentMethodSchema.parse(paymentMethod);

    const newStatus = await db.transaction(async (databaseTransaction) => {
      const [transaction] = await databaseTransaction
        .select()
        .from(transactions)
        .where(and(eq(transactions.id, validTransactionId), eq(transactions.organizationId, orgId)))
        .for("update");
      if (!transaction) throw new Error("Transacción no encontrada");
      if (transaction.status === "COMPLETED")
        throw new Error("La transacción ya está pagada por completo");

      const currentPaid = parseFloat(transaction.paidAmount);
      const totalAmount = parseFloat(transaction.totalAmount);
      const newPaidAmount = currentPaid + validAmount;
      if (newPaidAmount > totalAmount) throw new Error("El abono supera la deuda restante");

      const nextStatus = newPaidAmount >= totalAmount ? "COMPLETED" : "PENDING";
      await databaseTransaction.insert(transactionPayments).values({
        transactionId: transaction.id,
        amount: validAmount.toFixed(2),
        paymentMethod: validPaymentMethod,
      });
      await databaseTransaction
        .update(transactions)
        .set({
          paidAmount: newPaidAmount.toFixed(2),
          status: nextStatus,
        })
        .where(and(eq(transactions.id, transaction.id), eq(transactions.organizationId, orgId)));

      return nextStatus;
    });

    revalidatePath("/pos");
    revalidatePath("/dashboard");
    revalidatePath("/analitica");
    return { success: true, newStatus };
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
    const orgId = await getOrganizationId();
    const validClientId = resourceIdSchema.parse(clientId);
    const validAmount = moneySchema.parse(amount);
    const validPaymentMethod = settledPaymentMethodSchema.parse(paymentMethod);

    const allocationCount = await db.transaction(async (databaseTransaction) => {
      const pendingTransactions = await databaseTransaction
        .select()
        .from(transactions)
        .where(
          and(
            eq(transactions.organizationId, orgId),
            eq(transactions.clientId, validClientId),
            eq(transactions.type, "INCOME"),
            eq(transactions.status, "PENDING"),
          ),
        )
        .orderBy(asc(transactions.createdAt), asc(transactions.id))
        .for("update");

      if (pendingTransactions.length === 0)
        throw new Error("El cliente no tiene cuentas pendientes");

      const totalOutstanding = pendingTransactions.reduce(
        (total, transaction) =>
          total + Math.max(0, Number(transaction.totalAmount) - Number(transaction.paidAmount)),
        0,
      );
      if (validAmount > totalOutstanding + 0.001)
        throw new Error("El abono supera la deuda total del cliente");

      const paidAt = new Date();
      let remainingPayment = validAmount;
      let allocations = 0;

      for (const transaction of pendingTransactions) {
        if (remainingPayment <= 0.001) break;

        const currentPaid = Number(transaction.paidAmount);
        const totalAmount = Number(transaction.totalAmount);
        const outstanding = Math.max(0, totalAmount - currentPaid);
        if (outstanding <= 0) continue;

        const allocatedAmount = Math.min(remainingPayment, outstanding);
        const nextPaidAmount = currentPaid + allocatedAmount;
        const nextStatus = nextPaidAmount >= totalAmount - 0.001 ? "COMPLETED" : "PENDING";

        await databaseTransaction.insert(transactionPayments).values({
          transactionId: transaction.id,
          amount: allocatedAmount.toFixed(2),
          paymentMethod: validPaymentMethod,
          createdAt: paidAt,
        });
        await databaseTransaction
          .update(transactions)
          .set({
            paidAmount: nextPaidAmount.toFixed(2),
            status: nextStatus,
          })
          .where(and(eq(transactions.id, transaction.id), eq(transactions.organizationId, orgId)));

        remainingPayment -= allocatedAmount;
        allocations += 1;
      }

      if (remainingPayment > 0.001) throw new Error("No fue posible distribuir todo el abono");
      return allocations;
    });

    revalidatePath("/pos");
    revalidatePath("/dashboard");
    revalidatePath("/analitica");
    return { success: true, allocationCount };
  } catch (error: unknown) {
    console.error("Error registerClientPayment:", error);
    return { success: false, error: getErrorMessage(error) };
  }
}

export async function updateTransaction(transactionId: string, formData: FormData) {
  try {
    const orgId = await getOrganizationId();
    const input = transactionUpdateSchema.parse({
      transactionId,
      totalAmount: Number(formData.get("totalAmount")),
      paymentMethod: formData.get("paymentMethod"),
      clientId: formData.get("clientId") || null,
      description: formData.get("description") || "",
    });
    const { totalAmount, paymentMethod, clientId, description } = input;

    const [transaction] = await db
      .select()
      .from(transactions)
      .where(and(eq(transactions.id, input.transactionId), eq(transactions.organizationId, orgId)));
    if (!transaction) throw new Error("Movimiento no encontrado");
    if (transaction.type === "EXPENSE" && paymentMethod === "CREDIT") {
      throw new Error("Un gasto no puede registrarse como fiado");
    }
    if (transaction.type === "INCOME" && paymentMethod === "CREDIT" && !clientId) {
      throw new Error("Las ventas fiadas deben tener un cliente asignado");
    }
    if (transaction.type === "INCOME" && clientId) {
      const [client] = await db
        .select({ id: clients.id })
        .from(clients)
        .where(and(eq(clients.id, clientId), eq(clients.organizationId, orgId)));
      if (!client) throw new Error("Cliente no encontrado");
    }

    const paidAmount = parseFloat(transaction.paidAmount);
    if (transaction.status === "PENDING" && totalAmount < paidAmount) {
      throw new Error("El monto no puede ser menor que los abonos registrados");
    }

    const nextPaidAmount = transaction.status === "COMPLETED" ? totalAmount : paidAmount;
    const nextStatus = nextPaidAmount >= totalAmount ? "COMPLETED" : "PENDING";
    await db
      .update(transactions)
      .set({
        totalAmount: totalAmount.toFixed(2),
        paidAmount: nextPaidAmount.toFixed(2),
        paymentMethod,
        status: nextStatus,
        clientId: transaction.type === "INCOME" ? clientId : null,
      })
      .where(and(eq(transactions.id, input.transactionId), eq(transactions.organizationId, orgId)));

    if (transaction.type === "EXPENSE") {
      await db
        .update(auditLogs)
        .set({ details: description })
        .where(
          and(
            eq(auditLogs.organizationId, orgId),
            eq(auditLogs.entityId, input.transactionId),
            eq(auditLogs.entityType, "TRANSACTION"),
          ),
        );
    }

    revalidatePath("/pos");
    revalidatePath("/dashboard");
    revalidatePath("/clientes");
    revalidatePath("/analitica");
    return { success: true };
  } catch (error: unknown) {
    return { success: false, error: getErrorMessage(error) };
  }
}

export async function deleteTransaction(transactionId: string) {
  try {
    const orgId = await getOrganizationId();
    const validTransactionId = resourceIdSchema.parse(transactionId);
    const [transaction] = await db
      .select()
      .from(transactions)
      .where(and(eq(transactions.id, validTransactionId), eq(transactions.organizationId, orgId)));
    if (!transaction) throw new Error("Movimiento no encontrado");

    const movements = await db
      .select()
      .from(inventoryMovements)
      .where(
        and(
          eq(inventoryMovements.organizationId, orgId),
          sql`${inventoryMovements.notes} like ${`%transaction ${validTransactionId}%`}`,
        ),
      );

    for (const movement of movements) {
      const [product] = await db
        .select()
        .from(products)
        .where(and(eq(products.id, movement.productId), eq(products.organizationId, orgId)));
      if (!product) continue;

      const stockToReverse = movement.previousStock - movement.newStock;
      await db
        .update(products)
        .set({
          currentStock: (parseFloat(product.currentStock) + stockToReverse).toString(),
        })
        .where(eq(products.id, product.id));
    }

    if (movements.length > 0) {
      await db.delete(inventoryMovements).where(
        inArray(
          inventoryMovements.id,
          movements.map((movement) => movement.id),
        ),
      );
    }
    await db
      .delete(transactionPayments)
      .where(eq(transactionPayments.transactionId, validTransactionId));
    await db.delete(transactionItems).where(eq(transactionItems.transactionId, validTransactionId));
    await db
      .delete(auditLogs)
      .where(and(eq(auditLogs.organizationId, orgId), eq(auditLogs.entityId, validTransactionId)));
    await db
      .delete(transactions)
      .where(and(eq(transactions.id, validTransactionId), eq(transactions.organizationId, orgId)));

    revalidatePath("/pos");
    revalidatePath("/inventario");
    revalidatePath("/dashboard");
    revalidatePath("/clientes");
    revalidatePath("/analitica");
    return { success: true };
  } catch (error: unknown) {
    return { success: false, error: getErrorMessage(error) };
  }
}

export async function exportFinancialReport(startDate: string, endDate: string) {
  try {
    const orgId = await getOrganizationId();
    const { start, end } = reportRangeSchema.parse({ start: startDate, end: endDate });

    const cashEntries = await getCashEntries(orgId, start, new Date(end.getTime() + 1));
    const txIds = [...new Set(cashEntries.map((entry) => entry.transactionId))];
    const txs =
      txIds.length > 0
        ? await db
            .select()
            .from(transactions)
            .where(and(eq(transactions.organizationId, orgId), inArray(transactions.id, txIds)))
        : [];
    const transactionsById = new Map(txs.map((transaction) => [transaction.id, transaction]));
    let items: (typeof transactionItems.$inferSelect)[] = [];
    if (txIds.length > 0) {
      items = await db
        .select()
        .from(transactionItems)
        .where(inArray(transactionItems.transactionId, txIds));
    }

    // Fetch catalogs for naming
    const orgProducts = await db.select().from(products).where(eq(products.organizationId, orgId));
    const orgServices = await db.select().from(services).where(eq(services.organizationId, orgId));
    const orgAuditLogs = await db
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.organizationId, orgId), eq(auditLogs.action, "REGISTER_EXPENSE")));

    // Formatear CSV con escaping seguro y detalle por item
    let csv =
      "ID_Transaccion,Fecha,Hora,Tipo,MetodoPago,Estado,Total_Tx,Abonado_Tx,Item_Nombre,Cantidad,Precio_Unitario,Subtotal\n";
    for (const entry of cashEntries) {
      const tx = transactionsById.get(entry.transactionId);
      if (!tx) continue;
      const safeId = `"${tx.id.replace(/"/g, '""')}"`;
      const txType = tx.type === "INCOME" ? "VENTA" : "GASTO";
      const safeMethod = `"${(entry.paymentMethod || "").replace(/"/g, '""')}"`;
      const safeStatus = `"${tx.status.replace(/"/g, '""')}"`;
      const dateStr = entry.createdAt.toLocaleDateString();
      const timeStr = entry.createdAt.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });

      const txItems = items.filter((i) => i.transactionId === tx.id);

      if (tx.type === "EXPENSE" || txItems.length === 0) {
        let itemName = "Transacción General";
        if (tx.type === "EXPENSE") {
          const log = orgAuditLogs.find((l) => l.entityId === tx.id);
          itemName = log?.details || "Gasto sin descripción";
        }
        const safeItemName = `"${itemName.replace(/"/g, '""')}"`;
        csv += `${safeId},${dateStr},${timeStr},${txType},${safeMethod},${safeStatus},${tx.totalAmount},${entry.amount},${safeItemName},1,${entry.amount},${entry.amount}\n`;
      } else {
        for (const item of txItems) {
          let itemName = "Item Desconocido";
          if (item.itemType === "PRODUCT") {
            const p = orgProducts.find((x) => x.id === item.itemId);
            if (p) itemName = p.name;
          } else if (item.itemType === "SERVICE") {
            const s = orgServices.find((x) => x.id === item.itemId);
            if (s) itemName = s.name;
          }

          const safeItemName = `"${itemName.replace(/"/g, '""')}"`;
          csv += `${safeId},${dateStr},${timeStr},${txType},${safeMethod},${safeStatus},${tx.totalAmount},${entry.amount},${safeItemName},${item.quantity},${item.unitPrice},${item.subtotal}\n`;
        }
      }
    }

    return { success: true, csv };
  } catch (error: unknown) {
    console.error("Error exportFinancialReport:", error);
    return { success: false, error: getErrorMessage(error) };
  }
}
