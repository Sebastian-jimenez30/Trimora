import { createClient } from "@/core/database/server";
import { logout } from "@/modules/auth/actions";
import { redirect } from "next/navigation";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-[#17111b] text-white font-sans flex">
      {/* Sidebar Placeholder */}
      <aside className="w-64 bg-[#231d28]/80 backdrop-blur-xl border-r border-[#39323e] p-6 flex flex-col">
        <div className="text-2xl font-bold bg-gradient-to-r from-[#ddb8ff] to-[#9333ea] bg-clip-text text-transparent mb-10">
          Trimora
        </div>
        <nav className="flex-1 space-y-4">
          <div className="px-4 py-3 bg-[#9333ea]/10 text-[#ddb8ff] rounded-xl cursor-pointer">Inicio</div>
          <div className="px-4 py-3 text-[#cfc2d7] hover:bg-[#39323e] rounded-xl cursor-pointer transition-colors">Calendario</div>
          <div className="px-4 py-3 text-[#cfc2d7] hover:bg-[#39323e] rounded-xl cursor-pointer transition-colors">Clientes</div>
          <div className="px-4 py-3 text-[#cfc2d7] hover:bg-[#39323e] rounded-xl cursor-pointer transition-colors">Caja</div>
        </nav>
        
        <div className="pt-6 border-t border-[#39323e]">
          <form action={logout}>
            <button type="submit" className="w-full px-4 py-3 bg-[#93000a]/20 text-[#ffdad6] hover:bg-[#93000a]/40 rounded-xl transition-colors">
              Cerrar Sesión
            </button>
          </form>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-10">
        <header className="flex justify-between items-center mb-10">
          <div>
            <h1 className="text-3xl font-bold text-[#eadfee]">Resumen de Hoy</h1>
            <p className="text-[#cfc2d7] mt-1">Bienvenido de nuevo, {user.email}</p>
          </div>
        </header>

        {/* Stat Cards */}
        <div className="grid grid-cols-3 gap-6 mb-10">
          <div className="bg-[#231d28]/60 backdrop-blur-md p-6 rounded-2xl border border-[#39323e]">
            <h3 className="text-[#cfc2d7] text-sm font-medium mb-2">Ingresos Totales</h3>
            <div className="text-3xl font-bold text-[#eadfee]">$0.00</div>
          </div>
          <div className="bg-[#231d28]/60 backdrop-blur-md p-6 rounded-2xl border border-[#39323e]">
            <h3 className="text-[#cfc2d7] text-sm font-medium mb-2">Citas Hoy</h3>
            <div className="text-3xl font-bold text-[#eadfee]">0</div>
          </div>
          <div className="bg-[#231d28]/60 backdrop-blur-md p-6 rounded-2xl border border-[#39323e]">
            <h3 className="text-[#cfc2d7] text-sm font-medium mb-2">Nuevos Clientes</h3>
            <div className="text-3xl font-bold text-[#eadfee]">0</div>
          </div>
        </div>
      </main>
    </div>
  );
}
