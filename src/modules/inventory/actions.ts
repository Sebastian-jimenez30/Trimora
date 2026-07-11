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
