"use server"

import { db } from "@/core/database/db";
import { products, organizationMembers } from "@/core/database/schema";
import { createClient } from "@/core/database/server";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";

async function getOrganizationId() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");

  const member = await db.select().from(organizationMembers).where(eq(organizationMembers.userId, user.id)).limit(1);
  if (!member[0]) throw new Error("No tienes organización");

  return member[0].organizationId;
}

export async function createProduct(formData: FormData) {
  try {
    const orgId = await getOrganizationId();
    
    await db.insert(products).values({
      organizationId: orgId,
      name: formData.get("name") as string,
      description: formData.get("description") as string,
      category: formData.get("category") as string,
      currentStock: formData.get("currentStock") as string || "0",
      minimumStock: formData.get("minimumStock") as string || "0",
      salePrice: formData.get("salePrice") as string || null,
      costPrice: formData.get("costPrice") as string || null,
    });

    revalidatePath("/inventario");
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function updateProduct(id: string, formData: FormData) {
  try {
    const orgId = await getOrganizationId();
    
    await db.update(products)
      .set({
        name: formData.get("name") as string,
        description: formData.get("description") as string,
        category: formData.get("category") as string,
        currentStock: formData.get("currentStock") as string,
        minimumStock: formData.get("minimumStock") as string,
        salePrice: formData.get("salePrice") as string || null,
        costPrice: formData.get("costPrice") as string || null,
      })
      .where(and(eq(products.id, id), eq(products.organizationId, orgId)));

    revalidatePath("/inventario");
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function deleteProduct(id: string) {
  try {
    const orgId = await getOrganizationId();
    
    await db.delete(products).where(and(eq(products.id, id), eq(products.organizationId, orgId)));

    revalidatePath("/inventario");
    return { success: true };
  } catch (error: any) {
    return { success: false, error: "No se puede eliminar el producto porque está vinculado a servicios o ventas." };
  }
}

import { z } from "zod";

const ProductImportSchema = z.object({
  name: z.string().min(1, "El nombre es requerido").max(255),
  description: z.string().optional().nullable(),
  category: z.enum(["VENTA", "CONSUMO"]),
  currentStock: z.union([z.string(), z.number()]).optional().transform(v => v?.toString() || '0'),
  minimumStock: z.union([z.string(), z.number()]).optional().transform(v => v?.toString() || '0'),
  salePrice: z.union([z.string(), z.number()]).optional().nullable().transform(v => v ? v.toString() : null),
  costPrice: z.union([z.string(), z.number()]).optional().nullable().transform(v => v ? v.toString() : null),
});

export async function batchImportProducts(items: any[]) {
  try {
    const orgId = await getOrganizationId();
    
    if (!items || !Array.isArray(items) || items.length === 0) {
      return { success: false, error: "No hay productos para importar o formato inválido" };
    }

    // Validar y sanear los datos de entrada
    const parsedItems = [];
    for (const item of items) {
      const parsed = ProductImportSchema.safeParse(item);
      if (!parsed.success) {
        throw new Error(`Error validando el producto "${item?.name || 'Desconocido'}": ${parsed.error.issues[0].message}`);
      }
      parsedItems.push(parsed.data);
    }

    const inserts = parsedItems.map(item => ({
      organizationId: orgId,
      name: item.name,
      description: item.description,
      category: item.category,
      currentStock: item.currentStock,
      minimumStock: item.minimumStock,
      salePrice: item.salePrice,
      costPrice: item.costPrice,
      isActive: true,
    }));
    
    await db.insert(products).values(inserts);
    revalidatePath("/inventario");
    
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
