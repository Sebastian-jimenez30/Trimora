"use server"

import { db } from "@/core/database/db";
import { appointments, transactions, transactionItems, products, services, inventoryMovements, serviceMaterials, auditLogs, transactionPayments, clients } from "@/core/database/schema";
import { createClient } from "@/core/database/server";
import { eq, and, sql, gte, lte, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";

async function getOrganizationId() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");

  const orgId = user.user_metadata?.organization_id;
  if (!orgId) throw new Error("No tienes organización");

  return orgId;
}

export type CartItem = {
  id: string;
  type: "PRODUCT" | "SERVICE";
  name: string;
  price: number;
  quantity: number;
  staffId?: string; // Solo para servicios
};

export async function processSale(cart: CartItem[], clientId: string | null, paymentMethod: string, appointmentId?: string, initialPaidAmount?: number, initialPaymentMethod?: string) {
  try {
    const orgId = await getOrganizationId();
    if (cart.length === 0) return { success: false, error: "El carrito está vacío." };
    if (paymentMethod === 'CREDIT' && !clientId) {
      return { success: false, error: "Debe seleccionar un cliente para las ventas a crédito (fiados)." };
    }

    let totalAmount = 0;
    cart.forEach(item => totalAmount += item.price * item.quantity);

    let paidAmount = totalAmount;
    if (paymentMethod === 'CREDIT') {
      paidAmount = initialPaidAmount || 0;
      if (paidAmount < 0) return { success: false, error: "El abono inicial no puede ser negativo." };
      if (paidAmount > totalAmount) return { success: false, error: "El abono inicial no puede ser mayor al total de la venta." };
    }

    const status = paidAmount < totalAmount ? 'PENDING' : 'COMPLETED';

    const transaction = await db.transaction(async (databaseTransaction) => {
      const [sale] = await databaseTransaction.insert(transactions).values({
        organizationId: orgId,
        clientId: clientId || null,
        type: 'INCOME',
        totalAmount: totalAmount.toFixed(2),
        paymentMethod,
        status,
        paidAmount: paidAmount.toFixed(2)
      }).returning();

      if (clientId) {
        await databaseTransaction.update(clients)
          .set({ totalSpent: sql`${clients.totalSpent} + ${totalAmount}` })
          .where(and(eq(clients.id, clientId), eq(clients.organizationId, orgId)));
      }

      if (paymentMethod === 'CREDIT' && paidAmount > 0) {
        await databaseTransaction.insert(transactionPayments).values({
          transactionId: sale.id,
          amount: paidAmount.toFixed(2),
          paymentMethod: initialPaymentMethod || 'CASH'
        });
      }

      for (const item of cart) {
        if (item.quantity <= 0) throw new Error(`La cantidad de ${item.name} debe ser mayor a cero.`);

        await databaseTransaction.insert(transactionItems).values({
          transactionId: sale.id,
          itemType: item.type,
          itemId: item.id,
          quantity: item.quantity.toString(),
          unitPrice: item.price.toFixed(2),
          subtotal: (item.price * item.quantity).toFixed(2)
        });

        if (item.type === "PRODUCT") {
          const [productData] = await databaseTransaction.select()
            .from(products)
            .where(and(eq(products.id, item.id), eq(products.organizationId, orgId)))
            .for("update");
          if (!productData) throw new Error(`El producto ${item.name} ya no está disponible.`);

          const previousStock = parseFloat(productData.currentStock);
          if (previousStock < item.quantity) {
            throw new Error(`Stock insuficiente para ${productData.name}. Disponible: ${previousStock}.`);
          }
          const newStock = previousStock - item.quantity;

          await databaseTransaction.update(products)
            .set({ currentStock: newStock.toString() })
            .where(and(eq(products.id, item.id), eq(products.organizationId, orgId)));
          await databaseTransaction.insert(inventoryMovements).values({
            organizationId: orgId,
            productId: item.id,
            type: 'OUT',
            quantity: item.quantity,
            previousStock: Math.round(previousStock),
            newStock: Math.round(newStock),
            notes: `SALE transaction ${sale.id}`
          });
        } else {
          const materials = await databaseTransaction.select()
            .from(serviceMaterials)
            .where(eq(serviceMaterials.serviceId, item.id));

          for (const material of materials) {
            const [productData] = await databaseTransaction.select()
              .from(products)
              .where(and(eq(products.id, material.productId), eq(products.organizationId, orgId)))
              .for("update");
            if (!productData) continue;

            const quantityUsed = parseFloat(material.quantityUsed) * item.quantity;
            const previousStock = parseFloat(productData.currentStock);
            const newStock = previousStock - quantityUsed;

            await databaseTransaction.update(products)
              .set({ currentStock: newStock.toString() })
              .where(and(eq(products.id, material.productId), eq(products.organizationId, orgId)));
            await databaseTransaction.insert(inventoryMovements).values({
              organizationId: orgId,
              productId: material.productId,
              type: 'OUT',
              quantity: Math.round(quantityUsed),
              previousStock: Math.round(previousStock),
              newStock: Math.round(newStock),
              notes: `USAGE transaction ${sale.id}`
            });
          }
        }
      }

      if (appointmentId) {
        await databaseTransaction.update(appointments)
          .set({ status: 'COMPLETED' })
          .where(and(eq(appointments.id, appointmentId), eq(appointments.organizationId, orgId)));
      }

      return sale;
    });

    revalidatePath("/pos");
    revalidatePath("/inventario");
    revalidatePath("/dashboard");
    revalidatePath("/agenda"); // Revalidar la agenda porque se completó la cita
    revalidatePath("/clientes");
    return { success: true, transactionId: transaction.id };
  } catch (error: any) {
    console.error("Error processSale:", error);
    return { success: false, error: error.message };
  }
}

