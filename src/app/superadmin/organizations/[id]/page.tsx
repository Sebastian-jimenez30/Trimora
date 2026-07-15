import { getOrganizationMembers, addMemberToOrganization, updateMemberRole, removeMember, sendInvitation, getPendingInvitations, cancelInvitation } from "@/modules/superadmin/actions";
import Link from "next/link";
import { revalidatePath } from "next/cache";

export default async function OrganizationDetailsPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const organizationId = params.id;
  const members = await getOrganizationMembers(organizationId);
  const pendingInvitations = await getPendingInvitations(organizationId);

  async function handleSendInvite(formData: FormData) {
    'use server';
    const email = formData.get('email') as string;
    const role = formData.get('role') as string;
    if (email && role) {
      await sendInvitation(organizationId, email, role);
    }
  }

  async function handleCancelInvite(formData: FormData) {
    'use server';
    const invitationId = formData.get('invitationId') as string;
    await cancelInvitation(invitationId, organizationId);
  }

  async function handleUpdateRole(formData: FormData) {
    'use server';
    const memberId = formData.get('memberId') as string;
    const role = formData.get('role') as string;
    await updateMemberRole(memberId, role);
    revalidatePath(`/superadmin/organizations/${organizationId}`);
  }

  async function handleRemoveMember(formData: FormData) {
    'use server';
    const memberId = formData.get('memberId') as string;
    await removeMember(memberId);
    revalidatePath(`/superadmin/organizations/${organizationId}`);
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center space-x-4">
        <Link href="/superadmin/organizations" className="text-gray-400 hover:text-white transition">
          ← Volver
        </Link>
        <h2 className="text-3xl font-bold text-white">Gestión de Barbería</h2>
      </div>

      <div className="bg-gray-900 border border-gray-800 p-6 rounded-xl">
        <h3 className="text-xl font-semibold mb-4 text-gray-200">Invitar Nuevo Miembro por Correo</h3>
        <p className="text-sm text-gray-500 mb-4">Se enviará un correo con un enlace único. Al hacer clic, el usuario podrá crear su contraseña (o iniciar sesión si ya tiene cuenta) y se unirá automáticamente a esta barbería con el rol especificado.</p>
        <form action={handleSendInvite} className="flex gap-4">
          <input 
            type="email" 
            name="email"
            placeholder="Correo del usuario a invitar" 
            className="flex-1 bg-gray-800 border border-gray-700 text-white px-4 py-2 rounded-lg focus:outline-none focus:border-blue-500"
            required
          />
          <select 
            name="role" 
            className="bg-gray-800 border border-gray-700 text-white px-4 py-2 rounded-lg focus:outline-none focus:border-blue-500"
            required
          >
            <option value="ADMIN">ADMIN</option>
            <option value="BARBER">BARBER</option>
            <option value="RECEPTIONIST">RECEPTIONIST</option>
          </select>
          <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium transition">
            Enviar Invitación
          </button>
        </form>
      </div>

      {pendingInvitations.length > 0 && (
        <div className="bg-gray-900 border border-blue-900/50 rounded-xl overflow-hidden">
          <div className="p-6 border-b border-gray-800 bg-blue-950/20">
            <h3 className="text-xl font-semibold text-blue-400">Invitaciones Pendientes</h3>
          </div>
          <table className="w-full text-left text-sm text-gray-400">
            <thead className="bg-gray-800/50 text-gray-300 uppercase">
              <tr>
                <th className="px-6 py-4 font-medium">Email Invitado</th>
                <th className="px-6 py-4 font-medium">Rol Prometido</th>
                <th className="px-6 py-4 font-medium">Enviado El</th>
                <th className="px-6 py-4 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {pendingInvitations.map(inv => (
                <tr key={inv.id} className="hover:bg-gray-800/30 transition">
                  <td className="px-6 py-4 font-medium text-white">{inv.email}</td>
                  <td className="px-6 py-4">{inv.role}</td>
                  <td className="px-6 py-4">{new Date(inv.createdAt).toLocaleDateString()}</td>
                  <td className="px-6 py-4 text-right">
                    <form action={handleCancelInvite}>
                      <input type="hidden" name="invitationId" value={inv.id} />
                      <button type="submit" className="text-red-400 hover:text-red-300 font-medium">
                        Cancelar
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="p-6 border-b border-gray-800">
          <h3 className="text-xl font-semibold text-gray-200">Miembros Actuales</h3>
        </div>
        <table className="w-full text-left text-sm text-gray-400">
          <thead className="bg-gray-800/50 text-gray-300 uppercase">
            <tr>
              <th className="px-6 py-4 font-medium">Email</th>
              <th className="px-6 py-4 font-medium">Rol Actual</th>
              <th className="px-6 py-4 font-medium">Asignado El</th>
              <th className="px-6 py-4 font-medium text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {members.map(member => (
              <tr key={member.id} className="hover:bg-gray-800/30 transition">
                <td className="px-6 py-4 font-medium text-white">{member.email}</td>
                <td className="px-6 py-4">
                  <form action={handleUpdateRole} className="flex items-center gap-2">
                    <input type="hidden" name="memberId" value={member.id} />
                    <select 
                      name="role" 
                      defaultValue={member.role}
                      className="bg-gray-800 border border-gray-700 text-white px-2 py-1 rounded focus:outline-none focus:border-blue-500"
                    >
                      <option value="ADMIN">ADMIN</option>
                      <option value="BARBER">BARBER</option>
                      <option value="RECEPTIONIST">RECEPTIONIST</option>
                    </select>
                    <button type="submit" className="text-xs bg-gray-700 hover:bg-gray-600 px-2 py-1 rounded text-white transition">
                      Actualizar
                    </button>
                  </form>
                </td>
                <td className="px-6 py-4">{new Date(member.createdAt).toLocaleDateString()}</td>
                <td className="px-6 py-4 text-right">
                  <form action={handleRemoveMember}>
                    <input type="hidden" name="memberId" value={member.id} />
                    <button type="submit" className="text-red-400 hover:text-red-300 font-medium">
                      Remover de Barbería
                    </button>
                  </form>
                </td>
              </tr>
            ))}
            {members.length === 0 && (
              <tr>
                <td colSpan={4} className="px-6 py-8 text-center text-gray-500">
                  Esta organización no tiene miembros.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
