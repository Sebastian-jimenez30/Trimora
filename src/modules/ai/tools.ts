import { tool } from 'ai';
import { z } from 'zod';
import { db } from "@/core/database/db";
import { appointments, clients, services, products, transactions, transactionItems, organizationMembers } from "@/core/database/schema";
import { eq, ilike, and, gte, lte } from "drizzle-orm";
import { createAppointmentFromAI } from '@/modules/appointments/actions';
import { revalidatePath } from 'next/cache';

// Helpers para fechas (Zona Horaria Bogotá/Lima/Quito -05:00)
function getTodayRange() {
  const now = new Date();
  // Ajuste rápido a timezone -5 para evitar desfases si el servidor está en UTC
  now.setHours(now.getHours() - 5);
  
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
  
  // Re-ajustamos a UTC sumando 5 horas para que Drizzle consulte correctamente el Timestamp
  startOfDay.setHours(startOfDay.getHours() + 5);
  endOfDay.setHours(endOfDay.getHours() + 5);

  return { start: startOfDay, end: endOfDay };
}

export function getAiTools(context: { organizationId: string; telegramUserId: string; fromName: string; isAdmin: boolean }) {
  const tools: Record<string, any> = {
    // 1. AGENDAR CITA (Público)
    agendar_cita: tool({
      description: 'Agenda una cita en la barbería para un cliente.',
      inputSchema: z.object({
        serviceName: z.string().describe('El nombre del servicio a agendar (ej. Corte, Barba)'),
        date: z.string().describe('La fecha y hora en formato ISO 8601 con zona horaria (SIEMPRE usar -05:00 al final, ej. 2026-07-17T09:00:00-05:00)'),
        customerNameOverride: z.string().optional().describe('Si la persona está agendando para un amigo, el nombre del amigo. Si es para él mismo, dejar vacío.'),
      }),
      execute: async (args) => {
        const { serviceName, date, customerNameOverride } = args;
        const targetName = customerNameOverride || context.fromName;
        try {
          const res = await createAppointmentFromAI({
            organizationId: context.organizationId,
            customerName: targetName,
            customerPhone: context.telegramUserId,
            serviceName,
            date
          });
          revalidatePath('/', 'layout');
          return res.message;
        } catch (error: any) {
          console.error("Error agendando cita", error);
          return `Hubo un error agendando la cita: ${error.message}`;
        }
      }
    }),
    
    // 2. LISTAR CATÁLOGO DE SERVICIOS (Público)
    listar_servicios: tool({
      description: 'Devuelve la lista de servicios disponibles en la barbería con sus precios y duración. Útil cuando el cliente pregunta qué ofrecen o cuánto cuesta.',
      inputSchema: z.object({}),
      execute: async () => {
        const allServices = await db.query.services.findMany({
          where: eq(services.organizationId, context.organizationId)
        });
        if (allServices.length === 0) return "No hay servicios registrados.";
        return allServices.map(s => `- ${s.name}: $${s.price} (${s.durationMinutes} min)`).join('\n');
      }
    }),

    // -------------------------------------------------------------
    // HERRAMIENTAS DE ADMINISTRADOR (Requieren isAdmin = true)
    // -------------------------------------------------------------
    
    // 3. CONSULTAR AGENDA HOY (Admin)
    consultar_agenda_hoy: tool({
      description: 'ADMIN: Consulta la agenda y las citas programadas para el día de hoy.',
      inputSchema: z.object({}),
      execute: async () => {
        if (!context.isAdmin) return "Acceso denegado: Esta acción solo está permitida para administradores.";
        const { start, end } = getTodayRange();
        
        const todayAppointments = await db
          .select({
            id: appointments.id,
            startTime: appointments.startTime,
            status: appointments.status,
            clientName: clients.firstName,
            serviceName: services.name
          })
          .from(appointments)
          .innerJoin(clients, eq(appointments.clientId, clients.id))
          .innerJoin(services, eq(appointments.serviceId, services.id))
          .where(
            and(
              eq(appointments.organizationId, context.organizationId),
              gte(appointments.startTime, start),
              lte(appointments.startTime, end)
            )
          )
          .orderBy(appointments.startTime);

        if (todayAppointments.length === 0) return "No hay citas agendadas para hoy.";
        return todayAppointments.map(a => {
          const time = new Date(a.startTime.getTime() - 5 * 60 * 60 * 1000).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}); // Ajuste -5h visual
          return `[${time}] ${a.clientName} - ${a.serviceName} (${a.status})`;
        }).join('\n');
      }
    }),

    // 4. CONSULTAR FINANZAS HOY (Admin)
    consultar_finanzas_hoy: tool({
      description: 'ADMIN: Consulta cuánto dinero ha ingresado y cuánto se ha gastado en el día de hoy.',
      inputSchema: z.object({}),
      execute: async () => {
        if (!context.isAdmin) return "Acceso denegado: Solo administradores pueden ver finanzas.";
        const { start, end } = getTodayRange();

        const txs = await db.query.transactions.findMany({
          where: and(
            eq(transactions.organizationId, context.organizationId),
            gte(transactions.createdAt, start),
            lte(transactions.createdAt, end)
          )
        });

        let ingresos = 0;
        let gastos = 0;
        txs.forEach(tx => {
          if (tx.type === 'INCOME') ingresos += Number(tx.totalAmount);
          if (tx.type === 'EXPENSE') gastos += Number(tx.totalAmount);
        });

        return `Resumen de hoy:\nIngresos Totales: $${ingresos}\nGastos Totales: $${gastos}\nBalance: $${ingresos - gastos}`;
      }
    }),

    // 5. REGISTRAR TRANSACCIÓN DE CAJA (Admin)
    registrar_transaccion_caja: tool({
      description: 'ADMIN: Registra una nueva transacción de caja (ingreso o gasto).',
      inputSchema: z.object({
        type: z.enum(['INCOME', 'EXPENSE']).describe('INCOME para ingresos (cobros, ventas), EXPENSE para gastos (compras, sueldos).'),
        amount: z.number().describe('El monto total de la transacción.'),
        paymentMethod: z.string().describe('Método de pago: CASH, CARD, TRANSFER, u otro.'),
        description: z.string().describe('Breve descripción de lo que se está registrando.')
      }),
      execute: async (args) => {
        if (!context.isAdmin) return "Acceso denegado: Solo administradores pueden alterar la caja.";
        
        try {
          await db.insert(transactions).values({
            organizationId: context.organizationId,
            type: args.type,
            totalAmount: args.amount.toString(),
            paymentMethod: args.paymentMethod.toUpperCase(),
            status: 'COMPLETED',
            notes: args.description
          });
          revalidatePath('/', 'layout');
          return `Transacción registrada exitosamente: ${args.type === 'INCOME' ? 'Ingreso' : 'Gasto'} de $${args.amount} (${args.description}).`;
        } catch (error: any) {
          return `Error registrando transacción: ${error.message}`;
        }
      }
    }),

    // 6. CREAR PRODUCTO (Admin)
    crear_producto: tool({
      description: 'ADMIN: Registra un nuevo producto en el catálogo / inventario.',
      inputSchema: z.object({
        name: z.string().describe('Nombre del producto'),
        category: z.enum(['VENTA', 'CONSUMO']).describe('VENTA si es para vender a clientes, CONSUMO si es de uso interno de la barbería.'),
        price: z.number().describe('Precio de venta (si es para venta). Poner 0 si es solo de consumo.'),
        stock: z.number().describe('Cantidad actual en inventario')
      }),
      execute: async (args) => {
        if (!context.isAdmin) return "Acceso denegado.";
        try {
          await db.insert(products).values({
            organizationId: context.organizationId,
            name: args.name,
            category: args.category,
            salePrice: args.price.toString(),
            currentStock: args.stock.toString(),
            isActive: true
          });
          revalidatePath('/', 'layout');
          return `[SISTEMA] Producto "${args.name}" creado con éxito en la base de datos.`;
        } catch (error: any) {
          return `Error creando producto: ${error.message}`;
        }
      }
    }),

    // 7. CREAR SERVICIO (Admin)
    crear_servicio: tool({
      description: 'ADMIN: Registra un nuevo servicio en el catálogo (ej. Corte, Barba, Cejas).',
      inputSchema: z.object({
        name: z.string().describe('Nombre del servicio'),
        price: z.number().describe('Costo del servicio para el cliente'),
        durationMinutes: z.number().describe('Duración estimada en minutos (ej. 30, 45, 60)')
      }),
      execute: async (args) => {
        if (!context.isAdmin) return "Acceso denegado.";
        try {
          await db.insert(services).values({
            organizationId: context.organizationId,
            name: args.name,
            price: args.price.toString(),
            durationMinutes: args.durationMinutes,
            isActive: true
          });
          revalidatePath('/', 'layout');
          return `[SISTEMA] Servicio "${args.name}" creado con éxito en la base de datos por $${args.price} (${args.durationMinutes} mins).`;
        } catch (error: any) {
          return `Error creando servicio: ${error.message}`;
        }
      }
    }),
  };

  return tools;
}
