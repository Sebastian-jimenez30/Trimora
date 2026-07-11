"use server"

import { db } from "@/core/database/db";
import { appointments } from "@/core/database/schema";
import { createClient } from "@/core/database/server";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";

// Función auxiliar para verificar la autenticación
async function requireAuth() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");
  
  const organizationId = user.user_metadata?.organization_id;
  if (!organizationId) throw new Error("Usuario sin organización");

  return { user, organizationId };
}

export async function createAppointment(formData: FormData) {
  try {
    const { organizationId } = await requireAuth();
    
    const clientId = formData.get("clientId") as string;
    const staffId = formData.get("staffId") as string;
    const serviceId = formData.get("serviceId") as string;
    const startTimeStr = formData.get("startTime") as string;
    const endTimeStr = formData.get("endTime") as string;
    const status = (formData.get("status") as string) || "PENDING";
    const notes = formData.get("notes") as string | null;

    if (!clientId || !staffId || !serviceId || !startTimeStr || !endTimeStr) {
      return { success: false, error: "Faltan campos obligatorios" };
    }

    const startTime = new Date(startTimeStr);
    const endTime = new Date(endTimeStr);

    await db.insert(appointments).values({
      organizationId,
      clientId,
      staffId,
      serviceId,
      startTime,
      endTime,
      status,
      notes,
    });

    revalidatePath("/agenda");
    return { success: true };
  } catch (error: any) {
    console.error("Error creating appointment:", error);
    return { success: false, error: error.message };
  }
}

export async function updateAppointment(id: string, formData: FormData) {
  try {
    const { organizationId } = await requireAuth();
    
    const clientId = formData.get("clientId") as string;
    const staffId = formData.get("staffId") as string;
    const serviceId = formData.get("serviceId") as string;
    const startTimeStr = formData.get("startTime") as string;
    const endTimeStr = formData.get("endTime") as string;
    const status = formData.get("status") as string;
    const notes = formData.get("notes") as string | null;

    if (!clientId || !staffId || !serviceId || !startTimeStr || !endTimeStr) {
      return { success: false, error: "Faltan campos obligatorios" };
    }

    const startTime = new Date(startTimeStr);
    const endTime = new Date(endTimeStr);

    await db.update(appointments)
      .set({
        clientId,
        staffId,
        serviceId,
        startTime,
        endTime,
        status,
        notes,
      })
      .where(and(eq(appointments.id, id), eq(appointments.organizationId, organizationId)));

    revalidatePath("/agenda");
    return { success: true };
  } catch (error: any) {
    console.error("Error updating appointment:", error);
    return { success: false, error: error.message };
  }
}

export async function updateAppointmentStatus(id: string, status: string) {
  try {
    const { organizationId } = await requireAuth();

    await db.update(appointments)
      .set({ status })
      .where(and(eq(appointments.id, id), eq(appointments.organizationId, organizationId)));

    revalidatePath("/agenda");
    return { success: true };
  } catch (error: any) {
    console.error("Error updating appointment status:", error);
    return { success: false, error: error.message };
  }
}

export async function deleteAppointment(id: string) {
  try {
    const { organizationId } = await requireAuth();

    await db.delete(appointments)
      .where(and(eq(appointments.id, id), eq(appointments.organizationId, organizationId)));

    revalidatePath("/agenda");
    return { success: true };
  } catch (error: any) {
    console.error("Error deleting appointment:", error);
    return { success: false, error: error.message };
  }
}
