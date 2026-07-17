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

    // 4. CONSULTAR FINANZAS HOY / DESGLOSE DE CAJA (Admin)
    consultar_finanzas_hoy: tool({
      description: 'ADMIN: Consulta el resumen financiero y el desglose completo de ingresos y gastos de hoy (o de cualquier otro día). Muestra cada transacción con su concepto, monto, método de pago y hora. Úsalo cuando pidan: resumen del día, cuánto se hizo hoy, desglose de caja, ingresos de hoy, etc.',
      inputSchema: z.object({
        fecha: z.string().optional().describe('Fecha a consultar en formato YYYY-MM-DD (ej. "2026-07-17"). Si no se especifica, se usa hoy.'),
      }),
      execute: async (args) => {
        if (!context.isAdmin) return "Acceso denegado: Solo administradores pueden ver finanzas.";

        let start: Date;
        let end: Date;

        if (args.fecha) {
          // Fecha específica proporcionada
          const [year, month, day] = args.fecha.split('-').map(Number);
          // Interpretar la fecha en zona horaria -5 (Colombia/Perú)
          start = new Date(Date.UTC(year, month - 1, day, 5, 0, 0));   // 00:00 local = 05:00 UTC
          end   = new Date(Date.UTC(year, month - 1, day, 28, 59, 59)); // 23:59 local = 04:59 UTC del día siguiente
        } else {
          const { start: s, end: e } = getTodayRange();
          start = s;
          end = e;
        }

        const txs = await db.query.transactions.findMany({
          where: and(
            eq(transactions.organizationId, context.organizationId),
            gte(transactions.createdAt, start),
            lte(transactions.createdAt, end)
          ),
          orderBy: (t, { asc }) => [asc(t.createdAt)],
        });

        if (txs.length === 0) return "No hay transacciones registradas para ese día.";

        let totalIngresos = 0;
        let totalGastos = 0;
        const ingresos: string[] = [];
        const gastos: string[] = [];

        txs.forEach((tx, i) => {
          const hora = new Date(tx.createdAt.getTime() - 5 * 60 * 60 * 1000)
            .toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
          const metodo = tx.paymentMethod ? ` [${tx.paymentMethod}]` : '';
          const concepto = tx.notes ?? 'Sin descripción';
          const monto = Number(tx.totalAmount);

          if (tx.type === 'INCOME') {
            totalIngresos += monto;
            ingresos.push(`  ${i + 1}. ${hora}${metodo} $${monto.toLocaleString('es-CO')} — ${concepto}`);
          } else {
            totalGastos += monto;
            gastos.push(`  ${i + 1}. ${hora}${metodo} $${monto.toLocaleString('es-CO')} — ${concepto}`);
          }
        });

        const balance = totalIngresos - totalGastos;
        const balanceEmoji = balance >= 0 ? '✅' : '⚠️';

        let resumen = `📊 *DESGLOSE DE CAJA*\n`;
        resumen += `📅 ${args.fecha ?? new Date().toLocaleDateString('es-CO', { timeZone: 'America/Bogota' })}\n\n`;

        if (ingresos.length > 0) {
          resumen += `💰 INGRESOS (${ingresos.length}):\n${ingresos.join('\n')}\n`;
          resumen += `   Subtotal ingresos: $${totalIngresos.toLocaleString('es-CO')}\n\n`;
        } else {
          resumen += `💰 INGRESOS: $0\n\n`;
        }

        if (gastos.length > 0) {
          resumen += `💸 GASTOS (${gastos.length}):\n${gastos.join('\n')}\n`;
          resumen += `   Subtotal gastos: $${totalGastos.toLocaleString('es-CO')}\n\n`;
        } else {
          resumen += `💸 GASTOS: $0\n\n`;
        }

        resumen += `${balanceEmoji} BALANCE NETO: $${balance.toLocaleString('es-CO')}`;
        return resumen;
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

    // 6b. REGISTRAR VENTA DE PRODUCTO (Admin) - con cálculo automático de precio
    registrar_venta_producto: tool({
      description: 'ADMIN: Registra la venta de uno o más productos consultando automáticamente el precio en la base de datos y calculando el total. Úsalo cuando digan "registra la venta de X unidades de [producto]", "vendí 2 lociones", "registra venta de X [producto]", etc. NO necesitas saber el precio de antemano, lo busca solo.',
      inputSchema: z.object({
        nombreProducto: z.string().describe('Nombre del producto vendido (búsqueda parcial, ej. "loción", "pomade", "shampoo").'),
        cantidad: z.number().describe('Cantidad de unidades vendidas.'),
        paymentMethod: z.string().optional().describe('Método de pago: CASH, CARD o TRANSFER. Por defecto CASH.'),
        clienteNombre: z.string().optional().describe('Nombre del cliente si se menciona.'),
      }),
      execute: async (args) => {
        if (!context.isAdmin) return "Acceso denegado.";
        try {
          // 1. Buscar el producto por nombre
          const found = await db.query.products.findMany({
            where: and(
              eq(products.organizationId, context.organizationId),
              ilike(products.name, `%${args.nombreProducto}%`)
            ),
          });

          if (found.length === 0) {
            return `No encontré ningún producto con el nombre "${args.nombreProducto}". ¿Puedes verificar el nombre? Usa "consultar_productos" para ver el catálogo.`;
          }

          const producto = found[0];
          const precioUnitario = Number(producto.salePrice ?? 0);

          if (precioUnitario === 0) {
            return `El producto "${producto.name}" no tiene precio de venta configurado. Regístralo manualmente con el monto correcto.`;
          }

          const totalVenta = precioUnitario * args.cantidad;
          const metodo = (args.paymentMethod ?? 'CASH').toUpperCase();
          const clienteTexto = args.clienteNombre ? ` para ${args.clienteNombre}` : '';
          const descripcion = `Venta de ${args.cantidad} ${producto.name}${clienteTexto}`;

          // 2. Registrar la transacción
          await db.insert(transactions).values({
            organizationId: context.organizationId,
            type: 'INCOME',
            totalAmount: totalVenta.toString(),
            paymentMethod: metodo,
            status: 'COMPLETED',
            notes: descripcion,
          });

          revalidatePath('/', 'layout');

          return `✅ Venta registrada:\n📦 ${args.cantidad}x ${producto.name} @ $${precioUnitario.toLocaleString('es-CO')} c/u\n💰 Total: $${totalVenta.toLocaleString('es-CO')} [${metodo}]\n📝 ${descripcion}`;
        } catch (error: any) {
          return `Error registrando venta: ${error.message}`;
        }
      }
    }),

    // 7. CREAR PRODUCTO (Admin)
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

    // 8. CONSULTAR INVENTARIO / PRODUCTOS (Admin)
    consultar_productos: tool({
      description: 'ADMIN: Consulta productos del inventario con stock, precios y categoría. Usar cuando pregunten por precios, existencias, o qué productos hay disponibles. También sirve para buscar el precio de un producto específico.',
      inputSchema: z.object({
        nombre: z.string().optional().describe('Buscar un producto por nombre (búsqueda parcial, ej. "loción"). Dejar vacío para ver todos.'),
        categoria: z.enum(['VENTA', 'CONSUMO', 'TODOS']).optional().describe('Filtrar por categoría: VENTA (para clientes), CONSUMO (uso interno), o TODOS.'),
      }),
      execute: async (args) => {
        if (!context.isAdmin) return "Acceso denegado.";
        const allProducts = await db.query.products.findMany({
          where: args.nombre
            ? and(eq(products.organizationId, context.organizationId), ilike(products.name, `%${args.nombre}%`))
            : eq(products.organizationId, context.organizationId),
        });
        let filtered = allProducts;
        if (args.categoria && args.categoria !== 'TODOS') {
          filtered = allProducts.filter(p => p.category === args.categoria);
        }
        if (filtered.length === 0) return args.nombre ? `No se encontró ningún producto llamado "${args.nombre}".` : "No hay productos registrados.";
        return filtered.map(p =>
          `📦 ${p.name} | Stock: ${p.currentStock} | Precio venta: $${p.salePrice ?? 'N/A'} | Costo: $${p.costPrice ?? 'N/A'} | Categoría: ${p.category} | ${p.isActive ? 'Activo' : 'Inactivo'}`
        ).join('\n');
      }
    }),

    // 9. CONSULTAR CLIENTES (Admin)
    consultar_clientes: tool({
      description: 'ADMIN: Consulta la lista de clientes registrados. Puede buscar por nombre.',
      inputSchema: z.object({
        nombre: z.string().optional().describe('Filtrar clientes por nombre (búsqueda parcial). Dejar vacío para ver todos.'),
      }),
      execute: async (args) => {
        if (!context.isAdmin) return "Acceso denegado.";
        let query = db.select().from(clients).where(eq(clients.organizationId, context.organizationId));
        const allClients = await db.query.clients.findMany({
          where: args.nombre
            ? and(eq(clients.organizationId, context.organizationId), ilike(clients.firstName, `%${args.nombre}%`))
            : eq(clients.organizationId, context.organizationId),
        });
        if (allClients.length === 0) return "No se encontraron clientes.";
        return allClients.map(c =>
          `👤 ${c.firstName}${c.lastName ? ' ' + c.lastName : ''} | Tel: ${c.phone ?? 'N/A'} | Total gastado: $${c.totalSpent ?? 0} | Última visita: ${c.lastVisit ? new Date(c.lastVisit).toLocaleDateString() : 'N/A'}`
        ).join('\n');
      }
    }),

    // 10. CONSULTAR HISTORIAL DE TRANSACCIONES (Admin)
    consultar_transacciones: tool({
      description: 'ADMIN: Consulta el historial de transacciones (ventas/gastos). Puede filtrar por rango de días.',
      inputSchema: z.object({
        dias: z.number().optional().describe('Número de días hacia atrás a consultar (ej. 7 para última semana, 30 para el mes). Por defecto 7.'),
      }),
      execute: async (args) => {
        if (!context.isAdmin) return "Acceso denegado.";
        const dias = args.dias ?? 7;
        const desde = new Date();
        desde.setDate(desde.getDate() - dias);

        const txs = await db.query.transactions.findMany({
          where: and(
            eq(transactions.organizationId, context.organizationId),
            gte(transactions.createdAt, desde)
          ),
          orderBy: (t, { desc }) => [desc(t.createdAt)],
          limit: 50,
        });

        if (txs.length === 0) return `No hay transacciones en los últimos ${dias} días.`;

        const totalIngresos = txs.filter(t => t.type === 'INCOME').reduce((s, t) => s + Number(t.totalAmount), 0);
        const totalGastos = txs.filter(t => t.type === 'EXPENSE').reduce((s, t) => s + Number(t.totalAmount), 0);

        const lista = txs.map(t => {
          const fecha = new Date(t.createdAt).toLocaleDateString();
          const tipo = t.type === 'INCOME' ? '💰 Ingreso' : '💸 Gasto';
          return `${tipo} $${t.totalAmount} - ${t.notes ?? 'Sin descripción'} | ${t.paymentMethod ?? ''} | ${fecha}`;
        }).join('\n');

        return `Resumen últimos ${dias} días:\nIngresos: $${totalIngresos} | Gastos: $${totalGastos} | Balance: $${totalIngresos - totalGastos}\n\n${lista}`;
      }
    }),

    // 11. CONSULTAR CITAS (Admin) - por rango
    consultar_citas: tool({
      description: 'ADMIN: Consulta citas agendadas. Puede ver las de hoy, mañana, o los próximos días.',
      inputSchema: z.object({
        dias: z.number().optional().describe('Número de días hacia adelante a consultar (1 = solo hoy, 7 = próxima semana). Por defecto 1.'),
      }),
      execute: async (args) => {
        if (!context.isAdmin) return "Acceso denegado.";
        const dias = args.dias ?? 1;
        const { start } = getTodayRange();
        const end = new Date(start);
        end.setDate(end.getDate() + dias);

        const appts = await db
          .select({
            startTime: appointments.startTime,
            status: appointments.status,
            notes: appointments.notes,
            clientName: clients.firstName,
            serviceName: services.name,
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

        if (appts.length === 0) return `No hay citas en los próximos ${dias} día(s).`;
        return appts.map(a => {
          const dt = new Date(a.startTime.getTime() - 5 * 60 * 60 * 1000);
          const fecha = dt.toLocaleDateString();
          const hora = dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          return `📅 ${fecha} ${hora} | ${a.clientName} - ${a.serviceName} (${a.status})`;
        }).join('\n');
      }
    }),
  };

  return tools;
}
