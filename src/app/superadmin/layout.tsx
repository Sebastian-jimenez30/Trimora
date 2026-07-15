import { createClient } from "@/core/database/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { logoutIdle } from "@/modules/auth/actions";
import SessionTimeout from "@/components/layout/SessionTimeout";

export default async function SuperAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user || user.email !== 'trimoraerp@gmail.com') {
    redirect("/login");
  }

  return (
    <div className="flex h-screen bg-gray-950 text-white font-sans">
      <SessionTimeout />
      
      {/* Sidebar */}
      <aside className="w-64 bg-black border-r border-gray-800 flex flex-col">
        <div className="p-6 border-b border-gray-800">
          <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-indigo-500">
            Trimora SaaS
          </h1>
          <p className="text-xs text-gray-500 mt-1">Super Admin Panel</p>
        </div>
        
        <nav className="flex-1 p-4 space-y-2">
          <Link href="/superadmin" className="block px-4 py-2 rounded-lg hover:bg-gray-800 transition">
            Dashboard
          </Link>
          <Link href="/superadmin/organizations" className="block px-4 py-2 rounded-lg hover:bg-gray-800 transition">
            Organizaciones
          </Link>
          <Link href="/superadmin/users" className="block px-4 py-2 rounded-lg hover:bg-gray-800 transition">
            Usuarios Globales
          </Link>
        </nav>

        <div className="p-4 border-t border-gray-800">
          <form action={logoutIdle}>
            <button type="submit" className="w-full px-4 py-2 bg-red-900/50 hover:bg-red-900 text-red-200 rounded-lg transition">
              Cerrar Sesión
            </button>
          </form>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        <div className="p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
