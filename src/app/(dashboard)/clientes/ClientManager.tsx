"use client"

import { useState, useTransition } from "react";
import { createCustomer, updateCustomer, deleteCustomer } from "@/modules/clients/actions";

type ClientType = {
  id: string;
  firstName: string;
  lastName: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  totalSpent: string | null;
  lastVisit: Date | null;
};

export default function ClientManager({ initialClients }: { initialClients: ClientType[] }) {
  const [searchTerm, setSearchTerm] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<ClientType | null>(null);
  const [isPending, startTransition] = useTransition();

  const filteredClients = initialClients.filter(c => {
    const term = searchTerm.toLowerCase();
    const fullName = `${c.firstName} ${c.lastName || ''}`.toLowerCase();
    return fullName.includes(term) || c.phone?.includes(term) || c.email?.toLowerCase().includes(term);
  });

  const openCreateModal = () => {
    setEditingClient(null);
    setIsModalOpen(true);
  };

  const openEditModal = (client: ClientType) => {
    setEditingClient(client);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingClient(null);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    
    startTransition(async () => {
      let result;
      if (editingClient) {
        result = await updateCustomer(editingClient.id, formData);
      } else {
        result = await createCustomer(formData);
      }

      if (result.success) {
        closeModal();
      } else {
        alert(result.error);
      }
    });
  };

  const handleDelete = (id: string) => {
    if (!confirm("¿Estás seguro de eliminar este cliente?")) return;
    
    startTransition(async () => {
      const result = await deleteCustomer(id);
      if (!result.success) {
        alert(result.error);
      }
    });
  };

  return (
    <div className="flex flex-col gap-6 flex-1 h-full">
      {/* Header Actions */}
      <div className="flex flex-col sm:flex-row justify-between items-center gap-4 bg-[#141414] border border-white/10 rounded-xl p-4 shrink-0">
        <div className="relative w-full sm:w-auto">
          <svg className="w-4 h-4 absolute left-3 top-3 text-charcoal" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
          <input 
            type="text" 
            placeholder="Buscar por nombre, teléfono o email..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="bg-pitch border border-white/10 text-sterling pl-10 pr-4 py-2 rounded-lg text-sm w-full sm:w-[350px] focus:outline-none focus:border-cognac transition-colors"
          />
        </div>
        <button 
          onClick={openCreateModal}
          className="w-full sm:w-auto bg-cognac hover:brightness-110 text-white px-5 py-2 rounded-lg text-sm font-medium transition-all"
        >
          + Nuevo Cliente
        </button>
      </div>

      {/* Tabla de Clientes */}
      <div className="bg-[#141414] border border-white/10 rounded-xl flex-1 overflow-auto">
        <table className="w-full text-left border-collapse min-w-[600px]">
          <thead className="sticky top-0 bg-[#141414] shadow-sm z-10">
            <tr className="border-b border-white/10 bg-white/5">
              <th className="py-4 px-6 text-xs text-charcoal font-medium uppercase tracking-wider">Cliente</th>
              <th className="py-4 px-6 text-xs text-charcoal font-medium uppercase tracking-wider">Contacto</th>
              <th className="py-4 px-6 text-xs text-charcoal font-medium uppercase tracking-wider">Total Gastado</th>
              <th className="py-4 px-6 text-xs text-charcoal font-medium uppercase tracking-wider text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filteredClients.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-10 text-center text-charcoal text-sm">
                  No se encontraron clientes.
                </td>
              </tr>
            ) : (
              filteredClients.map(client => (
                <tr key={client.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                  <td className="py-4 px-6">
                    <div className="text-sm font-medium text-sterling">{client.firstName} {client.lastName}</div>
                    {client.notes && <div className="text-xs text-charcoal mt-1 line-clamp-1">{client.notes}</div>}
                  </td>
                  <td className="py-4 px-6">
                    <div className="text-sm text-sterling">{client.phone || "---"}</div>
                    <div className="text-xs text-charcoal">{client.email || "---"}</div>
                  </td>
                  <td className="py-4 px-6">
                    <div className="text-sm font-medium text-sterling">${client.totalSpent}</div>
                  </td>
                  <td className="py-4 px-6 text-right">
                    <div className="flex items-center justify-end gap-4">
                      <button 
                        onClick={() => openEditModal(client)}
                        className="text-cognac hover:text-white text-sm font-medium transition-colors"
                      >
                        Editar
                      </button>
                      <button 
                        onClick={() => handleDelete(client.id)}
                        className="text-red-400 hover:text-red-300 text-sm font-medium transition-colors"
                        disabled={isPending}
                      >
                        Eliminar
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Modal CRUD */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm animate-in fade-in duration-200 p-4">
          <div className="bg-[#141414] border border-white/10 w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl shadow-2xl p-5 md:p-7 animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-serif text-sterling">
                {editingClient ? "Editar Cliente" : "Nuevo Cliente"}
              </h3>
              <button onClick={closeModal} className="text-charcoal hover:text-white transition-colors bg-white/5 w-8 h-8 rounded-full flex items-center justify-center">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-5">
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-charcoal uppercase tracking-wider">Nombre *</label>
                  <input type="text" name="firstName" required defaultValue={editingClient?.firstName || ""} className="bg-pitch border border-white/10 text-sterling px-3 py-2.5 rounded-lg text-sm focus:outline-none focus:border-cognac" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-charcoal uppercase tracking-wider">Apellido</label>
                  <input type="text" name="lastName" defaultValue={editingClient?.lastName || ""} className="bg-pitch border border-white/10 text-sterling px-3 py-2.5 rounded-lg text-sm focus:outline-none focus:border-cognac" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-charcoal uppercase tracking-wider">Teléfono</label>
                  <input type="text" name="phone" defaultValue={editingClient?.phone || ""} className="bg-pitch border border-white/10 text-sterling px-3 py-2.5 rounded-lg text-sm focus:outline-none focus:border-cognac" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-charcoal uppercase tracking-wider">Email</label>
                  <input type="email" name="email" defaultValue={editingClient?.email || ""} className="bg-pitch border border-white/10 text-sterling px-3 py-2.5 rounded-lg text-sm focus:outline-none focus:border-cognac" />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-charcoal uppercase tracking-wider">Notas Adicionales</label>
                <textarea name="notes" rows={3} defaultValue={editingClient?.notes || ""} className="bg-pitch border border-white/10 text-sterling px-3 py-2.5 rounded-lg text-sm focus:outline-none focus:border-cognac resize-none" placeholder="Ej: Es alérgico a la cera caliente..."></textarea>
              </div>

              <div className="flex justify-end gap-3 mt-2 border-t border-white/10 pt-5">
                <button type="button" onClick={closeModal} className="px-5 py-2.5 text-sm text-sterling hover:bg-white/5 rounded-lg transition-colors font-medium">
                  Cancelar
                </button>
                <button type="submit" disabled={isPending} className="bg-cognac hover:brightness-110 text-white px-6 py-2.5 rounded-lg text-sm font-medium transition-all disabled:opacity-50 flex items-center gap-2">
                  {isPending && <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>}
                  {isPending ? "Guardando..." : "Guardar Cliente"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
