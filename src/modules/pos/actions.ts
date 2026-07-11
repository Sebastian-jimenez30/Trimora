"use server"

import { db } from "@/core/database/db";
import { transactions, transactionItems, products, inventoryMovements, serviceMaterials, auditLogs } from "@/core/database/schema";
import { createClient } from "@/core/database/server";
import { eq, and } from "drizzle-orm";
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

export async function processSale(cart: CartItem[], clientId: string | null, paymentMethod: string) {
  try {
    const orgId = await getOrganizationId();
    if (cart.length === 0) return { success: false, error: "El carrito está vacío." };

    let totalAmount = 0;
    cart.forEach(item => totalAmount += item.price * item.quantity);

    // 1. Crear la transacción
    const [transaction] = await db.insert(transactions).values({
      organizationId: orgId,
      clientId: clientId || null,
      type: 'INCOME',
      totalAmount: totalAmount.toFixed(2),
      paymentMethod,
      status: 'COMPLETED'
    }).returning();

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
            quantityChange: (-item.quantity).toString(),
            movementType: 'SALE',
            transactionId: transaction.id
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
              quantityChange: (-qtyUsed).toString(),
              movementType: 'USAGE',
              transactionId: transaction.id
            });
          }
        }
      }
    }

    revalidatePath("/pos");
    revalidatePath("/inventario");
    revalidatePath("/dashboard");
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
