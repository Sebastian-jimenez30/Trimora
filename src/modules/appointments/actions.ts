"use server";

import { db } from "@/core/database/db";
import { appointments, clients, services, organizationMembers } from "@/core/database/schema";
import { eq, ilike, and } from "drizzle-orm";

export async function createAppointmentFromAI({
  organizationId,
  customerName,
  customerPhone,
  serviceName,
  date,
}: {
  organizationId: string;
  customerName: string;
  customerPhone: string;
  serviceName: string;
  date: string;
}) {
  try {
    // 1. Find or create client
    let clientId = "";
    const existingClient = await db.query.clients.findFirst({
      where: and(
        eq(clients.organizationId, organizationId),
        ilike(clients.firstName, `%${customerName}%`) // Buscamos si ya existe el nombre
      )
    });

    if (existingClient) {
      clientId = existingClient.id;
    } else {
      const [newClient] = await db.insert(clients).values({
        organizationId,
        firstName: customerName,
        phone: customerPhone,
      }).returning({ id: clients.id });
      clientId = newClient.id;
    }

    // 2. Find service
    const matchedService = await db.query.services.findFirst({
      where: and(
        eq(services.organizationId, organizationId),
        ilike(services.name, `%${serviceName}%`) // Buscamos aproximación del servicio
      )
    });
    
    if (!matchedService) {
      throw new Error(`No pude encontrar un servicio llamado "${serviceName}". Por favor pídale al cliente que elija uno válido.`);
    }

    // 3. Find available staff (solo el primero para esta versión de prueba)
    const staffMember = await db.query.organizationMembers.findFirst({
      where: eq(organizationMembers.organizationId, organizationId)
    });

    if (!staffMember) {
      throw new Error("No hay barberos o personal registrado en el sistema para asignar el turno.");
    }

    // 4. Calculate times
    const startTime = new Date(date);
    const endTime = new Date(startTime.getTime() + matchedService.durationMinutes * 60000);

    // 5. Insert appointment
    const [newAppointment] = await db.insert(appointments).values({
      organizationId,
      clientId,
      staffId: staffMember.id,
      serviceId: matchedService.id,
      startTime,
      endTime,
      status: 'CONFIRMED', // Lo confirmamos directamente al venir de la IA
      notes: 'Agendado automáticamente vía WhatsApp IA'
    }).returning();

    return {
      success: true,
      appointmentId: newAppointment.id,
      clientName: customerName,
      serviceName: matchedService.name,
      startTime: startTime.toISOString(),
      message: `Cita creada exitosamente para ${customerName} el ${startTime.toLocaleString()} para el servicio ${matchedService.name}.`
    };
  } catch (error: any) {
    console.error("Error creating AI appointment:", error);
    return {
      success: false,
      message: error.message || "Ocurrió un error inesperado al guardar la cita en la base de datos."
    };
  }
}
