"use server";

import { db } from "@/core/database/db";
import { clients } from "@/core/database/schema";
import { requireActor } from "@/core/auth/server/actor";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getErrorMessage } from "@/core/errors";
import { z } from "zod";

const customerIdSchema = z.string().uuid();
const customerSchema = z.object({
  firstName: z.string().trim().min(1).max(120),
  lastName: z.string().trim().max(120),
  email: z.union([z.literal(""), z.string().trim().email().max(320)]),
  phone: z.string().trim().max(40),
  notes: z.string().trim().max(2_000),
});

function parseCustomer(formData: FormData) {
  return customerSchema.parse({
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName") || "",
    email: formData.get("email") || "",
    phone: formData.get("phone") || "",
    notes: formData.get("notes") || "",
  });
}

export async function createCustomer(formData: FormData) {
  try {
    const { organizationId: orgId } = await requireActor();
    const input = parseCustomer(formData);

    const [newClient] = await db
      .insert(clients)
      .values({
        organizationId: orgId,
        ...input,
      })
      .returning();

    revalidatePath("/clientes");
    revalidatePath("/agenda"); // Update agenda so it fetches the new client
    return { success: true, clientId: newClient.id };
  } catch (error: unknown) {
    return { success: false, error: getErrorMessage(error) };
  }
}

export async function updateCustomer(id: string, formData: FormData) {
  try {
    const { organizationId: orgId } = await requireActor();
    const customerId = customerIdSchema.parse(id);
    const input = parseCustomer(formData);

    await db
      .update(clients)
      .set(input)
      .where(and(eq(clients.id, customerId), eq(clients.organizationId, orgId)));

    revalidatePath("/clientes");
    return { success: true };
  } catch (error: unknown) {
    return { success: false, error: getErrorMessage(error) };
  }
}

export async function deleteCustomer(id: string) {
  try {
    const { organizationId: orgId } = await requireActor();
    const customerId = customerIdSchema.parse(id);

    await db
      .delete(clients)
      .where(and(eq(clients.id, customerId), eq(clients.organizationId, orgId)));

    revalidatePath("/clientes");
    return { success: true };
  } catch {
    // Probablemente error de llave foránea (Foreign Key Constraint)
    return {
      success: false,
      error: "No se puede eliminar el cliente porque tiene citas o ventas asociadas.",
    };
  }
}
