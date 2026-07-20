import { createClient } from "@/core/database/server";
import { db } from "@/core/database/db";
import { 
  organizationMembers, 
  dailySummaries, 
  appointments, 
  clients, 
  services, 
  transactions, 
  products,
  auditLogs,
  transactionItems
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
        gte(appointments.startTime, today),
        lt(appointments.startTime, tomorrow)
      )
    );
  
  const citasAgendadas = todaysAppointmentsQuery[0]?.count || 0;

  // Egresos del día
  const todaysExpenses = await db.select({ totalAmount: transactions.totalAmount })
    .from(transactions)
    .where(
      and(
        eq(transactions.organizationId, orgId),
        eq(transactions.type, 'EXPENSE'),
        gte(transactions.createdAt, today),
        lt(transactions.createdAt, tomorrow)
      )
    );
  
  const egresosDia = todaysExpenses.reduce((acc, curr) => acc + parseFloat(curr.totalAmount), 0).toFixed(2);

  // Lista de deudores (Cuentas por cobrar detalladas)
  const pendingDebts = await db.select({
    id: transactions.id,
    totalAmount: transactions.totalAmount,
    paidAmount: transactions.paidAmount,
    clientName: clients.firstName,
    clientLastName: clients.lastName,
    createdAt: transactions.createdAt
  })
  .from(transactions)
  .leftJoin(clients, eq(transactions.clientId, clients.id))
  .where(
    and(
      eq(transactions.organizationId, orgId),
      eq(transactions.status, 'PENDING')
    )
  )
  .orderBy(desc(transactions.createdAt));

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
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
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
          <div className="w-[50px] h-[50px] rounded-lg bg-red-900/20 text-red-400 flex items-center justify-center shrink-0">
            <svg viewBox="0 0 24 24" className="w-6 h-6 fill-current"><path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.11 0-1.99.9-1.99 2L3 20a2 2 0 0 0 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10zm0-12H5V6h14v2zm-7 5h5v5h-5z"/></svg>
          </div>
          <div>
            <h3 className="text-2xl font-bold mb-1">${egresosDia}</h3>
            <p className="text-xs text-charcoal uppercase tracking-[0.5px]">Egresos del Día</p>
          </div>
        </div>



        <div className="bg-gradient-to-br from-[#141414] to-[#1a1a1a] border border-white/10 rounded-xl p-5 flex items-center gap-[15px] transition-all hover:-translate-y-[3px] hover:shadow-[0_8px_15px_rgba(0,0,0,0.4)] hover:border-cognac/40">
          <div className="w-[50px] h-[50px] rounded-lg bg-cognac/10 text-cognac flex items-center justify-center shrink-0">
            <svg viewBox="0 0 24 24" className="w-6 h-6 fill-current"><path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.11 0-1.99.9-1.99 2L3 20a2 2 0 0 0 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10zm0-12H5V6h14v2zm-7 5h5v5h-5z"/></svg>
          </div>
          <div>
            <h3 className="text-2xl font-bold mb-1">{citasAgendadas}</h3>
            <p className="text-xs text-charcoal uppercase tracking-[0.5px]">Citas de Hoy</p>
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

        {inventoryAlerts.length > 0 && (
          <div className="flex flex-col gap-4 md:gap-6">
            
            {/* Alertas de Inventario */}
            <div className="bg-[#141414] border border-white/10 rounded-xl p-4 md:p-6">
              <h3 className="font-serif text-lg text-sterling mb-5">Alertas de Inventario</h3>
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
            </div>

          </div>
        )}
        
        {/* Cuentas por Cobrar List */}
        <div className="flex flex-col gap-4 md:gap-6">
          <div className="bg-[#141414] border border-white/10 rounded-xl p-4 md:p-6">
            <h3 className="font-serif text-lg text-sterling mb-5 text-orange-400">Cuentas por Cobrar</h3>
            {pendingDebts.length === 0 ? (
              <div className="py-6 text-center text-charcoal text-sm">
                No hay cuentas pendientes por cobrar.
              </div>
            ) : (
              <ul className="flex flex-col gap-3">
                {pendingDebts.map(debt => {
                  const remaining = (parseFloat(debt.totalAmount) - parseFloat(debt.paidAmount || '0')).toFixed(2);
                  return (
                    <li key={debt.id} className="flex justify-between items-center bg-orange-500/10 border border-orange-500/20 p-3 rounded-lg">
                      <div>
                        <h4 className="text-sm font-bold text-sterling">{debt.clientName} {debt.clientLastName || ''}</h4>
                        <p className="text-xs text-orange-400 font-medium mt-0.5">Debe: ${remaining}</p>
                      </div>
                      <Link 
                        href={`/pos?tab=HISTORY&payTx=${debt.id}&payAmount=${remaining}`}
                        className="bg-orange-500/20 hover:bg-orange-500 text-orange-400 hover:text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-colors"
                      >
                        Abonar
                      </Link>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
