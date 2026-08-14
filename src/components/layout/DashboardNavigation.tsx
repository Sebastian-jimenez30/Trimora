"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "@/modules/auth/actions";
import { updateAppointmentStatus } from "@/modules/agenda/actions";

type Props = {
  username: string;
  avatarUrl?: string;
  pendingAppointments?: PendingAppointmentNotification[];
  isAdmin?: boolean;
  children: React.ReactNode;
};

export type PendingAppointmentNotification = {
  id: string;
  clientName: string | null;
  clientLastName: string | null;
  serviceName: string | null;
  startTime: string | Date;
};

function formatAppointmentTime(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function DashboardNavigation({
  username,
  avatarUrl,
  pendingAppointments,
  isAdmin = false,
  children,
}: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [isPendingsOpen, setIsPendingsOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const pendingDropdownRef = useRef<HTMLDivElement>(null);
  const pendingButtonRef = useRef<HTMLButtonElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    if (!isPendingsOpen) return;

    const closePendingDropdown = (event: MouseEvent) => {
      if (!pendingDropdownRef.current?.contains(event.target as Node)) {
        setIsPendingsOpen(false);
      }
    };

    const closePendingDropdownWithKeyboard = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setIsPendingsOpen(false);
      pendingButtonRef.current?.focus();
    };

    document.addEventListener("mousedown", closePendingDropdown);
    document.addEventListener("keydown", closePendingDropdownWithKeyboard);
    return () => {
      document.removeEventListener("mousedown", closePendingDropdown);
      document.removeEventListener("keydown", closePendingDropdownWithKeyboard);
    };
  }, [isPendingsOpen]);

  const handleCancelAppointment = (id: string) => {
    startTransition(async () => {
      await updateAppointmentStatus(id, "CANCELLED");
    });
  };

  const navLinks = [
    { href: "/dashboard", label: "Inicio" },
    { href: "/agenda", label: "Agenda y Citas" },
    { href: "/pos", label: "Caja" },
    { href: "/analitica", label: "Analítica" },
    { href: "/clientes", label: "Clientes" },
    { href: "/inventario", label: "Inventario" },
  ];

  if (isAdmin) {
    navLinks.splice(3, 0, { href: "/agenda/disponibilidad", label: "Disponibilidad" });
    navLinks.push({ href: "/servicios", label: "Servicios" });
    navLinks.push({ href: "/equipo", label: "Equipo" });
  }

  const isHome = pathname === "/dashboard";
  const titledLinks = [...navLinks, { href: "/perfil", label: "Perfil" }];
  const pageTitle =
    titledLinks.find((link) => pathname === link.href)?.label ??
    titledLinks.find((link) => pathname.startsWith(`${link.href}/`))?.label ??
    "Trimora";

  const closeMenu = () => setIsOpen(false);

  return (
    <div className="flex h-[100dvh] bg-pitch text-sterling font-sans overflow-hidden w-full relative overscroll-none">
      {/* Mobile Backdrop */}
      {isOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/60 z-40 backdrop-blur-sm transition-opacity"
          onClick={closeMenu}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed md:relative z-50 w-[260px] h-full bg-gradient-to-b from-pitch to-[#111] border-r border-white/10 flex flex-col py-6 shrink-0 transition-transform duration-300 ease-in-out ${isOpen ? "translate-x-0" : "-translate-x-full"} md:translate-x-0`}
      >
        <div className="px-6 pb-[30px] flex items-center gap-3 border-b border-white/10 mb-5 justify-between md:justify-start">
          <div className="flex items-center gap-3">
            <Image
              src="/trimora-logo-white.png"
              alt="Trimora Logo"
              width={30}
              height={30}
              className="w-[30px] h-[30px] object-contain"
            />
            <span className="font-serif text-[22px] font-bold tracking-[1.5px]">TRIMORA</span>
          </div>
          <button className="md:hidden text-white/50 hover:text-white" onClick={closeMenu}>
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <ul className="list-none px-3 flex-1 flex flex-col gap-2 overflow-y-auto">
          {navLinks.map((link) => {
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
            <button
              type="submit"
              className="w-full flex items-center justify-center gap-2 px-4 py-3 text-[#d32f2f] hover:text-white hover:bg-[#d32f2f]/20 rounded-lg text-sm font-medium transition-all border border-transparent hover:border-[#d32f2f]/50"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
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
        <header className="h-[70px] border-b border-white/10 flex items-center justify-between px-4 md:px-[30px] bg-pitch sticky top-0 z-40 shrink-0">
          <div className="flex items-center gap-4">
            <button
              className="md:hidden text-sterling hover:text-white p-1"
              onClick={() => setIsOpen(true)}
            >
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <line x1="3" y1="12" x2="21" y2="12"></line>
                <line x1="3" y1="6" x2="21" y2="6"></line>
                <line x1="3" y1="18" x2="21" y2="18"></line>
              </svg>
            </button>
            <div className="flex flex-col">
              <h2 className="text-base md:text-lg font-semibold text-sterling truncate max-w-[150px] md:max-w-xs">
                {isHome ? `Hola, ${username}` : pageTitle}
              </h2>
              {isHome && (
                <p className="text-[10px] md:text-xs text-charcoal mt-0.5 hidden sm:block">
                  Aquí tienes el resumen de tu negocio para hoy.
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 md:gap-5">
            {/* Bell Icon for Pending Appointments */}
            <div className="relative" ref={pendingDropdownRef}>
              <button
                ref={pendingButtonRef}
                onClick={() => setIsPendingsOpen(!isPendingsOpen)}
                aria-label="Notificaciones de cobro"
                aria-expanded={isPendingsOpen}
                aria-controls="pending-appointments-panel"
                className="relative p-2 text-[#888] hover:text-sterling transition-colors"
              >
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                  <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
                </svg>
                {pendingAppointments && pendingAppointments.length > 0 && (
                  <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-pitch animate-pulse"></span>
                )}
              </button>

              {/* Pendings Dropdown */}
              {isPendingsOpen && (
                <div
                  id="pending-appointments-panel"
                  role="region"
                  aria-label="Pendientes de cobro"
                  className="absolute right-0 mt-2 w-72 bg-[#141414] border border-white/10 rounded-xl shadow-2xl overflow-hidden z-50"
                >
                  <div className="p-4 border-b border-white/10 bg-[#1a1a1a]">
                    <h3 className="font-serif text-sm text-sterling">Pendientes de Cobro</h3>
                  </div>
                  <div className="max-h-60 overflow-y-auto">
                    {!pendingAppointments || pendingAppointments.length === 0 ? (
                      <div className="p-6 text-center text-xs text-[#888]">
                        No hay cobros pendientes
                      </div>
                    ) : (
                      pendingAppointments.map((app) => (
                        <div
                          key={app.id}
                          className="flex flex-col p-4 border-b border-white/5 hover:bg-white/5 transition-colors"
                        >
                          <div className="flex justify-between items-start mb-1">
                            <span className="font-semibold text-sm text-sterling truncate max-w-[140px]">
                              {app.clientName || "Cliente"} {app.clientLastName || ""}
                            </span>
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
                          <span className="text-xs text-[#888] truncate">
                            {app.serviceName || "Servicio"}
                          </span>
                          <span className="text-[10px] text-charcoal mt-1">
                            Inició a las: {formatAppointmentTime(app.startTime)}
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
                aria-label="Abrir menú de perfil"
                className="w-[35px] h-[35px] md:w-[40px] md:h-[40px] rounded-full bg-midnight border border-white/10 flex items-center justify-center text-sterling font-serif font-bold text-sm md:text-base overflow-hidden hover:border-cognac transition-colors"
              >
                {avatarUrl ? (
                  <Image
                    unoptimized
                    src={avatarUrl}
                    alt="Avatar"
                    width={40}
                    height={40}
                    className="w-full h-full object-cover"
                  />
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
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                        <circle cx="12" cy="7" r="4"></circle>
                      </svg>
                      Mi Perfil
                    </Link>
                    <form action={logout} className="w-full">
                      <button
                        type="submit"
                        className="w-full px-4 py-2 text-sm text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-colors text-left flex items-center gap-2"
                      >
                        <svg
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                          <polyline points="16 17 21 12 16 7"></polyline>
                          <line x1="21" y1="12" x2="9" y2="12"></line>
                        </svg>
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
        <main className="flex-1 overflow-y-auto overflow-x-hidden relative">{children}</main>
      </div>
    </div>
  );
}
