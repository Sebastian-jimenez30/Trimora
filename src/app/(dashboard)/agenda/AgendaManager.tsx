"use client"

import { useState, useTransition } from "react";
import { createAppointment, updateAppointment, updateAppointmentStatus, deleteAppointment } from "@/modules/agenda/actions";
import { createCustomer } from "@/modules/clients/actions";
import { formatInTimeZone, toDate } from "date-fns-tz";
import { 
  addDays, 
  subDays, 
  addWeeks, 
  subWeeks, 
  addMonths, 
  subMonths, 
  startOfWeek, 
  endOfWeek, 
  startOfMonth, 
  endOfMonth, 
  isSameDay, 
  isSameMonth,
  eachDayOfInterval
} from "date-fns";

const TIMEZONE = 'America/Bogota';

type Appointment = {
  id: string;
  clientId: string;
  staffId: string;
  serviceId: string;
  startTime: string;
  endTime: string;
  status: string;
  notes: string | null;
};

type Client = { id: string; firstName: string; lastName: string | null; phone: string | null };
type Service = { id: string; name: string; durationMinutes: number; price: string };
type Staff = { id: string; name: string; role: string };

function getBogotaToday() {
  const now = new Date();
  const bogotaDateStr = formatInTimeZone(now, TIMEZONE, 'yyyy-MM-dd');
  return toDate(`${bogotaDateStr}T00:00:00.000`, { timeZone: TIMEZONE });
}