export async function registerExpense(amount: number, description: string, paymentMethod: string) {
  try {
    const orgId = await getOrganizationId();
    
    // Crear la transacción de gasto
    const [transaction] = await db.insert(transactions).values({
      organizationId: orgId,
      type: 'EXPENSE',
      totalAmount: amount.toFixed(2),
      paymentMethod,
      status: 'COMPLETED'
    }).returning();

    // Guardar la descripción en AuditLogs ya que no tenemos campo notes en transactions ni item asociado
    await db.insert(auditLogs).values({
      organizationId: orgId,
      userId: orgId, // Usamos orgId como fallback si no tenemos el UUID del user exacto a mano aquí, pero lo ideal es el user
      action: 'REGISTER_EXPENSE',
      entityType: 'TRANSACTION',
      entityId: transaction.id,
      details: description
    });

    revalidatePath("/pos");
    revalidatePath("/dashboard");
    return { success: true };
  } catch (error: any) {
    console.error("Error registerExpense:", error);
    return { success: false, error: error.message };
  }
}

export async function registerPayment(transactionId: string, amount: number, paymentMethod: string) {
  try {
    await getOrganizationId(); // Verifica autenticación

    // Buscar transacción
    const [tx] = await db.select().from(transactions).where(eq(transactions.id, transactionId));
    if (!tx) throw new Error("Transacción no encontrada");
    if (tx.status === 'COMPLETED') throw new Error("La transacción ya está pagada por completo");

    if (amount <= 0) throw new Error("El monto a abonar debe ser mayor a 0");

    const currentPaid = parseFloat(tx.paidAmount);
    const totalAmount = parseFloat(tx.totalAmount);
    const newPaidAmount = currentPaid + amount;

    if (newPaidAmount > totalAmount) {
      throw new Error("El abono supera la deuda restante");
    }
    
    // Registrar el abono
    await db.insert(transactionPayments).values({
      transactionId: tx.id,
      amount: amount.toFixed(2),
      paymentMethod
    });

    // Actualizar la transacción atómicamente
    const newStatus = (parseFloat(tx.paidAmount) + amount) >= parseFloat(tx.totalAmount) ? 'COMPLETED' : 'PENDING';
    await db.update(transactions)
      .set({ 
        paidAmount: sql`${transactions.paidAmount} + ${amount}`,
        status: newStatus 
      })
      .where(eq(transactions.id, tx.id));

    revalidatePath("/pos");
    revalidatePath("/dashboard");
    return { success: true, newStatus };
  } catch (error: any) {
    console.error("Error registerPayment:", error);
    return { success: false, error: error.message };
  }
}

