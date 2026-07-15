"use client"

import { useState, useTransition } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "@/modules/auth/actions";
import { updateAppointmentStatus } from "@/modules/agenda/actions";

type Props = {
  username: string;
  avatarUrl?: string;
  pendingAppointments?: any[];
  isAdmin?: boolean;
  children: React.ReactNode;
};

export default function DashboardNavigation({ username, avatarUrl, pendingAppointments, isAdmin = false, children }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [isPendingsOpen, setIsPendingsOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const pathname = usePathname();

  const handleCancelAppointment = (id: string) => {
    startTransition(async () => {
      await updateAppointmentStatus(id, "CANCELLED");
    });
  };

  const navLinks = [
    { href: "/dashboard", label: "Dashboard" },
    { href: "/agenda", label: "Agenda y Citas" },
    { href: "/clientes", label: "Clientes" },
    { href: "/pos", label: "Punto de Venta (POS)" },
    { href: "/inventario", label: "Inventario" },
  ];

  if (isAdmin) {
    navLinks.push({ href: "/equipo", label: "Equipo" });
    navLinks.push({ href: "/servicios", label: "Servicios" });
  }

  const closeMenu = () => setIsOpen(false);

  return (
    <div className="flex h-screen bg-pitch text-sterling font-sans overflow-hidden w-full relative">
      
      {/* Mobile Backdrop */}
      {isOpen && (
        <div 
          className="md:hidden fixed inset-0 bg-black/60 z-40 backdrop-blur-sm transition-opacity" 
          onClick={closeMenu}
        />
      )}
      
      {/* Sidebar */}
      <aside className={`fixed md:relative z-50 w-[260px] h-full bg-gradient-to-b from-pitch to-[#111] border-r border-white/10 flex flex-col py-6 shrink-0 transition-transform duration-300 ease-in-out ${isOpen ? "translate-x-0" : "-translate-x-full"} md:translate-x-0`}>
        <div className="px-6 pb-[30px] flex items-center gap-3 border-b border-white/10 mb-5 justify-between md:justify-start">
          <div className="flex items-center gap-3">
            <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-[30px] h-[30px]">
              <path d="M40 60 L10 30 L20 20 L50 50" stroke="white" strokeWidth="6" strokeLinecap="round"/>
              <path d="M60 60 L90 30 L80 20 L50 50" stroke="white" strokeWidth="6" strokeLinecap="round"/>
              <circle cx="35" cy="75" r="8" stroke="white" strokeWidth="6"/>
              <circle cx="65" cy="75" r="8" stroke="white" strokeWidth="6"/>
            </svg>
            <span className="font-serif text-[22px] font-bold tracking-[1.5px]">TRIMORA</span>
          </div>
          <button className="md:hidden text-white/50 hover:text-white" onClick={closeMenu}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>
        
        <ul className="list-none px-3 flex-1 flex flex-col gap-2 overflow-y-auto">
          {navLinks.map(link => {
            const isActive = pathname === link.href || pathname.startsWith(link.href + "/");
            return (
              <li key={link.href}>
                <Link 
                  href={link.href} 
                  onClick={closeMenu}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all ${
                    isActive 
                      ? "text-sterling bg-midnight border-l-4 border-cognac" 
                      : "text-charcoal hover:text-sterling hover:bg-white/5"
                  }`}
                >
                  {link.label}
                </Link>
              </li>
            );
          })}
        </ul>

        {/* Logout Button */}
        <div className="px-3 mt-auto pt-5">
          <form action={logout}>
            <button type="submit" className="w-full flex items-center justify-center gap-2 px-4 py-3 text-[#d32f2f] hover:text-white hover:bg-[#d32f2f]/20 rounded-lg text-sm font-medium transition-all border border-transparent hover:border-[#d32f2f]/50">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                <polyline points="16 17 21 12 16 7"></polyline>
                <line x1="21" y1="12" x2="9" y2="12"></line>
              </svg>
              Cerrar Sesión
            </button>
          </form>
        </div>
      </aside>

      {/* Main Wrapper */}
      <div className="flex-1 flex flex-col bg-[#0f0f0f] min-w-0">
        
        {/* Topbar */}
        <header className="h-[70px] border-b border-white/10 flex items-center justify-between px-4 md:px-[30px] bg-pitch sticky top-0 z-10 shrink-0">
          <div className="flex items-center gap-4">
            <button className="md:hidden text-sterling hover:text-white p-1" onClick={() => setIsOpen(true)}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
            </button>
            <div className="flex flex-col">
              <h2 className="text-base md:text-lg font-semibold text-sterling truncate max-w-[150px] md:max-w-xs">Hola, {username}</h2>
              <p className="text-[10px] md:text-xs text-charcoal mt-0.5 hidden sm:block">Aquí tienes el resumen de tu negocio para hoy.</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3 md:gap-5">
            {/* Bell Icon for Pending Appointments */}
            <div className="relative">
              <button 
                onClick={() => setIsPendingsOpen(!isPendingsOpen)}
                className="relative p-2 text-[#888] hover:text-sterling transition-colors"
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>
                {pendingAppointments && pendingAppointments.length > 0 && (
                  <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-pitch animate-pulse"></span>
                )}
              </button>

              {/* Pendings Dropdown */}
              {isPendingsOpen && (
                <div className="absolute right-0 mt-2 w-72 bg-[#141414] border border-white/10 rounded-xl shadow-2xl overflow-hidden z-50">
                  <div className="p-4 border-b border-white/10 bg-[#1a1a1a]">
                    <h3 className="font-serif text-sm text-sterling">Pendientes de Cobro</h3>
                  </div>
                  <div className="max-h-60 overflow-y-auto">
                    {(!pendingAppointments || pendingAppointments.length === 0) ? (
                      <div className="p-6 text-center text-xs text-[#888]">No hay cobros pendientes</div>
                    ) : (
                      pendingAppointments.map((app: any) => (
                        <div
                          key={app.id}
                          className="flex flex-col p-4 border-b border-white/5 hover:bg-white/5 transition-colors"
                        >
                          <div className="flex justify-between items-start mb-1">
                            <span className="font-semibold text-sm text-sterling truncate max-w-[140px]">{app.clientName} {app.clientLastName}</span>
                            <div className="flex gap-2">
                              <button 
                                onClick={() => handleCancelAppointment(app.id)}
                                disabled={isPending}
                                className="text-[9px] text-gray-400 font-bold px-1.5 py-0.5 rounded bg-white/5 hover:bg-red-500/20 hover:text-red-400 transition-colors"
                              >
                                {isPending ? "..." : "CANCELAR"}
                              </button>
                              <Link
                                href={`/pos?appointmentId=${app.id}`}
                                onClick={() => setIsPendingsOpen(false)}
                                className="text-[9px] text-green-400 font-bold px-1.5 py-0.5 rounded bg-green-400/10 hover:bg-green-400/20 transition-colors"
                              >
                                COBRAR
                              </Link>
                            </div>
                          </div>
                          <span className="text-xs text-[#888] truncate">{app.serviceName}</span>
                          <span className="text-[10px] text-charcoal mt-1">
                            Finalizó: {new Date(app.endTime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
            <div className="relative">
              <button 
                onClick={() => setIsProfileOpen(!isProfileOpen)}
                className="w-[35px] h-[35px] md:w-[40px] md:h-[40px] rounded-full bg-midnight border border-white/10 flex items-center justify-center text-sterling font-serif font-bold text-sm md:text-base overflow-hidden hover:border-cognac transition-colors"
              >
                {avatarUrl ? (
                  <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                ) : (
                  username.charAt(0).toUpperCase()
                )}
              </button>

              {/* Profile Dropdown */}
              {isProfileOpen && (
                <div className="absolute right-0 mt-2 w-48 bg-[#141414] border border-white/10 rounded-xl shadow-2xl overflow-hidden z-50">
                  <div className="p-4 border-b border-white/10 bg-[#1a1a1a]">
                    <h3 className="font-serif text-sm text-white truncate">{username}</h3>
                    <p className="text-xs text-sterling mt-1">Ajustes</p>
                  </div>
                  <div className="flex flex-col py-2">
                    <Link 
                      href="/perfil" 
                      onClick={() => setIsProfileOpen(false)}
                      className="px-4 py-2 text-sm text-sterling hover:bg-white/5 hover:text-white transition-colors text-left flex items-center gap-2"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                      Mi Perfil
                    </Link>
                    <form action={logout} className="w-full">
                      <button 
                        type="submit" 
                        className="w-full px-4 py-2 text-sm text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-colors text-left flex items-center gap-2"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
                        Cerrar Sesión
                      </button>
                    </form>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden relative">
          {children}
        </main>

      </div>
    </div>
  );
}
