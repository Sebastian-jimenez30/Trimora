import { getAllOrganizations, createOrganization } from "@/modules/superadmin/actions";
import Link from "next/link";
import { revalidatePath } from "next/cache";

export default async function OrganizationsPage() {
  const orgs = await getAllOrganizations();

  async function handleCreateOrg(formData: FormData) {
    'use server';
    const name = formData.get('name') as string;
    if (name) {
      await createOrganization(name);
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <h2 className="text-3xl font-bold text-white">Organizaciones (Barberías)</h2>
      </div>

      <div className="bg-gray-900 border border-gray-800 p-6 rounded-xl">
        <h3 className="text-xl font-semibold mb-4 text-gray-200">Crear Nueva Organización</h3>
        <form action={handleCreateOrg} className="flex gap-4">
          <input 
            type="text" 
            name="name"
            placeholder="Nombre de la barbería" 
            className="flex-1 bg-gray-800 border border-gray-700 text-white px-4 py-2 rounded-lg focus:outline-none focus:border-blue-500"
            required
          />
          <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium transition">
            Crear
          </button>
        </form>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <table className="w-full text-left text-sm text-gray-400">
          <thead className="bg-gray-800/50 text-gray-300 uppercase">
            <tr>
              <th className="px-6 py-4 font-medium">Nombre</th>
              <th className="px-6 py-4 font-medium">Miembros</th>
              <th className="px-6 py-4 font-medium">Fecha de Creación</th>
              <th className="px-6 py-4 font-medium text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {orgs.map(org => (
              <tr key={org.id} className="hover:bg-gray-800/30 transition">
                <td className="px-6 py-4 font-medium text-white">{org.name}</td>
                <td className="px-6 py-4">{org.membersCount} miembros</td>
                <td className="px-6 py-4">{new Date(org.createdAt).toLocaleDateString()}</td>
                <td className="px-6 py-4 text-right">
                  <Link href={`/superadmin/organizations/${org.id}`} className="text-blue-400 hover:text-blue-300 font-medium">
                    Gestionar
                  </Link>
                </td>
              </tr>
            ))}
            {orgs.length === 0 && (
              <tr>
                <td colSpan={4} className="px-6 py-8 text-center text-gray-500">
                  No hay organizaciones registradas.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