export async function updateTransaction(transactionId: string, formData: FormData) {
  try {
    const orgId = await getOrganizationId();
    const totalAmount = parseFloat(formData.get("totalAmount") as string);
    const paymentMethod = formData.get("paymentMethod") as string;
    const clientId = (formData.get("clientId") as string) || null;
    const description = (formData.get("description") as string) || "";

    if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
      throw new Error("El monto debe ser mayor a cero");
    }
    if (!["CASH", "CARD", "TRANSFER", "CREDIT"].includes(paymentMethod)) {
      throw new Error("Método de pago inválido");
    }

    const [transaction] = await db.select().from(transactions).where(and(
      eq(transactions.id, transactionId),
      eq(transactions.organizationId, orgId)
    ));
    if (!transaction) throw new Error("Movimiento no encontrado");
    if (transaction.type === "EXPENSE" && paymentMethod === "CREDIT") {
      throw new Error("Un gasto no puede registrarse como fiado");
    }
    if (transaction.type === "INCOME" && paymentMethod === "CREDIT" && !clientId) {
      throw new Error("Las ventas fiadas deben tener un cliente asignado");
    }
    if (transaction.type === "INCOME" && clientId) {
      const [client] = await db.select({ id: clients.id }).from(clients).where(and(
        eq(clients.id, clientId),
        eq(clients.organizationId, orgId)
      ));
      if (!client) throw new Error("Cliente no encontrado");
    }

    const paidAmount = parseFloat(transaction.paidAmount);
    if (transaction.status === "PENDING" && totalAmount < paidAmount) {
      throw new Error("El monto no puede ser menor que los abonos registrados");
    }

    const nextPaidAmount = transaction.status === "COMPLETED" ? totalAmount : paidAmount;
    const nextStatus = nextPaidAmount >= totalAmount ? "COMPLETED" : "PENDING";
    await db.update(transactions).set({
      totalAmount: totalAmount.toFixed(2),
      paidAmount: nextPaidAmount.toFixed(2),
      paymentMethod,
      status: nextStatus,
      clientId: transaction.type === "INCOME" ? clientId : null,
    }).where(and(eq(transactions.id, transactionId), eq(transactions.organizationId, orgId)));

    if (transaction.type === "EXPENSE") {
      await db.update(auditLogs).set({ details: description }).where(and(
        eq(auditLogs.organizationId, orgId),
        eq(auditLogs.entityId, transactionId),
        eq(auditLogs.entityType, "TRANSACTION")
      ));
    }

    revalidatePath("/pos");
    revalidatePath("/dashboard");
    revalidatePath("/clientes");
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function deleteTransaction(transactionId: string) {
  try {
    const orgId = await getOrganizationId();
    const [transaction] = await db.select().from(transactions).where(and(
      eq(transactions.id, transactionId),
      eq(transactions.organizationId, orgId)
    ));
    if (!transaction) throw new Error("Movimiento no encontrado");

    const movements = await db.select().from(inventoryMovements).where(and(
      eq(inventoryMovements.organizationId, orgId),
      sql`${inventoryMovements.notes} like ${`%transaction ${transactionId}%`}`
    ));

    for (const movement of movements) {
      const [product] = await db.select().from(products).where(and(
        eq(products.id, movement.productId),
        eq(products.organizationId, orgId)
      ));
      if (!product) continue;

      const stockToReverse = movement.previousStock - movement.newStock;
      await db.update(products).set({
        currentStock: (parseFloat(product.currentStock) + stockToReverse).toString()
      }).where(eq(products.id, product.id));
    }

    if (movements.length > 0) {
      await db.delete(inventoryMovements).where(inArray(inventoryMovements.id, movements.map((movement) => movement.id)));
    }
    await db.delete(transactionPayments).where(eq(transactionPayments.transactionId, transactionId));
    await db.delete(transactionItems).where(eq(transactionItems.transactionId, transactionId));
    await db.delete(auditLogs).where(and(eq(auditLogs.organizationId, orgId), eq(auditLogs.entityId, transactionId)));
    await db.delete(transactions).where(and(eq(transactions.id, transactionId), eq(transactions.organizationId, orgId)));

    revalidatePath("/pos");
    revalidatePath("/inventario");
    revalidatePath("/dashboard");
    revalidatePath("/clientes");
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function exportFinancialReport(startDate: string, endDate: string) {
  try {
    const orgId = await getOrganizationId();
    // Extraer transacciones (INCOME y EXPENSE) en el rango de fechas
    // El frontend enviará fechas en formato ISO
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    const txs = await db.select().from(transactions).where(and(
      eq(transactions.organizationId, orgId),
      gte(transactions.createdAt, start),
      lte(transactions.createdAt, end)
    ));
    
    const txIds = txs.map(t => t.id);
    let items: any[] = [];
    if (txIds.length > 0) {
      items = await db.select().from(transactionItems).where(
        inArray(transactionItems.transactionId, txIds)
      );
    }
    
    // Fetch catalogs for naming
    const orgProducts = await db.select().from(products).where(eq(products.organizationId, orgId));
    const orgServices = await db.select().from(services).where(eq(services.organizationId, orgId));
    const orgAuditLogs = await db.select().from(auditLogs).where(
      and(eq(auditLogs.organizationId, orgId), eq(auditLogs.action, 'REGISTER_EXPENSE'))
    );

    // Formatear CSV con escaping seguro y detalle por item
    let csv = "ID_Transaccion,Fecha,Hora,Tipo,MetodoPago,Estado,Total_Tx,Abonado_Tx,Item_Nombre,Cantidad,Precio_Unitario,Subtotal\n";
    for (const tx of txs) {
      const safeId = `"${tx.id.replace(/"/g, '""')}"`;
      const txType = tx.type === "INCOME" ? "VENTA" : "GASTO";
      const safeMethod = `"${(tx.paymentMethod || '').replace(/"/g, '""')}"`;
      const safeStatus = `"${tx.status.replace(/"/g, '""')}"`;
      const dateStr = new Date(tx.createdAt).toLocaleDateString();
      const timeStr = new Date(tx.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
      
      const txItems = items.filter(i => i.transactionId === tx.id);
      
      if (tx.type === "EXPENSE" || txItems.length === 0) {
        let itemName = "Transacción General";
        if (tx.type === "EXPENSE") {
          const log = orgAuditLogs.find(l => l.entityId === tx.id);
          itemName = log?.details || "Gasto sin descripción";
        }
        const safeItemName = `"${itemName.replace(/"/g, '""')}"`;
        csv += `${safeId},${dateStr},${timeStr},${txType},${safeMethod},${safeStatus},${tx.totalAmount},${tx.paidAmount},${safeItemName},1,${tx.totalAmount},${tx.totalAmount}\n`;
      } else {
        for (const item of txItems) {
          let itemName = "Item Desconocido";
          if (item.itemType === "PRODUCT") {
            const p = orgProducts.find(x => x.id === item.itemId);
            if (p) itemName = p.name;
          } else if (item.itemType === "SERVICE") {
            const s = orgServices.find(x => x.id === item.itemId);
            if (s) itemName = s.name;
          }
          
          const safeItemName = `"${itemName.replace(/"/g, '""')}"`;
          csv += `${safeId},${dateStr},${timeStr},${txType},${safeMethod},${safeStatus},${tx.totalAmount},${tx.paidAmount},${safeItemName},${item.quantity},${item.unitPrice},${item.subtotal}\n`;
        }
      }
    }

    return { success: true, csv };
  } catch (error: any) {
    console.error("Error exportFinancialReport:", error);
    return { success: false, error: error.message };
  }
}
