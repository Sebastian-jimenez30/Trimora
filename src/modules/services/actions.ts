"use server"

import { db } from "@/core/database/db";
import { services, serviceMaterials, products, inventoryMovements } from "@/core/database/schema";
import { createClient } from "@/core/database/server";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";

// Helper para validar sesión y organización
async function requireAuth() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");
  
  const organizationId = user.user_metadata?.organization_id;
  if (!organizationId) throw new Error("Usuario sin organización");

  return { user, organizationId };
}

type MaterialInput = {
  productId: string;
  quantityUsed: number;
};

export async function createServiceWithMaterials(formData: FormData, materials: MaterialInput[]) {
  try {
    const { organizationId } = await requireAuth();
    
    const name = formData.get("name") as string;
    const description = formData.get("description") as string;
    const durationMinutes = parseInt(formData.get("durationMinutes") as string);
    const price = parseFloat(formData.get("price") as string);
    const isActive = formData.get("isActive") === "true";

    if (!name || isNaN(durationMinutes) || isNaN(price)) {
      throw new Error("Faltan datos obligatorios del servicio");
    }

    // Insert Service
    const [service] = await db.insert(services).values({
      organizationId,
      name,
      description,
      durationMinutes,
      price: price.toString(),
      isActive
    }).returning();

    // Insert Materials
    if (materials.length > 0) {
      await db.insert(serviceMaterials).values(
        materials.map(m => ({
          serviceId: service.id,
          productId: m.productId,
          quantityUsed: m.quantityUsed.toString()
        }))
      );
    }

    revalidatePath('/servicios');
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function updateServiceWithMaterials(serviceId: string, formData: FormData, materials: MaterialInput[]) {
  try {
    const { organizationId } = await requireAuth();
    
    const name = formData.get("name") as string;
    const description = formData.get("description") as string;
    const durationMinutes = parseInt(formData.get("durationMinutes") as string);
    const price = parseFloat(formData.get("price") as string);
    const isActive = formData.get("isActive") === "true";

    if (!name || isNaN(durationMinutes) || isNaN(price)) {
      throw new Error("Faltan datos obligatorios del servicio");
    }

    // Asegurarse de que el servicio pertenece a la org
    const existing = await db.select().from(services).where(and(
      eq(services.id, serviceId),
      eq(services.organizationId, organizationId)
    ));
    if (existing.length === 0) throw new Error("Servicio no encontrado");

    // Update Service
    await db.update(services).set({
      name,
      description,
      durationMinutes,
      price: price.toString(),
      isActive
    }).where(eq(services.id, serviceId));

    // Update Materials: Delete all existing, insert new ones
    await db.delete(serviceMaterials).where(eq(serviceMaterials.serviceId, serviceId));

    if (materials.length > 0) {
      await db.insert(serviceMaterials).values(
        materials.map(m => ({
          serviceId,
          productId: m.productId,
          quantityUsed: m.quantityUsed.toString()
        }))
      );
    }

    revalidatePath('/servicios');
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function deleteService(serviceId: string) {
  try {
    const { organizationId } = await requireAuth();

    const existing = await db.select().from(services).where(and(
      eq(services.id, serviceId),
      eq(services.organizationId, organizationId)
    ));
    if (existing.length === 0) throw new Error("Servicio no encontrado");

    // Delete materials first due to foreign key
    await db.delete(serviceMaterials).where(eq(serviceMaterials.serviceId, serviceId));
    
    // Delete service
    await db.delete(services).where(eq(services.id, serviceId));

    revalidatePath('/servicios');
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function quickCreateProduct(formData: FormData) {
  try {
    const { organizationId } = await requireAuth();

    const name = formData.get("name") as string;
    const costPrice = parseFloat(formData.get("costPrice") as string);
    const currentStock = parseFloat(formData.get("currentStock") as string);
    const minimumStock = parseFloat(formData.get("minimumStock") as string) || 0;

    if (!name || isNaN(costPrice) || isNaN(currentStock)) {
      throw new Error("Faltan datos obligatorios del producto");
    }

    // Insert Product as CONSUMO
    const [product] = await db.insert(products).values({
      organizationId,
      name,
      category: 'CONSUMO',
      costPrice: costPrice.toString(),
      salePrice: '0', // Not for sale
      currentStock: currentStock.toString(),
      minimumStock: minimumStock.toString(),
      isActive: true
    }).returning();

    // Log initial stock in inventory_movements if > 0
    if (currentStock > 0) {
      await db.insert(inventoryMovements).values({
        organizationId,
        productId: product.id,
        type: 'IN',
        quantity: Math.floor(currentStock), // Note: Movement quantity is integer in schema currently
        previousStock: 0,
        newStock: Math.floor(currentStock),
        notes: 'Ajuste inicial desde creación rápida'
      });
    }

    revalidatePath('/servicios');
    return { success: true, data: product };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function batchImportServices(items: any[]) {
  try {
    const { organizationId } = await requireAuth();
    
    if (!items || items.length === 0) return { success: false, error: "No hay servicios para importar" };

    const inserts = items.map(item => ({
      organizationId,
      name: item.name,
      description: item.description || null,
      durationMinutes: item.durationMinutes || 30,
      price: item.price.toString(),
      isActive: true,
    }));
    
    await db.insert(services).values(inserts);
    revalidatePath("/servicios");
    
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

