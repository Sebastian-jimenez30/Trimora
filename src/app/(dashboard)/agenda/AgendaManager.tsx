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

  // Swipe Handlers
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);

  const minSwipeDistance = 50;

  const onTouchStart = (e: React.TouchEvent) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const onTouchEnd = () => {
    if (!touchStart || !touchEnd) return;
    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > minSwipeDistance;
    const isRightSwipe = distance < -minSwipeDistance;
    if (isLeftSwipe) changeDate(1);
    if (isRightSwipe) changeDate(-1);
  };

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
    
    const startMins = ((start.getHours() - 5) * 60) + start.getMinutes();
    const endMins = ((end.getHours() - 5) * 60) + end.getMinutes();
    
    // Si la cita termina antes de las 5am o empieza después de las 10pm, la altura puede ser extraña,
    // pero Math.max lo mantendrá en su lugar visualmente.
    const offset = Math.max(0, startMins);
    const height = Math.max(10, endMins - offset);

    let bgClass = "bg-[#2a1f18] border-l-[4px] border-[#8B4513]"; 
    if (app.status === "CONFIRMED") bgClass = "bg-[#2C2C2C] border-l-[4px] border-white";
    if (app.status === "COMPLETED") bgClass = "bg-[#1a1a1a] border-l-[4px] border-[#888] opacity-70";

    return {
      top: `${offset}px`,
      height: `${height}px`,
      minHeight: '30px', // Prevent text cutoff on very short appointments
      className: `absolute w-[95%] left-[2.5%] rounded-md px-2 py-1 cursor-pointer shadow-lg transition-transform hover:scale-[1.02] hover:z-20 z-10 overflow-hidden flex flex-col justify-center ${bgClass}`
    };
  };

  const hours = Array.from({ length: 18 }, (_, i) => i + 5); // 5 AM to 10 PM
  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  // Render Día
  const renderDayView = () => {
    const dayApps = getAppointmentsForDate(currentDate);
    const now = new Date();
    const isToday = isSameDay(currentDate, getBogotaToday());
    
    return (
      <div className="flex-1 flex flex-col bg-[#141414] overflow-hidden relative">
        {/* Time Grid */}
        <div className="flex-1 overflow-y-auto relative pt-3">
          <div className="grid grid-cols-[60px_1fr]">
            {/* Hours Column */}
            <div className="border-r border-white/10 shrink-0 sticky left-0 bg-[#141414] z-20">
              {hours.map(h => (
                <div key={h} className="h-[60px] flex justify-end pr-2 pt-0 relative">
                  <span className="text-[10px] text-[#888] relative -top-[8px] pr-1">
                    {h === 0 ? '12 a.m.' : h < 12 ? `${h} a.m.` : h === 12 ? '12 p.m.' : `${h-12} p.m.`}
                  </span>
                </div>
              ))}
            </div>

            {/* Grid & Appointments */}
            <div className="relative" style={{ backgroundImage: 'linear-gradient(to bottom, rgba(255,255,255,0.06) 1px, transparent 1px)', backgroundSize: '100% 60px' }}>
              {hours.map((h, i) => (
                <div key={`slot-${h}`} onClick={() => openCreateModal(`${h.toString().padStart(2, '0')}:00`, currentDate)} className="absolute w-full h-[60px] cursor-pointer hover:bg-white/[0.03] transition-colors" style={{ top: `${i * 60}px` }} />
              ))}
              
              {/* Current Time Marker */}
              {isToday && now.getHours() >= 5 && now.getHours() <= 22 && (
                <div className="absolute w-full border-t-[2px] border-cognac z-30 pointer-events-none" style={{ top: `${((now.getHours() - 5) * 60) + now.getMinutes()}px` }}>
                  <div className="w-2.5 h-2.5 rounded-full bg-cognac absolute -left-[5px] -top-[5px]"></div>
                </div>
              )}

              {/* Appointments */}
              {dayApps.filter(app => {
                const client = clients.find(c => c.id === app.clientId);
                return searchTerm && client ? client.firstName.toLowerCase().includes(searchTerm.toLowerCase()) : true;
              }).map(app => {
                const style = getAppointmentStyle(app);
                const client = clients.find(c => c.id === app.clientId);
                const service = services.find(s => s.id === app.serviceId);
                const start = toDate(app.startTime, { timeZone: TIMEZONE });
                return (
                  <div key={app.id} className={style.className} style={{ top: style.top, height: style.height, minHeight: style.minHeight }} onClick={(e) => { e.stopPropagation(); openEditModal(app); }}>
                    <div className="font-bold text-white text-[12px] truncate leading-tight">{client?.firstName} {client?.lastName}</div>
                    <div className="text-[10px] text-[#ccc] truncate mt-0.5">{service?.name} • {start.getHours()}:{start.getMinutes().toString().padStart(2, '0')}</div>
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
    const now = new Date();
    return (
      <div className="flex-1 flex flex-col bg-[#141414] overflow-hidden relative">
        <div className="flex items-center border-b border-white/10 pb-2 pt-2 bg-[#1a1a1a] shrink-0 z-20 shadow-sm overflow-x-auto">
          <div className="w-[60px] shrink-0 sticky left-0 bg-[#1a1a1a] border-r border-white/10 z-30"></div>
          <div className="flex-1 grid grid-cols-7 min-w-[500px]">
            {weekDays.map(d => {
              const isToday = isSameDay(d, getBogotaToday());
              return (
                <div key={d.toString()} className="flex flex-col items-center border-r border-white/10 last:border-0 cursor-pointer hover:bg-white/5" onClick={() => { setCurrentDate(d); setView('day'); }}>
                  <span className={`text-[10px] uppercase font-medium tracking-wide ${isToday ? 'text-cognac' : 'text-[#888]'}`}>
                    {d.toLocaleDateString("es-ES", { weekday: 'short' })}
                  </span>
                  <div className={`w-8 h-8 flex items-center justify-center rounded-full mt-1 text-sm ${isToday ? 'bg-cognac text-white font-bold' : 'text-sterling'}`}>
                    {d.getDate()}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto overflow-x-auto relative pt-3">
          <div className="grid grid-cols-[60px_1fr] min-w-[560px]">
            {/* Hours Column */}
            <div className="border-r border-white/10 shrink-0 sticky left-0 bg-[#141414] z-20">
              {hours.map(h => (
                <div key={h} className="h-[60px] flex justify-end pr-2 pt-0 relative">
                  <span className="text-[10px] text-[#888] relative -top-[8px] pr-1">
                    {h === 0 ? '12 a.m.' : h < 12 ? `${h} a.m.` : h === 12 ? '12 p.m.' : `${h-12} p.m.`}
                  </span>
                </div>
              ))}
            </div>
            
            {/* Week Grid */}
            <div className="grid grid-cols-7 relative" style={{ backgroundImage: 'linear-gradient(to bottom, rgba(255,255,255,0.06) 1px, transparent 1px)', backgroundSize: '100% 60px' }}>
              {weekDays.map((d, index) => {
                const apps = getAppointmentsForDate(d);
                const isToday = isSameDay(d, getBogotaToday());
                return (
                  <div key={`col-${d.toString()}`} className="relative border-r border-white/10 last:border-0">
                    {hours.map((h, i) => (
                      <div key={`slot-${h}`} onClick={() => openCreateModal(`${h.toString().padStart(2, '0')}:00`, d)} className="absolute w-full h-[60px] cursor-pointer hover:bg-white/[0.03] transition-colors" style={{ top: `${i * 60}px` }} />
                    ))}
                    
                    {isToday && now.getHours() >= 5 && now.getHours() <= 22 && (
                      <div className="absolute w-full border-t-[2px] border-cognac z-30 pointer-events-none" style={{ top: `${((now.getHours() - 5) * 60) + now.getMinutes()}px` }}>
                        <div className="w-2 h-2 rounded-full bg-cognac absolute -left-[4px] -top-[4px]"></div>
                      </div>
                    )}
                    
                    {apps.map(app => {
                      const style = getAppointmentStyle(app);
                      const client = clients.find(c => c.id === app.clientId);
                      return (
                        <div key={app.id} className={`${style.className} !left-0 !w-full !rounded-sm !border-l-[3px]`} style={{ top: style.top, height: style.height, minHeight: style.minHeight }} onClick={(e) => { e.stopPropagation(); openEditModal(app); }}>
                          <div className="font-bold text-white text-[10px] truncate leading-tight">{client?.firstName}</div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
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
      <div className="flex-1 flex flex-col bg-[#141414]">
        <div className="grid grid-cols-7 border-b border-white/10 shrink-0 bg-[#1a1a1a]">
          {weekDayNames.map(d => (
            <div key={d} className="py-2 text-center text-[10px] font-medium text-[#888] uppercase tracking-wider">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 grid-rows-5 flex-1 bg-[#141414]">
          {days.map(d => {
            const isCurrentMonth = isSameMonth(d, currentDate);
            const isToday = isSameDay(d, getBogotaToday());
            const apps = getAppointmentsForDate(d);
            
            return (
              <div 
                key={d.toString()} 
                className={`border-r border-b border-white/10 last:border-r-0 p-1 md:p-2 flex flex-col cursor-pointer transition-colors hover:bg-white/5 ${isCurrentMonth ? '' : 'bg-black/20'}`}
                onClick={() => {
                  setCurrentDate(d);
                  setView('day');
                }}
              >
                <div className={`text-center text-xs mb-1 mx-auto flex items-center justify-center w-6 h-6 rounded-full ${isToday ? 'bg-cognac text-white font-bold' : isCurrentMonth ? 'text-sterling' : 'text-charcoal'}`}>
                  {d.getDate()}
                </div>
                <div className="flex-1 overflow-y-auto space-y-1 mt-1 px-1">
                  {apps.slice(0, 3).map(app => {
                    const client = clients.find(c => c.id === app.clientId);
                    const start = toDate(app.startTime, { timeZone: TIMEZONE });
                    return (
                      <div key={app.id} className="text-[9px] bg-cognac text-white rounded-[4px] px-1.5 py-0.5 truncate shadow-sm">
                        {start.getHours()}:{start.getMinutes().toString().padStart(2, '0')} {client?.firstName}
                      </div>
                    )
                  })}
                  {apps.length > 3 && (
                    <div className="text-[10px] text-[#888] text-center font-medium">+{apps.length - 3}</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div 
      className="flex flex-col h-full bg-[#141414] relative"
      onTouchStart={onTouchStart} 
      onTouchMove={onTouchMove} 
      onTouchEnd={onTouchEnd}
    >
      {/* Topbar Inspired by Google Calendar */}
      <header className="h-[64px] border-b border-white/10 flex items-center justify-between px-4 lg:px-6 bg-[#1a1a1a] shrink-0 shadow-sm z-30">
        <div className="flex items-center gap-2 md:gap-6">
          <div className="flex items-center gap-1 group relative">
            <h2 className="text-xl md:text-2xl font-serif text-white capitalize flex items-baseline gap-2">
              {view === 'day' && (
                <div className="flex items-baseline gap-1.5 mr-1 md:mr-2">
                  <span className="text-2xl md:text-3xl text-cognac font-bold">{currentDate.getDate()}</span>
                  <span className="text-sm md:text-base text-[#888] uppercase tracking-wider font-sans font-medium">{currentDate.toLocaleDateString("es-ES", { weekday: 'short' })}</span>
                </div>
              )}
              <span className="md:hidden">{currentDate.toLocaleDateString("es-ES", { month: 'short' })}</span>
              <span className="hidden md:inline">{currentDate.toLocaleDateString("es-ES", { month: 'long' })}</span>
              <span className="text-sm font-sans text-[#888] font-normal hidden md:inline">{currentDate.getFullYear()}</span>
            </h2>
          </div>
        </div>

        <div className="flex items-center gap-3 md:gap-5">
          <button onClick={setToday} className="hidden md:flex border border-white/10 text-sterling px-4 py-1.5 rounded-full text-sm hover:bg-white/5 transition-colors font-medium">
            Hoy
          </button>
          <button onClick={setToday} className="md:hidden text-sterling p-2 hover:bg-white/5 rounded-full">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line><circle cx="12" cy="15" r="1"></circle></svg>
          </button>
          
          <div className="hidden md:flex items-center bg-white/5 rounded-full p-0.5">
            <button onClick={() => changeDate(-1)} className="text-sterling w-8 h-8 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors">&lt;</button>
            <button onClick={() => changeDate(1)} className="text-sterling w-8 h-8 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors">&gt;</button>
          </div>

          <div className="flex bg-[#0f0f0f] rounded-lg p-1 border border-white/5 shadow-inner">
            <button onClick={() => setView('day')} className={`px-2 md:px-3 py-1.5 text-xs rounded-md font-medium transition-all ${view === 'day' ? 'bg-white/10 text-white shadow-sm' : 'text-[#888] hover:text-white'}`}>Día</button>
            <button onClick={() => setView('week')} className={`px-2 md:px-3 py-1.5 text-xs rounded-md font-medium transition-all ${view === 'week' ? 'bg-white/10 text-white shadow-sm' : 'text-[#888] hover:text-white'}`}>Semana</button>
            <button onClick={() => setView('month')} className={`px-2 md:px-3 py-1.5 text-xs rounded-md font-medium transition-all ${view === 'month' ? 'bg-white/10 text-white shadow-sm' : 'text-[#888] hover:text-white'}`}>Mes</button>
          </div>
        </div>
      </header>

      {/* Main Agenda Area */}
      {view === 'day' && renderDayView()}
      {view === 'week' && renderWeekView()}
      {view === 'month' && renderMonthView()}

      {/* Floating Action Button (FAB) */}
      <button 
        onClick={() => openCreateModal()}
        className="fixed md:absolute bottom-6 right-6 w-14 h-14 bg-cognac text-white rounded-2xl flex items-center justify-center shadow-[0_4px_20px_rgba(139,69,19,0.5)] hover:shadow-[0_8px_25px_rgba(139,69,19,0.6)] hover:-translate-y-1 transition-all z-50"
      >
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
      </button>

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
