import { createClient } from "@/core/database/server";
import { logout } from "@/modules/auth/actions";
import Link from "next/link";
import { redirect } from "next/navigation";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Obtenemos el nombre de usuario del email (todo antes del @)
  const username = user.email?.split("@")[0] || "Administrador";
  const capitalizedUsername = username.charAt(0).toUpperCase() + username.slice(1);

  return (
    <div className="flex h-screen bg-pitch text-sterling font-sans overflow-hidden">
      
      {/* Sidebar */}
      <aside className="w-[260px] bg-gradient-to-b from-pitch to-[#111] border-r border-white/10 flex flex-col py-6 shrink-0">
        <div className="px-6 pb-[30px] flex items-center gap-3 border-b border-white/10 mb-5">
          <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-[30px] h-[30px]">
            <path d="M40 60 L10 30 L20 20 L50 50" stroke="white" strokeWidth="6" strokeLinecap="round"/>
            <path d="M60 60 L90 30 L80 20 L50 50" stroke="white" strokeWidth="6" strokeLinecap="round"/>
            <circle cx="35" cy="75" r="8" stroke="white" strokeWidth="6"/>
            <circle cx="65" cy="75" r="8" stroke="white" strokeWidth="6"/>
          </svg>
          <span className="font-serif text-[22px] font-bold tracking-[1.5px]">TRIMORA</span>
        </div>
        
        <ul className="list-none px-3 flex-1 flex flex-col gap-2">
          <li>
            <Link href="/dashboard" className="flex items-center gap-3 px-4 py-3 text-sterling bg-midnight border-l-4 border-cognac rounded-lg text-sm font-medium transition-all">
              Dashboard
            </Link>
          </li>
          <li>
            <Link href="#" className="flex items-center gap-3 px-4 py-3 text-charcoal hover:text-sterling hover:bg-white/5 rounded-lg text-sm font-medium transition-all">
              Agenda y Citas
            </Link>
          </li>
          <li>
            <Link href="/clientes" className="flex items-center gap-3 px-4 py-3 text-charcoal hover:text-sterling hover:bg-white/5 rounded-lg text-sm font-medium transition-all">
              Clientes
            </Link>
          </li>
          <li>
            <Link href="#" className="flex items-center gap-3 px-4 py-3 text-charcoal hover:text-sterling hover:bg-white/5 rounded-lg text-sm font-medium transition-all">
              Punto de Venta (POS)
            </Link>
          </li>
          <li>
            <Link href="#" className="flex items-center gap-3 px-4 py-3 text-charcoal hover:text-sterling hover:bg-white/5 rounded-lg text-sm font-medium transition-all">
              Inventario
            </Link>
          </li>
          <li>
            <Link href="#" className="flex items-center gap-3 px-4 py-3 text-charcoal hover:text-sterling hover:bg-white/5 rounded-lg text-sm font-medium transition-all">
              Reportes financieros
            </Link>
          </li>
          <li>
            <Link href="#" className="flex items-center gap-3 px-4 py-3 text-charcoal hover:text-sterling hover:bg-white/5 rounded-lg text-sm font-medium transition-all">
              Configuración
            </Link>
          </li>
        </ul>

        {/* Logout Button */}
        <div className="px-3 mt-auto">
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
      <div className="flex-1 flex flex-col bg-[#0f0f0f] overflow-y-auto">
        
        {/* Topbar */}
        <header className="h-[70px] border-b border-white/10 flex items-center justify-between px-[30px] bg-pitch sticky top-0 z-10 shrink-0">
          <div className="flex flex-col">
            <h2 className="text-lg font-semibold text-sterling">Hola, {capitalizedUsername}</h2>
            <p className="text-xs text-charcoal mt-1">Aquí tienes el resumen de tu negocio para hoy.</p>
          </div>
          
          <div className="flex items-center gap-5">
            <button className="relative bg-transparent border border-white/10 text-sterling w-[36px] h-[36px] rounded-full flex items-center justify-center cursor-pointer hover:bg-midnight transition-colors">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
              </svg>
              {/* Notificaciones en 0 por defecto */}
            </button>
            
            <div className="w-[36px] h-[36px] rounded-full overflow-hidden border border-cognac shrink-0 bg-midnight flex items-center justify-center text-xs font-bold text-sterling">
              {username.charAt(0).toUpperCase()}
            </div>
          </div>
        </header>

        {/* Dynamic Content */}
        {children}

      </div>
    </div>
  );
}
