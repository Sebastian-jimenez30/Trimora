"use client"

import { useState, useTransition } from "react";
import { createAppointment, updateAppointment, updateAppointmentStatus, deleteAppointment } from "@/modules/agenda/actions";
import { createCustomer } from "@/modules/clients/actions";

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
  const [currentDate, setCurrentDate] = useState(new Date("2026-07-10T12:00:00")); // Fecha base temporal para desarrollo
  const [searchTerm, setSearchTerm] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isClientModalOpen, setIsClientModalOpen] = useState(false);
  const [editingAppointment, setEditingAppointment] = useState<Appointment | null>(null);
  
  // Default values for creating new appointments by clicking grid
  const [defaultTime, setDefaultTime] = useState("09:00");
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  
  const [isPending, startTransition] = useTransition();

  const changeDate = (days: number) => {
    const newDate = new Date(currentDate);
    newDate.setDate(newDate.getDate() + days);
    setCurrentDate(newDate);
  };

  const getDayAppointments = () => {
    return initialAppointments.filter(app => {
      const d = new Date(app.startTime);
      return d.getDate() === currentDate.getDate() && 
             d.getMonth() === currentDate.getMonth() && 
             d.getFullYear() === currentDate.getFullYear();
    });
  };

  const openCreateModal = (time?: string) => {
    setEditingAppointment(null);
    setDefaultTime(time || "09:00");
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
    
    // Convert time to ISO combining with currentDate
    const timeStr = formData.get("timeStr") as string;
    const serviceId = formData.get("serviceId") as string;
    
    const service = services.find(s => s.id === serviceId);
    const durationMinutes = service ? service.durationMinutes : 30;

    const [hours, minutes] = timeStr.split(":").map(Number);
    
    const start = new Date(currentDate);
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

  const handleStatusChange = (id: string, status: string) => {
    startTransition(async () => {
      const result = await updateAppointmentStatus(id, status);
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

  // Helper para posicionar la cita en la grilla. 09:00 = 0px, 1 hora = 60px.
  const getAppointmentStyle = (app: Appointment) => {
    const start = new Date(app.startTime);
    const end = new Date(app.endTime);
    
    const startMins = (start.getHours() * 60) + start.getMinutes();
    const endMins = (end.getHours() * 60) + end.getMinutes();
    
    // Grid starts at 00:00 (0 * 60 = 0)
    const offset = startMins;
    const height = endMins - startMins;

    let bgClass = "bg-[#2a1f18] border-l-[4px] border-[#8B4513]"; // Pending
    if (app.status === "CONFIRMED") bgClass = "bg-[#2C2C2C] border-l-[4px] border-white";
    if (app.status === "COMPLETED") bgClass = "bg-[#1a1a1a] border-l-[4px] border-[#888] opacity-70";

    // Si la cita empieza antes de las 9am o después de las 8pm se ajustará o no se verá bien, 
    // asumimos por el scope que es 09 a 20.
    return {
      top: `${offset}px`,
      height: `${height}px`,
      className: `absolute left-[5%] w-[90%] rounded-md px-3 py-2 cursor-pointer shadow-lg transition-transform hover:scale-[1.01] z-10 ${bgClass}`
    };
  };

  const dayAppointments = getDayAppointments();
  
  // Hours array from 00:00 to 23:00
  const hours = Array.from({ length: 24 }, (_, i) => i);

  return (
    <div className="flex flex-col h-full bg-[#0f0f0f]">
      {/* Topbar */}
      <header className="h-[70px] border-b border-white/10 flex items-center justify-between px-8 bg-pitch shrink-0">
        <div className="flex items-center gap-4">
          <button onClick={() => setCurrentDate(new Date())} className="border border-white/10 text-sterling px-4 py-1.5 rounded-md text-sm hover:bg-white/5 transition-colors">
            Hoy
          </button>
          <button onClick={() => changeDate(-1)} className="border border-white/10 text-sterling w-8 h-8 rounded-md flex items-center justify-center hover:bg-white/5 transition-colors">
            &lt;
          </button>
          <h2 className="text-lg font-semibold text-sterling min-w-[220px] text-center">
            {currentDate.toLocaleDateString("es-ES", { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </h2>
          <button onClick={() => changeDate(1)} className="border border-white/10 text-sterling w-8 h-8 rounded-md flex items-center justify-center hover:bg-white/5 transition-colors">
            &gt;
          </button>
        </div>

        <div className="flex items-center gap-5">
          <div className="relative">
            <input 
              type="text" 
              placeholder="Buscar cita..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-[#141414] border border-white/10 text-sterling pl-4 pr-4 py-2 rounded-full text-sm w-[250px] focus:outline-none focus:border-[#888]"
            />
          </div>
          <button 
            onClick={() => openCreateModal()}
            className="bg-[#8B4513] hover:brightness-110 text-white px-5 py-2 rounded-lg text-sm font-medium transition-all"
          >
            + Nueva Cita
          </button>
        </div>
      </header>

      {/* Main Agenda Area */}
      <div className="flex-1 overflow-y-auto relative bg-[#0f0f0f] p-6">
        
        <div className="bg-pitch border border-white/10 rounded-xl overflow-hidden min-h-[720px] relative">
          
          {/* Header Row */}
          <div className="grid grid-cols-[80px_1fr] bg-pitch border-b border-white/10 sticky top-0 z-20">
            <div className="p-4 border-r border-white/10 text-center text-xs font-semibold text-charcoal">Hora</div>
            <div className="p-4 text-center text-sm font-semibold text-sterling">Agenda General</div>
          </div>

          {/* Time Grid Content */}
          <div className="grid grid-cols-[80px_1fr] relative">
            
            {/* Time Labels Column */}
            <div className="flex flex-col border-r border-white/10">
              {hours.map(h => (
                <div key={h} className="h-[60px] flex items-start justify-center text-xs text-[#888] pt-2 relative">
                  <span className="relative -top-4 bg-pitch px-1">{h.toString().padStart(2, '0')}:00</span>
                </div>
              ))}
            </div>

            {/* General Agenda Column */}
            <div className="relative" style={{ backgroundImage: 'linear-gradient(to bottom, rgba(255,255,255,0.05) 1px, transparent 1px)', backgroundSize: '100% 60px' }}>
              
              {/* Clicks en espacios vacíos para crear cita en esa hora */}
              {hours.map((h, i) => (
                <div 
                  key={`slot-${h}`} 
                  onClick={() => openCreateModal(`${h.toString().padStart(2, '0')}:00`)}
                  className="absolute w-full h-[60px] cursor-pointer hover:bg-white/[0.02] transition-colors"
                  style={{ top: `${i * 60}px` }}
                />
              ))}

              {/* Render Appointments */}
              {dayAppointments.filter(app => {
                const client = clients.find(c => c.id === app.clientId);
                if (searchTerm && client) {
                  return client.firstName.toLowerCase().includes(searchTerm.toLowerCase());
                }
                return true;
              }).map(app => {
                const style = getAppointmentStyle(app);
                const client = clients.find(c => c.id === app.clientId);
                const service = services.find(s => s.id === app.serviceId);
                const staffMember = staff.find(s => s.id === app.staffId);
                
                const start = new Date(app.startTime);
                const end = new Date(app.endTime);
                const timeLabel = `${start.getHours().toString().padStart(2, '0')}:${start.getMinutes().toString().padStart(2, '0')} - ${end.getHours().toString().padStart(2, '0')}:${end.getMinutes().toString().padStart(2, '0')}`;

                return (
                  <div 
                    key={app.id}
                    className={style.className}
                    style={{ top: style.top, height: style.height }}
                    onClick={(e) => {
                      e.stopPropagation();
                      openEditModal(app);
                    }}
                  >
                    <div className="flex justify-between items-start">
                      <div className="font-bold text-white text-sm truncate">{client?.firstName} {client?.lastName}</div>
                      <div className="text-[10px] bg-black/40 px-1.5 rounded truncate max-w-[80px]">{staffMember?.name}</div>
                    </div>
                    <div className="text-xs text-[#ccc] truncate mt-0.5">{service?.name}</div>
                    <div className="text-[10px] text-[#888] mt-1">{timeLabel}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Modal CRUD */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-[#141414] border border-white/10 w-full max-w-lg rounded-xl shadow-2xl p-7 animate-in zoom-in-95 duration-200">
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
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-[#141414] border border-white/10 w-full max-w-md rounded-xl shadow-2xl p-7 animate-in zoom-in-95 duration-200">
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
