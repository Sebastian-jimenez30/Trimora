import { getAllGlobalUsers, deleteGlobalUser } from "@/modules/superadmin/actions";
import Link from "next/link";

export default async function GlobalUsersPage() {
  const users = await getAllGlobalUsers();

  async function handleDeleteUser(formData: FormData) {
    'use server';
    const userId = formData.get('userId') as string;
    if (userId) {
      await deleteGlobalUser(userId);
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <h2 className="text-3xl font-bold text-white">Usuarios Globales (SaaS)</h2>
      </div>

      <div className="bg-gray-900 border border-gray-800 p-6 rounded-xl text-yellow-500/80 mb-6">
        <strong className="text-yellow-500 block mb-2">⚠ ZONA DE PELIGRO</strong>
        <p className="text-sm">
          Borrar a un usuario desde este panel elimina su cuenta completamente de Supabase Auth y rompe sus referencias de inicio de sesión. 
          Use esta opción únicamente si el usuario solicitó eliminar su cuenta permanentemente o si es una cuenta de prueba/spam.
        </p>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <table className="w-full text-left text-sm text-gray-400">
          <thead className="bg-gray-800/50 text-gray-300 uppercase">
            <tr>
              <th className="px-6 py-4 font-medium">Email</th>
              <th className="px-6 py-4 font-medium">Último Inicio de Sesión</th>
              <th className="px-6 py-4 font-medium">Registrado El</th>
              <th className="px-6 py-4 font-medium text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {users.map(user => (
              <tr key={user.id} className="hover:bg-gray-800/30 transition">
                <td className="px-6 py-4 font-medium text-white">{user.email}</td>
                <td className="px-6 py-4">{user.last_sign_in_at ? new Date(user.last_sign_in_at).toLocaleString() : 'Nunca'}</td>
                <td className="px-6 py-4">{new Date(user.created_at).toLocaleDateString()}</td>
                <td className="px-6 py-4 text-right flex justify-end gap-4">
                  <Link href={`/superadmin/users/${user.id}`} className="text-blue-500 hover:text-blue-400 font-medium">
                    Gestionar
                  </Link>
                  
                  <form action={handleDeleteUser}>
                    <input type="hidden" name="userId" value={user.id} />
                    <button type="submit" className="text-red-500 hover:text-red-400 font-medium">
                      Borrar
                    </button>
                  </form>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={4} className="px-6 py-8 text-center text-gray-500">
                  No hay usuarios registrados en el sistema.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
