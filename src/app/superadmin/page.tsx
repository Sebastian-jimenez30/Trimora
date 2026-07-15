import { getAllOrganizations, getAllGlobalUsers } from "@/modules/superadmin/actions";

export default async function SuperAdminDashboard() {
  const orgs = await getAllOrganizations();
  const users = await getAllGlobalUsers();

  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-bold text-white">Dashboard Maestro</h2>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-gray-900 border border-gray-800 p-6 rounded-xl">
          <h3 className="text-lg text-gray-400 mb-2">Total Organizaciones</h3>
          <p className="text-4xl font-bold text-blue-400">{orgs.length}</p>
        </div>
        
        <div className="bg-gray-900 border border-gray-800 p-6 rounded-xl">
          <h3 className="text-lg text-gray-400 mb-2">Total Usuarios Globales</h3>
          <p className="text-4xl font-bold text-indigo-400">{users.length}</p>
        </div>
      </div>
    </div>
  );
}
