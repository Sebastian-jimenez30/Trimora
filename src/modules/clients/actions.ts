"use server"

import { db } from "@/core/database/db";
import { clients, organizationMembers } from "@/core/database/schema";
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

export async function createCustomer(formData: FormData) {
  try {
    const orgId = await getOrganizationId();
    
    const [newClient] = await db.insert(clients).values({
      organizationId: orgId,
      firstName: formData.get("firstName") as string,
      lastName: formData.get("lastName") as string,
      email: formData.get("email") as string,
      phone: formData.get("phone") as string,
      notes: formData.get("notes") as string,
    }).returning();

    revalidatePath("/clientes");
    revalidatePath("/agenda"); // Update agenda so it fetches the new client
    return { success: true, clientId: newClient.id };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function updateCustomer(id: string, formData: FormData) {
  try {
    const orgId = await getOrganizationId();
    
    await db.update(clients)
      .set({
        firstName: formData.get("firstName") as string,
        lastName: formData.get("lastName") as string,
        email: formData.get("email") as string,
        phone: formData.get("phone") as string,
        notes: formData.get("notes") as string,
      })
      .where(and(eq(clients.id, id), eq(clients.organizationId, orgId)));

    revalidatePath("/clientes");
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function deleteCustomer(id: string) {
  try {
    const orgId = await getOrganizationId();
    
    await db.delete(clients).where(and(eq(clients.id, id), eq(clients.organizationId, orgId)));

    revalidatePath("/clientes");
    return { success: true };
  } catch (error: any) {
    // Probablemente error de llave foránea (Foreign Key Constraint)
    return { success: false, error: "No se puede eliminar el cliente porque tiene citas o ventas asociadas." };
  }
}
