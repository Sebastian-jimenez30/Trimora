"use server";

import { db } from "@/core/database/db";
import { appointments, clients, services, organizationMembers } from "@/core/database/schema";
import { requireActor } from "@/core/auth/server/actor";
import { eq, and, lt, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import {
  appointmentInputSchema,
  appointmentStatusSchema,
  resourceIdSchema,
} from "./domain/schemas";
import { getErrorMessage } from "@/core/errors";

async function validateAppointmentResources(
  organizationId: string,
  input: { clientId: string; staffId: string; serviceId: string },
) {
  const [client, staff, service] = await Promise.all([
    db.query.clients.findFirst({
      where: and(eq(clients.id, input.clientId), eq(clients.organizationId, organizationId)),
    }),
    db.query.organizationMembers.findFirst({
      where: and(
        eq(organizationMembers.id, input.staffId),
        eq(organizationMembers.organizationId, organizationId),
      ),
    }),
    db.query.services.findFirst({
      where: and(eq(services.id, input.serviceId), eq(services.organizationId, organizationId)),
    }),
  ]);
  if (!client || !staff || !service) throw new Error("Cliente, colaborador o servicio no válido");
}

export async function createAppointment(formData: FormData) {
  try {
    const { organizationId } = await requireActor();

    const input = appointmentInputSchema.parse({
      clientId: formData.get("clientId"),
      staffId: formData.get("staffId"),
      serviceId: formData.get("serviceId"),
      startTime: formData.get("startTime"),
      endTime: formData.get("endTime"),
      status: formData.get("status") || "PENDING",
      notes: formData.get("notes") || null,
    });
    await validateAppointmentResources(organizationId, input);

    await db.insert(appointments).values({
      organizationId,
      ...input,
    });

    revalidatePath("/agenda");
    return { success: true };
  } catch (error: unknown) {
    console.error("Error creating appointment:", error);
    return { success: false, error: getErrorMessage(error) };
  }
}

export async function updateAppointment(id: string, formData: FormData) {
  try {
    const { organizationId } = await requireActor();

    const appointmentId = resourceIdSchema.parse(id);
    const input = appointmentInputSchema.parse({
      clientId: formData.get("clientId"),
      staffId: formData.get("staffId"),
      serviceId: formData.get("serviceId"),
      startTime: formData.get("startTime"),
      endTime: formData.get("endTime"),
      status: formData.get("status"),
      notes: formData.get("notes") || null,
    });
    await validateAppointmentResources(organizationId, input);

    await db
      .update(appointments)
      .set(input)
      .where(
        and(eq(appointments.id, appointmentId), eq(appointments.organizationId, organizationId)),
      );

    revalidatePath("/agenda");
    return { success: true };
  } catch (error: unknown) {
    console.error("Error updating appointment:", error);
    return { success: false, error: getErrorMessage(error) };
  }
}

export async function updateAppointmentStatus(id: string, status: string) {
  try {
    const { organizationId } = await requireActor();

    const appointmentId = resourceIdSchema.parse(id);
    const validStatus = appointmentStatusSchema.parse(status);
    await db
      .update(appointments)
      .set({ status: validStatus })
      .where(
        and(eq(appointments.id, appointmentId), eq(appointments.organizationId, organizationId)),
      );

    revalidatePath("/agenda");
    return { success: true };
  } catch (error: unknown) {
    console.error("Error updating appointment status:", error);
    return { success: false, error: getErrorMessage(error) };
  }
}

export async function deleteAppointment(id: string) {
  try {
    const { organizationId } = await requireActor();

    const appointmentId = resourceIdSchema.parse(id);
    await db
      .delete(appointments)
      .where(
        and(eq(appointments.id, appointmentId), eq(appointments.organizationId, organizationId)),
      );

    revalidatePath("/agenda");
    return { success: true };
  } catch (error: unknown) {
    console.error("Error deleting appointment:", error);
    return { success: false, error: getErrorMessage(error) };
  }
}

export async function getPendingAppointmentsForToday() {
  try {
    const { organizationId } = await requireActor();

    const now = new Date();
    const pendingAppointments = await db
      .select({
        id: appointments.id,
        startTime: appointments.startTime,
        endTime: appointments.endTime,
        status: appointments.status,
        clientId: appointments.clientId,
        clientName: clients.firstName,
        clientLastName: clients.lastName,
        serviceId: appointments.serviceId,
        serviceName: services.name,
        servicePrice: services.price,
        staffId: appointments.staffId,
      })
      .from(appointments)
      .leftJoin(clients, eq(appointments.clientId, clients.id))
      .leftJoin(services, eq(appointments.serviceId, services.id))
      .where(
        and(
          eq(appointments.organizationId, organizationId),
          inArray(appointments.status, ["PENDING", "CONFIRMED"]),
          lt(appointments.startTime, now), // Incluye citas vencidas para poder cobrarlas con trazabilidad
        ),
      )
      .orderBy(appointments.startTime);

    return { success: true, data: pendingAppointments };
  } catch (error: unknown) {
    console.error("Error getting pending appointments:", error);
    return { success: false, error: getErrorMessage(error) };
  }
}
