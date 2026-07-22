"use server"

import { db } from "@/core/database/db";
import { transactions, transactionItems, products, services, inventoryMovements, serviceMaterials, auditLogs, transactionPayments } from "@/core/database/schema";
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

    // 1. Crear la transacción
    const [transaction] = await db.insert(transactions).values({
      organizationId: orgId,
      clientId: clientId || null,
      type: 'INCOME',
      totalAmount: totalAmount.toFixed(2),
      paymentMethod,
      status,
      paidAmount: paidAmount.toFixed(2)
    }).returning();

    // 1.5 Si hay un abono inicial en un fiado
    if (paymentMethod === 'CREDIT' && paidAmount > 0) {
      await db.insert(transactionPayments).values({
        transactionId: transaction.id,
        amount: paidAmount.toFixed(2),
        paymentMethod: initialPaymentMethod || 'CASH'
      });
    }

    // 2. Procesar cada item
    for (const item of cart) {
      await db.insert(transactionItems).values({
        transactionId: transaction.id,
        itemType: item.type,
        itemId: item.id,
        quantity: item.quantity.toString(),
        unitPrice: item.price.toFixed(2),
        subtotal: (item.price * item.quantity).toFixed(2)
      });

      if (item.type === "PRODUCT") {
        // Reducir stock del producto
        const [productData] = await db.select().from(products).where(and(eq(products.id, item.id), eq(products.organizationId, orgId)));
        if (productData) {
          const newStock = parseFloat(productData.currentStock) - item.quantity;
          await db.update(products).set({ currentStock: newStock.toString() }).where(eq(products.id, item.id));

          await db.insert(inventoryMovements).values({
            organizationId: orgId,
            productId: item.id,
            type: 'OUT',
            quantity: item.quantity,
            previousStock: Math.round(parseFloat(productData.currentStock)),
            newStock: Math.round(newStock),
            notes: `SALE transaction ${transaction.id}`
          });
        }
      } else if (item.type === "SERVICE") {
        // Descontar materiales ligados al servicio
        const materials = await db.select().from(serviceMaterials).where(eq(serviceMaterials.serviceId, item.id));
        
        for (const mat of materials) {
          const [productData] = await db.select().from(products).where(and(eq(products.id, mat.productId), eq(products.organizationId, orgId)));
          if (productData) {
            const qtyUsed = parseFloat(mat.quantityUsed) * item.quantity;
            const newStock = parseFloat(productData.currentStock) - qtyUsed;
            
            await db.update(products).set({ currentStock: newStock.toString() }).where(eq(products.id, mat.productId));

            await db.insert(inventoryMovements).values({
              organizationId: orgId,
              productId: mat.productId,
              type: 'OUT',
              quantity: Math.round(qtyUsed),
              previousStock: Math.round(parseFloat(productData.currentStock)),
              newStock: Math.round(newStock),
              notes: `USAGE transaction ${transaction.id}`
            });
          }
        }
      }
    }

    // 3. Completar la cita si viene ligada
    if (appointmentId) {
      const { appointments } = await import("@/core/database/schema");
      await db.update(appointments)
        .set({ status: 'COMPLETED' })
        .where(eq(appointments.id, appointmentId));
    }

    revalidatePath("/pos");
    revalidatePath("/inventario");
    revalidatePath("/dashboard");
    revalidatePath("/agenda"); // Revalidar la agenda porque se completó la cita
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
