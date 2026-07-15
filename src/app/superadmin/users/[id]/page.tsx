import { getGlobalUser, updateGlobalUser } from "@/modules/superadmin/actions";
import Link from "next/link";
import { redirect } from "next/navigation";

export default async function EditGlobalUserPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const userId = params.id;
  const user = await getGlobalUser(userId);

  if (!user) {
    redirect('/superadmin/users');
  }

  async function handleUpdate(formData: FormData) {
    'use server';
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;
    const action = formData.get('action') as string;

    const updates: any = {};
    if (email) updates.email = email;
    if (password) updates.password = password;

    if (action === 'ban') {
      updates.ban_duration = '87600h'; // Ban por 10 años
    } else if (action === 'unban') {
      updates.ban_duration = 'none';
    }

    await updateGlobalUser(userId, updates);
  }

  const isBanned = !!user.banned_until;

  return (
    <div className="space-y-8">
      <div className="flex items-center space-x-4">
        <Link href="/superadmin/users" className="text-gray-400 hover:text-white transition">
          ← Volver
        </Link>
        <h2 className="text-3xl font-bold text-white">Editar Usuario</h2>
      </div>

      <div className="bg-gray-900 border border-gray-800 p-6 rounded-xl">
        <h3 className="text-xl font-semibold mb-6 text-gray-200">Información de Cuenta</h3>
        
        {isBanned && (
          <div className="bg-red-900/50 border border-red-500/50 p-4 rounded-lg mb-6 text-red-200">
            <strong className="block">Este usuario está suspendido (baneado).</strong>
            No podrá iniciar sesión hasta que levantes la suspensión.
          </div>
        )}

        <form action={handleUpdate} className="space-y-6 max-w-lg">
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">Correo Electrónico</label>
            <input 
              type="email" 
              name="email"
              defaultValue={user.email}
              className="w-full bg-gray-800 border border-gray-700 text-white px-4 py-2 rounded-lg focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">
              Nueva Contraseña <span className="text-xs">(Opcional, dejar en blanco para no cambiar)</span>
            </label>
            <input 
              type="password" 
              name="password"
              placeholder="Escribe una nueva contraseña para forzar el cambio"
              className="w-full bg-gray-800 border border-gray-700 text-white px-4 py-2 rounded-lg focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="flex gap-4 pt-4 border-t border-gray-800">
            <button type="submit" name="action" value="save" className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium transition">
              Guardar Cambios
            </button>
            
            {isBanned ? (
              <button type="submit" name="action" value="unban" className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg font-medium transition">
                Quitar Suspensión
              </button>
            ) : (
              <button type="submit" name="action" value="ban" className="bg-yellow-600 hover:bg-yellow-700 text-white px-6 py-2 rounded-lg font-medium transition">
                Suspender Cuenta
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