export default function AgendaManager({ 
  initialAppointments, 
  clients, 
  services, 
  staff 
}: { 
  initialAppointments: Appointment[];
  clients: Client[];
  services: Service[];
  staff: Staff[];
}) {
  const [currentDate, setCurrentDate] = useState(getBogotaToday()); 
  const [view, setView] = useState<'day' | 'week' | 'month'>('day');
  const [searchTerm, setSearchTerm] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isClientModalOpen, setIsClientModalOpen] = useState(false);
  const [editingAppointment, setEditingAppointment] = useState<Appointment | null>(null);
  
  // Default values for creating new appointments by clicking grid
  const [defaultTime, setDefaultTime] = useState("09:00");
  const [selectedDateForNew, setSelectedDateForNew] = useState<Date | null>(null);
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  
  const [isPending, startTransition] = useTransition();

  const changeDate = (amount: number) => {
    if (view === 'day') {
      setCurrentDate(prev => amount > 0 ? addDays(prev, 1) : subDays(prev, 1));
    } else if (view === 'week') {
      setCurrentDate(prev => amount > 0 ? addWeeks(prev, 1) : subWeeks(prev, 1));
    } else {
      setCurrentDate(prev => amount > 0 ? addMonths(prev, 1) : subMonths(prev, 1));
    }
  };

  const setToday = () => {
    setCurrentDate(getBogotaToday());
  };

  const getAppointmentsForDate = (date: Date) => {
    return initialAppointments.filter(app => {
      const d = toDate(app.startTime, { timeZone: TIMEZONE });
      return isSameDay(d, date);
    });
  };

  const openCreateModal = (timeStr?: string, date?: Date) => {
    setEditingAppointment(null);
    setDefaultTime(timeStr || "09:00");
    setSelectedDateForNew(date || currentDate);
    setSelectedClientId("");
    setIsModalOpen(true);
  };

  const openEditModal = (app: Appointment) => {
    setEditingAppointment(app);
    setSelectedClientId(app.clientId);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingAppointment(null);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    
    const timeStr = formData.get("timeStr") as string;
    const serviceId = formData.get("serviceId") as string;
    
    const service = services.find(s => s.id === serviceId);
    const durationMinutes = service ? service.durationMinutes : 30;

    const [hours, minutes] = timeStr.split(":").map(Number);
    
    const baseDate = editingAppointment ? toDate(editingAppointment.startTime, { timeZone: TIMEZONE }) : (selectedDateForNew || currentDate);
    const start = new Date(baseDate);
    start.setHours(hours, minutes, 0, 0);

    const end = new Date(start);
    end.setMinutes(end.getMinutes() + durationMinutes);

    formData.append("startTime", start.toISOString());
    formData.append("endTime", end.toISOString());

    startTransition(async () => {
      let result;
      if (editingAppointment) {
        result = await updateAppointment(editingAppointment.id, formData);
      } else {
        result = await createAppointment(formData);
      }

      if (result.success) {
        closeModal();
      } else {
        alert(result.error);
      }
    });
  };

  const handleDelete = (id: string) => {
    if (!confirm("¿Estás seguro de cancelar/eliminar esta cita?")) return;
    startTransition(async () => {
      const result = await deleteAppointment(id);
      if (!result.success) alert(result.error);
      else closeModal();
    });
  };

  const handleCreateClientSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await createCustomer(formData);
      if (result.success && result.clientId) {
        setSelectedClientId(result.clientId);
        setIsClientModalOpen(false);
      } else {
        alert(result.error);
      }
    });
  };

  // 09:00 = 0px, 1 hora = 60px.
  const getAppointmentStyle = (app: Appointment) => {
    const start = toDate(app.startTime, { timeZone: TIMEZONE });
    const end = toDate(app.endTime, { timeZone: TIMEZONE });
    
    const startMins = (start.getHours() * 60) + start.getMinutes();
    const endMins = (end.getHours() * 60) + end.getMinutes();
    
    const offset = startMins;
    const height = endMins - startMins;

    let bgClass = "bg-[#2a1f18] border-l-[4px] border-[#8B4513]"; 
    if (app.status === "CONFIRMED") bgClass = "bg-[#2C2C2C] border-l-[4px] border-white";
    if (app.status === "COMPLETED") bgClass = "bg-[#1a1a1a] border-l-[4px] border-[#888] opacity-70";

    return {
      top: `${offset}px`,
      height: `${height}px`,
      className: `absolute w-[95%] left-[2.5%] rounded-md px-2 py-1 cursor-pointer shadow-lg transition-transform hover:scale-[1.02] z-10 overflow-hidden ${bgClass}`
    };
  };

  const hours = Array.from({ length: 24 }, (_, i) => i);
  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  // Render Día
  const renderDayView = () => {
    const dayApps = getAppointmentsForDate(currentDate);
    return (
      <div className="flex-1 overflow-y-auto relative bg-[#0f0f0f] p-6">
        <div className="flex-1 bg-[#141414] border border-white/10 rounded-2xl flex flex-col overflow-hidden max-w-4xl mx-auto w-full">
          <div className="h-[60px] border-b border-white/10 flex items-center px-4 bg-white/5 shrink-0">
            <div className="w-[50px] md:w-[80px] shrink-0 font-serif text-sm text-sterling">Hora</div>
            <div className="flex-1 text-center font-serif text-lg text-sterling border-l border-white/10 pl-4">
              Agenda del Día
            </div>
          </div>
          <div className="grid grid-cols-[50px_1fr] md:grid-cols-[80px_1fr] flex-1 overflow-y-auto relative">
            <div className="w-[50px] md:w-[80px] border-r border-white/10 shrink-0 sticky left-0 bg-[#141414] z-10">
              {hours.map(h => (
                <div key={h} className="h-[60px] flex items-start justify-center text-xs text-[#888] pt-2 relative">
                  <span className="relative -top-4 bg-pitch px-1">{h.toString().padStart(2, '0')}:00</span>
                </div>
              ))}
            </div>
            <div className="relative" style={{ backgroundImage: 'linear-gradient(to bottom, rgba(255,255,255,0.05) 1px, transparent 1px)', backgroundSize: '100% 60px' }}>
              {hours.map((h, i) => (
                <div key={`slot-${h}`} onClick={() => openCreateModal(`${h.toString().padStart(2, '0')}:00`, currentDate)} className="absolute w-full h-[60px] cursor-pointer hover:bg-white/[0.02] transition-colors" style={{ top: `${i * 60}px` }} />
              ))}
              {dayApps.filter(app => {
                const client = clients.find(c => c.id === app.clientId);
                return searchTerm && client ? client.firstName.toLowerCase().includes(searchTerm.toLowerCase()) : true;
              }).map(app => {
                const style = getAppointmentStyle(app);
                const client = clients.find(c => c.id === app.clientId);
                const service = services.find(s => s.id === app.serviceId);
                const start = toDate(app.startTime, { timeZone: TIMEZONE });
                return (
                  <div key={app.id} className={style.className} style={{ top: style.top, height: style.height }} onClick={(e) => { e.stopPropagation(); openEditModal(app); }}>
                    <div className="font-bold text-white text-[11px] truncate">{client?.firstName} {client?.lastName}</div>
                    <div className="text-[10px] text-[#ccc] truncate">{service?.name} ({start.getHours()}:{start.getMinutes().toString().padStart(2, '0')})</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Render Semana
  const renderWeekView = () => {
    return (
      <div className="flex-1 overflow-y-auto relative bg-[#0f0f0f] p-4">
        <div className="flex-1 bg-[#141414] border border-white/10 rounded-2xl flex flex-col overflow-hidden w-full min-w-[800px]">
          <div className="grid grid-cols-[60px_1fr_1fr_1fr_1fr_1fr_1fr_1fr] border-b border-white/10 shrink-0 bg-white/5">
            <div className="border-r border-white/10 flex items-center justify-center text-xs text-[#888]">Hora</div>
            {weekDays.map(d => (
              <div key={d.toString()} className={`py-3 text-center border-r border-white/10 last:border-0 ${isSameDay(d, getBogotaToday()) ? 'bg-cognac/20' : ''}`}>
                <div className="text-xs text-[#888] uppercase">{d.toLocaleDateString("es-ES", { weekday: 'short' })}</div>
                <div className={`text-lg font-bold ${isSameDay(d, getBogotaToday()) ? 'text-cognac' : 'text-sterling'}`}>{d.getDate()}</div>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-[60px_1fr_1fr_1fr_1fr_1fr_1fr_1fr] flex-1 overflow-y-auto relative h-[800px]">
            <div className="border-r border-white/10 shrink-0 sticky left-0 bg-[#141414] z-20">
              {hours.map(h => (
                <div key={h} className="h-[60px] flex items-start justify-center text-[10px] text-[#888] pt-2 relative">
                  <span className="relative -top-3 bg-[#141414] px-1">{h.toString().padStart(2, '0')}:00</span>
                </div>
              ))}
            </div>
            {weekDays.map(d => {
              const apps = getAppointmentsForDate(d);
              return (
                <div key={`col-${d.toString()}`} className={`relative border-r border-white/10 last:border-0 ${isSameDay(d, getBogotaToday()) ? 'bg-cognac/5' : ''}`} style={{ backgroundImage: 'linear-gradient(to bottom, rgba(255,255,255,0.05) 1px, transparent 1px)', backgroundSize: '100% 60px' }}>
                  {hours.map((h, i) => (
                    <div key={`slot-${h}`} onClick={() => openCreateModal(`${h.toString().padStart(2, '0')}:00`, d)} className="absolute w-full h-[60px] cursor-pointer hover:bg-white/[0.05] transition-colors" style={{ top: `${i * 60}px` }} />
                  ))}
                  {apps.map(app => {
                    const style = getAppointmentStyle(app);
                    const client = clients.find(c => c.id === app.clientId);
                    return (
                      <div key={app.id} className={`${style.className} !px-1.5`} style={{ top: style.top, height: style.height }} onClick={(e) => { e.stopPropagation(); openEditModal(app); }}>
                        <div className="font-bold text-white text-[9px] truncate">{client?.firstName}</div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  // Render Mes
  const renderMonthView = () => {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    const startDate = startOfWeek(monthStart, { weekStartsOn: 1 });
    const endDate = endOfWeek(monthEnd, { weekStartsOn: 1 });
    const days = eachDayOfInterval({ start: startDate, end: endDate });

    const weekDayNames = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

    return (
      <div className="flex-1 relative bg-[#0f0f0f] p-6 flex flex-col">
        <div className="bg-[#141414] border border-white/10 rounded-2xl flex flex-col flex-1 overflow-hidden">
          <div className="grid grid-cols-7 border-b border-white/10 shrink-0 bg-white/5">
            {weekDayNames.map(d => (
              <div key={d} className="py-3 text-center text-xs font-bold text-sterling border-r border-white/10 last:border-0 uppercase tracking-wider">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 grid-rows-5 flex-1 bg-white/[0.02]">
            {days.map(d => {
              const isCurrentMonth = isSameMonth(d, currentDate);
              const isToday = isSameDay(d, getBogotaToday());
              const apps = getAppointmentsForDate(d);
              
              return (
                <div 
                  key={d.toString()} 
                  className={`border-r border-b border-white/10 last:border-r-0 p-2 flex flex-col cursor-pointer transition-colors hover:bg-white/5 ${isCurrentMonth ? '' : 'opacity-40 bg-black/20'} ${isToday ? 'bg-cognac/10' : ''}`}
                  onClick={() => {
                    setCurrentDate(d);
                    setView('day');
                  }}
                >
                  <div className={`text-right text-sm mb-1 ${isToday ? 'text-cognac font-bold' : 'text-sterling'}`}>
                    {isToday ? <span className="bg-cognac text-white w-6 h-6 inline-flex items-center justify-center rounded-full">{d.getDate()}</span> : d.getDate()}
                  </div>
                  <div className="flex-1 overflow-y-auto space-y-1">
                    {apps.slice(0, 4).map(app => {
                      const client = clients.find(c => c.id === app.clientId);
                      const start = toDate(app.startTime, { timeZone: TIMEZONE });
                      return (
                        <div key={app.id} className="text-[9px] bg-[#2a1f18] text-[#dcdcdc] rounded px-1.5 py-0.5 truncate border-l-2 border-[#8B4513]">
                          {start.getHours()}:{start.getMinutes().toString().padStart(2, '0')} - {client?.firstName}
                        </div>
                      )
                    })}
                    {apps.length > 4 && (
                      <div className="text-[9px] text-[#888] pl-1 font-bold">+{apps.length - 4} más...</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full bg-[#0f0f0f]">
      {/* Topbar */}
      <header className="h-[70px] border-b border-white/10 flex items-center justify-between px-8 bg-pitch shrink-0">
        <div className="flex items-center gap-4">
          <button onClick={setToday} className="border border-white/10 text-sterling px-4 py-1.5 rounded-md text-sm hover:bg-white/5 transition-colors">
            Hoy
          </button>
          <div className="flex items-center">
            <button onClick={() => changeDate(-1)} className="border border-white/10 text-sterling w-8 h-8 rounded-l-md flex items-center justify-center hover:bg-white/5 transition-colors">&lt;</button>
            <button onClick={() => changeDate(1)} className="border-y border-r border-white/10 text-sterling w-8 h-8 rounded-r-md flex items-center justify-center hover:bg-white/5 transition-colors">&gt;</button>
          </div>
          <h2 className="text-lg font-semibold text-sterling min-w-[220px] text-center capitalize">
            {view === 'month' 
              ? currentDate.toLocaleDateString("es-ES", { month: 'long', year: 'numeric' })
              : view === 'week'
              ? `${weekStart.getDate()} ${weekStart.toLocaleDateString("es-ES", { month: 'short' })} - ${addDays(weekStart, 6).getDate()} ${addDays(weekStart, 6).toLocaleDateString("es-ES", { month: 'short', year: 'numeric' })}`
              : currentDate.toLocaleDateString("es-ES", { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
            }
          </h2>
        </div>

        <div className="flex items-center gap-4">
          {/* View Toggle */}
          <div className="flex bg-[#141414] rounded-lg p-1 border border-white/10">
            <button onClick={() => setView('day')} className={`px-3 py-1 text-xs rounded-md font-medium transition-colors ${view === 'day' ? 'bg-cognac text-white' : 'text-charcoal hover:text-white'}`}>Día</button>
            <button onClick={() => setView('week')} className={`px-3 py-1 text-xs rounded-md font-medium transition-colors ${view === 'week' ? 'bg-cognac text-white' : 'text-charcoal hover:text-white'}`}>Semana</button>
            <button onClick={() => setView('month')} className={`px-3 py-1 text-xs rounded-md font-medium transition-colors ${view === 'month' ? 'bg-cognac text-white' : 'text-charcoal hover:text-white'}`}>Mes</button>
          </div>

          {view === 'day' && (
            <div className="relative">
              <input 
                type="text" 
                placeholder="Buscar cita..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="bg-[#141414] border border-white/10 text-sterling pl-4 pr-4 py-1.5 rounded-full text-xs w-[200px] focus:outline-none focus:border-[#888]"
              />
            </div>
          )}

          <button 
            onClick={() => openCreateModal()}
            className="bg-[#8B4513] hover:brightness-110 text-white px-5 py-2 rounded-lg text-sm font-medium transition-all shadow-[0_0_10px_rgba(139,69,19,0.3)]"
          >
            + Nueva Cita
          </button>
        </div>
      </header>

      {/* Main Agenda Area */}
      {view === 'day' && renderDayView()}
      {view === 'week' && renderWeekView()}
      {view === 'month' && renderMonthView()}

      {/* Modal CRUD */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm animate-in fade-in duration-200 p-4">
          <div className="bg-[#141414] border border-white/10 w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl shadow-2xl p-5 md:p-7 animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-6 pb-4 border-b border-white/10">
              <h3 className="text-xl font-serif text-sterling">
                {editingAppointment ? "Detalles de la Cita" : "Nueva Cita"}
              </h3>
              <button type="button" onClick={closeModal} className="text-charcoal hover:text-white transition-colors bg-white/5 w-8 h-8 rounded-full flex items-center justify-center">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-5">
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5 col-span-2">
                  <div className="flex justify-between items-end">
                    <label className="text-xs text-charcoal uppercase tracking-wider">Cliente *</label>
                    <button 
                      type="button" 
                      onClick={() => setIsClientModalOpen(true)}
                      className="text-xs text-cognac hover:text-white transition-colors flex items-center gap-1"
                    >
                      + Nuevo Cliente
                    </button>
                  </div>
                  <select 
                    name="clientId" 
                    required 
                    value={selectedClientId} 
                    onChange={(e) => setSelectedClientId(e.target.value)}
                    className="bg-pitch border border-white/10 text-sterling px-3 py-2.5 rounded-lg text-sm focus:outline-none focus:border-[#8B4513]"
                  >
                    <option value="" disabled>Seleccionar cliente...</option>
                    {clients.map(c => (
                      <option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-charcoal uppercase tracking-wider">Servicio *</label>
                  <select name="serviceId" required defaultValue={editingAppointment?.serviceId || ""} className="bg-pitch border border-white/10 text-sterling px-3 py-2.5 rounded-lg text-sm focus:outline-none focus:border-[#8B4513]">
                    <option value="" disabled>Seleccionar servicio...</option>
                    {services.map(s => (
                      <option key={s.id} value={s.id}>{s.name} (${s.price})</option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-charcoal uppercase tracking-wider">Barbero *</label>
                  <select name="staffId" required defaultValue={editingAppointment?.staffId || ""} className="bg-pitch border border-white/10 text-sterling px-3 py-2.5 rounded-lg text-sm focus:outline-none focus:border-[#8B4513]">
                    <option value="" disabled>Asignar barbero...</option>
                    {staff.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-charcoal uppercase tracking-wider">Hora de Inicio</label>
                  <input 
                    type="time" 
                    name="timeStr" 
                    list="time-options"
                    required 
                    defaultValue={editingAppointment ? new Date(editingAppointment.startTime).toTimeString().substring(0,5) : defaultTime} 
                    className="bg-pitch border border-white/10 text-sterling px-3 py-2.5 rounded-lg text-sm focus:outline-none focus:border-[#8B4513]" 
                  />
                  <datalist id="time-options">
                    {hours.map(h => (
                      <option key={h} value={`${h.toString().padStart(2, '0')}:00`} />
                    ))}
                    {hours.map(h => (
                      <option key={`half-${h}`} value={`${h.toString().padStart(2, '0')}:30`} />
                    ))}
                  </datalist>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-charcoal uppercase tracking-wider">Estado de la Cita</label>
                  <select name="status" required defaultValue={editingAppointment?.status || "PENDING"} className="bg-pitch border border-white/10 text-sterling px-3 py-2.5 rounded-lg text-sm focus:outline-none focus:border-[#8B4513]">
                    <option value="PENDING">Pendiente</option>
                    <option value="CONFIRMED">Confirmada</option>
                    <option value="COMPLETED">Completada</option>
                    <option value="CANCELLED">Cancelada</option>
                  </select>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-charcoal uppercase tracking-wider">Notas / Requerimientos</label>
                <textarea name="notes" rows={2} defaultValue={editingAppointment?.notes || ""} placeholder="Ej. El cliente prefiere corte a tijera..." className="bg-pitch border border-white/10 text-sterling px-3 py-2.5 rounded-lg text-sm focus:outline-none focus:border-[#8B4513] resize-none"></textarea>
              </div>

              <div className="flex justify-between mt-2 border-t border-white/10 pt-5">
                <div>
                  {editingAppointment && (
                    <button 
                      type="button" 
                      onClick={() => handleDelete(editingAppointment.id)} 
                      disabled={isPending}
                      className="text-red-400 hover:text-red-300 px-4 py-2 text-sm font-medium transition-colors"
                    >
                      Eliminar Cita
                    </button>
                  )}
                </div>
                <div className="flex gap-3">
                  <button type="button" onClick={closeModal} className="px-5 py-2.5 text-sm text-sterling hover:bg-white/5 rounded-lg transition-colors font-medium">
                    Cancelar
                  </button>
                  <button type="submit" disabled={isPending} className="bg-[#8B4513] hover:brightness-110 text-white px-6 py-2.5 rounded-lg text-sm font-medium transition-all disabled:opacity-50 flex items-center gap-2">
                    {isPending ? "Guardando..." : "Guardar Cita"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Crear Cliente */}
      {isClientModalOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-[#141414] border border-white/10 w-full max-w-md max-h-[90vh] overflow-y-auto rounded-xl shadow-2xl p-5 md:p-7 animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-6 pb-4 border-b border-white/10">
              <h3 className="text-lg font-serif text-sterling">Crear Nuevo Cliente</h3>
              <button type="button" onClick={() => setIsClientModalOpen(false)} className="text-charcoal hover:text-white transition-colors bg-white/5 w-8 h-8 rounded-full flex items-center justify-center">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            </div>

            <form onSubmit={handleCreateClientSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-charcoal uppercase tracking-wider">Nombre *</label>
                <input type="text" name="firstName" required className="bg-pitch border border-white/10 text-sterling px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-[#8B4513]" />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-charcoal uppercase tracking-wider">Apellido</label>
                <input type="text" name="lastName" className="bg-pitch border border-white/10 text-sterling px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-[#8B4513]" />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-charcoal uppercase tracking-wider">Teléfono</label>
                <input type="tel" name="phone" className="bg-pitch border border-white/10 text-sterling px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-[#8B4513]" />
              </div>
              <div className="flex justify-end gap-3 mt-4">
                <button type="button" onClick={() => setIsClientModalOpen(false)} className="px-4 py-2 text-sm text-sterling hover:bg-white/5 rounded-lg transition-colors">Cancelar</button>
                <button type="submit" disabled={isPending} className="bg-[#8B4513] hover:brightness-110 text-white px-5 py-2 rounded-lg text-sm font-medium transition-all disabled:opacity-50">
                  {isPending ? "Guardando..." : "Guardar Cliente"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
