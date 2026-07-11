import { createClient } from "@/core/database/server";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="p-[30px] flex flex-col gap-6">
      
      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        <div className="bg-gradient-to-br from-[#141414] to-[#1a1a1a] border border-white/10 rounded-xl p-5 flex items-center gap-[15px] transition-all hover:-translate-y-[3px] hover:shadow-[0_8px_15px_rgba(0,0,0,0.4)] hover:border-cognac/40">
          <div className="w-[50px] h-[50px] rounded-lg bg-cognac/10 text-cognac flex items-center justify-center shrink-0">
            <svg viewBox="0 0 24 24" className="w-6 h-6 fill-current"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>
          </div>
          <div>
            <h3 className="text-2xl font-bold mb-1">$0</h3>
            <p className="text-xs text-charcoal uppercase tracking-[0.5px]">Ingresos del Día</p>
            <div className="text-[11px] text-charcoal flex items-center gap-1 mt-[5px]">Sin datos aún</div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-[#141414] to-[#1a1a1a] border border-white/10 rounded-xl p-5 flex items-center gap-[15px] transition-all hover:-translate-y-[3px] hover:shadow-[0_8px_15px_rgba(0,0,0,0.4)] hover:border-cognac/40">
          <div className="w-[50px] h-[50px] rounded-lg bg-cognac/10 text-cognac flex items-center justify-center shrink-0">
            <svg viewBox="0 0 24 24" className="w-6 h-6 fill-current"><path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.11 0-1.99.9-1.99 2L3 20a2 2 0 0 0 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10zm0-12H5V6h14v2zm-7 5h5v5h-5z"/></svg>
          </div>
          <div>
            <h3 className="text-2xl font-bold mb-1">0</h3>
            <p className="text-xs text-charcoal uppercase tracking-[0.5px]">Citas Agendadas</p>
            <div className="text-[11px] text-charcoal flex items-center gap-1 mt-[5px]">Sin citas hoy</div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-[#141414] to-[#1a1a1a] border border-white/10 rounded-xl p-5 flex items-center gap-[15px] transition-all hover:-translate-y-[3px] hover:shadow-[0_8px_15px_rgba(0,0,0,0.4)] hover:border-cognac/40">
          <div className="w-[50px] h-[50px] rounded-lg bg-cognac/10 text-cognac flex items-center justify-center shrink-0">
            <svg viewBox="0 0 24 24" className="w-6 h-6 fill-current"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>
          </div>
          <div>
            <h3 className="text-2xl font-bold mb-1">0</h3>
            <p className="text-xs text-charcoal uppercase tracking-[0.5px]">Clientes Nuevos</p>
            <div className="text-[11px] text-charcoal flex items-center gap-1 mt-[5px]">Sin datos aún</div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-[#141414] to-[#1a1a1a] border border-white/10 rounded-xl p-5 flex items-center gap-[15px] transition-all hover:-translate-y-[3px] hover:shadow-[0_8px_15px_rgba(0,0,0,0.4)] hover:border-cognac/40">
          <div className="w-[50px] h-[50px] rounded-lg bg-cognac/10 text-cognac flex items-center justify-center shrink-0">
            <svg viewBox="0 0 24 24" className="w-6 h-6 fill-current"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>
          </div>
          <div>
            <h3 className="text-lg font-bold mt-1 text-charcoal">---</h3>
            <p className="text-xs text-charcoal uppercase tracking-[0.5px]">Servicio más popular</p>
            <div className="text-[11px] text-charcoal flex items-center gap-1 mt-[5px]">Sin datos registrados</div>
          </div>
        </div>
      </div>

      {/* Main Dashboard Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        
        {/* Columna Izquierda (Ancha) */}
        <div className="xl:col-span-2 flex flex-col gap-6">
          
          {/* Gráfico */}
          <div className="bg-[#141414] border border-white/10 rounded-xl p-6">
            <div className="flex justify-between items-center mb-5">
              <h3 className="font-serif text-lg text-sterling">Resumen de Ingresos (Semana)</h3>
              <Link href="#" className="text-cognac text-[13px] font-medium hover:underline">Ver reporte completo</Link>
            </div>
            <div className="h-[250px] flex items-end justify-between pt-5 border-b border-white/10 relative">
              <div className="flex flex-col items-center gap-2.5 w-[10%]"><div className="w-full h-[5%] bg-white/5 rounded-t-sm"></div><span className="text-xs text-charcoal">Lun</span></div>
              <div className="flex flex-col items-center gap-2.5 w-[10%]"><div className="w-full h-[5%] bg-white/5 rounded-t-sm"></div><span className="text-xs text-charcoal">Mar</span></div>
              <div className="flex flex-col items-center gap-2.5 w-[10%]"><div className="w-full h-[5%] bg-white/5 rounded-t-sm"></div><span className="text-xs text-charcoal">Mié</span></div>
              <div className="flex flex-col items-center gap-2.5 w-[10%]"><div className="w-full h-[5%] bg-white/5 rounded-t-sm"></div><span className="text-xs text-charcoal">Jue</span></div>
              <div className="flex flex-col items-center gap-2.5 w-[10%]"><div className="w-full h-[5%] bg-white/5 rounded-t-sm"></div><span className="text-xs text-charcoal">Vie</span></div>
              <div className="flex flex-col items-center gap-2.5 w-[10%]"><div className="w-full h-[5%] bg-white/5 rounded-t-sm"></div><span className="text-xs text-charcoal">Sáb</span></div>
              <div className="flex flex-col items-center gap-2.5 w-[10%]"><div className="w-full h-[5%] bg-white/5 rounded-t-sm"></div><span className="text-xs text-charcoal">Dom</span></div>
              
              {/* Mensaje de no datos */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <span className="text-charcoal text-sm bg-[#141414] px-4 py-2 rounded-full border border-white/5">Aún no hay datos de ingresos</span>
              </div>
            </div>
          </div>

          {/* Próximas Citas */}
          <div className="bg-[#141414] border border-white/10 rounded-xl p-6 overflow-x-auto">
            <div className="flex justify-between items-center mb-5 min-w-[500px]">
              <h3 className="font-serif text-lg text-sterling">Próximas Citas Hoy</h3>
              <Link href="#" className="text-cognac text-[13px] font-medium hover:underline">Ir a la Agenda</Link>
            </div>
            <table className="w-full border-collapse min-w-[500px]">
              <thead>
                <tr>
                  <th className="text-left py-3 px-2.5 text-xs text-charcoal font-medium border-b border-white/10">Hora</th>
                  <th className="text-left py-3 px-2.5 text-xs text-charcoal font-medium border-b border-white/10">Cliente</th>
                  <th className="text-left py-3 px-2.5 text-xs text-charcoal font-medium border-b border-white/10">Servicio</th>
                  <th className="text-left py-3 px-2.5 text-xs text-charcoal font-medium border-b border-white/10">Barbero</th>
                  <th className="text-left py-3 px-2.5 text-xs text-charcoal font-medium border-b border-white/10">Estado</th>
                </tr>
              </thead>
            </table>
            <div className="py-10 text-center text-charcoal text-sm">
              No hay citas programadas para hoy.
            </div>
          </div>

        </div>

        {/* Columna Derecha (Estrecha) */}
        <div className="flex flex-col gap-6">
          
          {/* Alertas de Inventario */}
          <div className="bg-[#141414] border border-white/10 rounded-xl p-6">
            <h3 className="font-serif text-lg text-sterling mb-5">Alertas de Inventario</h3>
            <div className="py-6 text-center text-charcoal text-sm">
              Inventario estable. No hay alertas por el momento.
            </div>
          </div>

          {/* Actividad Reciente POS */}
          <div className="bg-[#141414] border border-white/10 rounded-xl p-6">
            <h3 className="font-serif text-lg text-sterling mb-5">Últimas Ventas (POS)</h3>
            <div className="py-6 text-center text-charcoal text-sm">
              Aún no hay ventas registradas.
            </div>
            <button className="w-full mt-4 bg-transparent border border-white/10 text-sterling px-3 py-2 rounded text-xs hover:border-sterling hover:bg-white/5 transition-all">
              Ir al Punto de Venta
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}
