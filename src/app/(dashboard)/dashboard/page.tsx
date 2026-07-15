import { createClient } from "@/core/database/server";
import { db } from "@/core/database/db";
import { 
  organizationMembers, 
  dailySummaries, 
  appointments, 
  clients, 
  services, 
  transactions, 
  products 
} from "@/core/database/schema";
import { eq, and, gte, lt, desc, asc, lte, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import Link from "next/link";

import { formatInTimeZone, toDate } from 'date-fns-tz';

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // 1. Obtener la Organización del usuario desde la metadata de Auth
  const orgId = user.user_metadata?.organization_id;

  if (!orgId) {
    return <div className="p-10 text-white">No tienes una organización asignada. Por favor, contacta al administrador.</div>;
  }

  // Fechas base (Zona Horaria Bogotá)
  const TIMEZONE = 'America/Bogota';
  const now = new Date();
  const bogotaDateStr = formatInTimeZone(now, TIMEZONE, 'yyyy-MM-dd');
  const today = toDate(`${bogotaDateStr}T00:00:00.000`, { timeZone: TIMEZONE });
  const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);

  // 2. Obtener KPIs Diarios (Dinámicos)
  // Ingresos del día
  const todaysTransactions = await db.select({ totalAmount: transactions.totalAmount })
    .from(transactions)
    .where(
      and(
        eq(transactions.organizationId, orgId),
        eq(transactions.type, 'INCOME'),
        gte(transactions.createdAt, today)
      )
    );
  
  const ingresosDia = todaysTransactions.reduce((acc, curr) => acc + parseFloat(curr.totalAmount), 0).toFixed(2);

  // Citas agendadas hoy
  const todaysAppointmentsQuery = await db.select({ count: sql<number>`count(*)` })
    .from(appointments)
    .where(
      and(
        eq(appointments.organizationId, orgId),
        gte(appointments.createdAt, today)
      )
    );
  
  const citasAgendadas = todaysAppointmentsQuery[0]?.count || 0;

  // Clientes nuevos hoy
  const newClientsQuery = await db.select({ count: sql<number>`count(*)` })
    .from(clients)
    .where(
      and(
        eq(clients.organizationId, orgId),
        gte(clients.createdAt, today)
      )
    );
  
  const clientesNuevos = newClientsQuery[0]?.count || 0;

  // 3. Obtener Servicio más popular (Top 1)
  const popularServiceQuery = await db.select({
    name: services.name,
    count: sql<number>`count(${appointments.id})`
  })
  .from(appointments)
  .leftJoin(services, eq(appointments.serviceId, services.id))
  .where(eq(appointments.organizationId, orgId))
  .groupBy(services.name)
  .orderBy(desc(sql`count(${appointments.id})`))
  .limit(1);

  const popularService = popularServiceQuery[0]?.name || "---";

  // 4. Próximas Citas Hoy
  const upcomingAppointments = await db.select({
    id: appointments.id,
    startTime: appointments.startTime,
    status: appointments.status,
    clientName: clients.firstName,
    clientLastName: clients.lastName,
    serviceName: services.name,
  })
  .from(appointments)
  .leftJoin(clients, eq(appointments.clientId, clients.id))
  .leftJoin(services, eq(appointments.serviceId, services.id))
  .where(
    and(
      eq(appointments.organizationId, orgId),
      gte(appointments.startTime, now), // A partir de este instante
      lt(appointments.startTime, tomorrow)
    )
  )
  .orderBy(asc(appointments.startTime))
  .limit(5);

  // 5. Últimas Ventas (POS)
  const recentSales = await db.select({
    id: transactions.id,
    totalAmount: transactions.totalAmount,
    paymentMethod: transactions.paymentMethod,
    createdAt: transactions.createdAt,
    clientName: clients.firstName,
  })
  .from(transactions)
  .leftJoin(clients, eq(transactions.clientId, clients.id))
  .where(eq(transactions.organizationId, orgId))
  .orderBy(desc(transactions.createdAt))
  .limit(4);

  // 6. Alertas de Inventario
  const inventoryAlerts = await db.select()
    .from(products)
    .where(
      and(
        eq(products.organizationId, orgId),
        lte(products.currentStock, products.minimumStock)
      )
    )
    .limit(5);

  return (
    <div className="p-4 md:p-[30px] flex flex-col gap-4 md:gap-6">
      
      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        <div className="bg-gradient-to-br from-[#141414] to-[#1a1a1a] border border-white/10 rounded-xl p-5 flex items-center gap-[15px] transition-all hover:-translate-y-[3px] hover:shadow-[0_8px_15px_rgba(0,0,0,0.4)] hover:border-cognac/40">
          <div className="w-[50px] h-[50px] rounded-lg bg-cognac/10 text-cognac flex items-center justify-center shrink-0">
            <svg viewBox="0 0 24 24" className="w-6 h-6 fill-current"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>
          </div>
          <div>
            <h3 className="text-2xl font-bold mb-1">${ingresosDia}</h3>
            <p className="text-xs text-charcoal uppercase tracking-[0.5px]">Ingresos del Día</p>
          </div>
        </div>

        <div className="bg-gradient-to-br from-[#141414] to-[#1a1a1a] border border-white/10 rounded-xl p-5 flex items-center gap-[15px] transition-all hover:-translate-y-[3px] hover:shadow-[0_8px_15px_rgba(0,0,0,0.4)] hover:border-cognac/40">
          <div className="w-[50px] h-[50px] rounded-lg bg-cognac/10 text-cognac flex items-center justify-center shrink-0">
            <svg viewBox="0 0 24 24" className="w-6 h-6 fill-current"><path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.11 0-1.99.9-1.99 2L3 20a2 2 0 0 0 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10zm0-12H5V6h14v2zm-7 5h5v5h-5z"/></svg>
          </div>
          <div>
            <h3 className="text-2xl font-bold mb-1">{citasAgendadas}</h3>
            <p className="text-xs text-charcoal uppercase tracking-[0.5px]">Citas Agendadas</p>
          </div>
        </div>

        <div className="bg-gradient-to-br from-[#141414] to-[#1a1a1a] border border-white/10 rounded-xl p-5 flex items-center gap-[15px] transition-all hover:-translate-y-[3px] hover:shadow-[0_8px_15px_rgba(0,0,0,0.4)] hover:border-cognac/40">
          <div className="w-[50px] h-[50px] rounded-lg bg-cognac/10 text-cognac flex items-center justify-center shrink-0">
            <svg viewBox="0 0 24 24" className="w-6 h-6 fill-current"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>
          </div>
          <div>
            <h3 className="text-2xl font-bold mb-1">{clientesNuevos}</h3>
            <p className="text-xs text-charcoal uppercase tracking-[0.5px]">Clientes Nuevos</p>
          </div>
        </div>

        <div className="bg-gradient-to-br from-[#141414] to-[#1a1a1a] border border-white/10 rounded-xl p-5 flex items-center gap-[15px] transition-all hover:-translate-y-[3px] hover:shadow-[0_8px_15px_rgba(0,0,0,0.4)] hover:border-cognac/40">
          <div className="w-[50px] h-[50px] rounded-lg bg-cognac/10 text-cognac flex items-center justify-center shrink-0">
            <svg viewBox="0 0 24 24" className="w-6 h-6 fill-current"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>
          </div>
          <div>
            <h3 className="text-lg font-bold mt-1 text-cognac">{popularService}</h3>
            <p className="text-xs text-charcoal uppercase tracking-[0.5px]">Servicio más popular</p>
          </div>
        </div>
      </div>

      {/* Main Dashboard Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 md:gap-6">
        
        {/* Columna Izquierda (Ancha) */}
        <div className="xl:col-span-2 flex flex-col gap-4 md:gap-6">
          
          {/* Próximas Citas */}
          <div className="bg-[#141414] border border-white/10 rounded-xl p-4 md:p-6 overflow-x-auto">
            <div className="flex justify-between items-center mb-5 min-w-[500px]">
              <h3 className="font-serif text-lg text-sterling">Próximas Citas Hoy</h3>
            </div>
            
            {upcomingAppointments.length === 0 ? (
              <div className="py-10 text-center text-charcoal text-sm">
                No hay citas programadas para el resto del día.
              </div>
            ) : (
              <table className="w-full border-collapse min-w-[500px]">
                <thead>
                  <tr>
                    <th className="text-left py-3 px-2.5 text-xs text-charcoal font-medium border-b border-white/10">Hora</th>
                    <th className="text-left py-3 px-2.5 text-xs text-charcoal font-medium border-b border-white/10">Cliente</th>
                    <th className="text-left py-3 px-2.5 text-xs text-charcoal font-medium border-b border-white/10">Servicio</th>
                    <th className="text-left py-3 px-2.5 text-xs text-charcoal font-medium border-b border-white/10">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {upcomingAppointments.map((apt) => (
                    <tr key={apt.id} className="hover:bg-white/5 transition-colors border-b border-white/5">
                      <td className="py-3 px-2.5 text-sm text-sterling">
                        {apt.startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="py-3 px-2.5 text-sm text-sterling">
                        {apt.clientName} {apt.clientLastName || ''}
                      </td>
                      <td className="py-3 px-2.5 text-sm text-sterling">
                        {apt.serviceName}
                      </td>
                      <td className="py-3 px-2.5">
                        <span className={`px-2 py-1 rounded text-[10px] uppercase font-bold tracking-wider ${
                          apt.status === 'COMPLETED' ? 'bg-green-900/30 text-green-500' :
                          apt.status === 'PENDING' ? 'bg-cognac/20 text-cognac' :
                          'bg-white/10 text-white'
                        }`}>
                          {apt.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Columna Derecha (Estrecha) */}
        <div className="flex flex-col gap-4 md:gap-6">
          
          {/* Alertas de Inventario */}
          <div className="bg-[#141414] border border-white/10 rounded-xl p-4 md:p-6">
            <h3 className="font-serif text-lg text-sterling mb-5">Alertas de Inventario</h3>
            {inventoryAlerts.length === 0 ? (
              <div className="py-6 text-center text-charcoal text-sm">
                Inventario estable. No hay alertas por el momento.
              </div>
            ) : (
              <ul className="flex flex-col gap-3">
                {inventoryAlerts.map(product => (
                  <li key={product.id} className="flex justify-between items-center bg-red-900/10 border border-red-500/20 p-3 rounded-lg">
                    <div>
                      <h4 className="text-sm text-sterling">{product.name}</h4>
                      <p className="text-xs text-red-400">Stock actual: {product.currentStock}</p>
                    </div>
                    <span className="text-xs text-charcoal bg-white/5 px-2 py-1 rounded">Mín: {product.minimumStock}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Actividad Reciente POS */}
          <div className="bg-[#141414] border border-white/10 rounded-xl p-4 md:p-6">
            <h3 className="font-serif text-lg text-sterling mb-5">Últimas Ventas (POS)</h3>
            {recentSales.length === 0 ? (
              <div className="py-6 text-center text-charcoal text-sm">
                Aún no hay ventas registradas.
              </div>
            ) : (
              <ul className="flex flex-col gap-3">
                {recentSales.map(sale => (
                  <li key={sale.id} className="flex justify-between items-center border-b border-white/5 pb-3 last:border-0">
                    <div>
                      <h4 className="text-sm text-sterling">{sale.clientName || 'Cliente General'}</h4>
                      <p className="text-xs text-charcoal">{sale.paymentMethod}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-sterling">${sale.totalAmount}</p>
                      <p className="text-xs text-charcoal">
                        {sale.createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
