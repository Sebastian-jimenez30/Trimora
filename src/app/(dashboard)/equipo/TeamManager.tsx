"use client"

import { useState, useTransition } from "react";
import { inviteCollaborator, removeCollaborator, cancelInvitation, updateCollaboratorRole } from "@/modules/collaborators/actions";
import { toast } from "react-hot-toast";
import ConfirmModal from "@/components/shared/ConfirmModal";

type Member = {
  id: string;
  userId: string;
  role: string;
  email: string;
  fullName: string;
  avatarUrl: string | null;
  isCurrentUser: boolean;
};

type Invitation = {
  id: string;
  email: string;
  role: string;
};

type Props = {
  members: Member[];
  invitations: Invitation[];
};

export default function TeamManager({ members, invitations }: Props) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  
  const [memberToDelete, setMemberToDelete] = useState<string | null>(null);
  const [inviteToCancel, setInviteToCancel] = useState<string | null>(null);

  const handleInvite = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    
    startTransition(async () => {
      const res = await inviteCollaborator(formData);
      if (res.success) {
        setIsModalOpen(false);
        toast.success("Invitación enviada exitosamente");
      } else {
        toast.error(res.error || "Error al invitar");
      }
    });
  };

  const confirmRemoveMember = () => {
    if (!memberToDelete) return;
    startTransition(async () => {
      const formData = new FormData();
      formData.append("userId", memberToDelete);
      await removeCollaborator(formData);
      toast.success("Miembro eliminado");
      setMemberToDelete(null);
    });
  };

  const confirmCancelInvite = () => {
    if (!inviteToCancel) return;
    startTransition(async () => {
      const formData = new FormData();
      formData.append("invitationId", inviteToCancel);
      await cancelInvitation(formData);
      toast.success("Invitación cancelada");
      setInviteToCancel(null);
    });
  };

  const handleRoleChange = (userId: string, newRole: string) => {
    startTransition(async () => {
      const formData = new FormData();
      formData.append("userId", userId);
      formData.append("role", newRole);
      await updateCollaboratorRole(formData);
    });
  };

  return (
    <div className="space-y-8">
      
      {/* Botón de Acciones Rápidas */}
      <div className="flex justify-end">
        <button 
          onClick={() => setIsModalOpen(true)}
          className="bg-cognac hover:bg-cognac-hover text-white px-6 py-2.5 rounded-full font-medium transition-all shadow-[0_4px_15px_rgba(139,69,19,0.3)] active:scale-95 flex items-center gap-2"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
          Invitar Nuevo Miembro
        </button>
      </div>

      {/* Miembros Activos */}
      <div className="bg-midnight/90 rounded-2xl shadow-2xl border border-white/10 overflow-hidden">
        <div className="p-6 border-b border-white/10 bg-[#1a1a1a]">
          <h2 className="text-xl font-serif text-white">Miembros Activos</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-pitch/50 border-b border-white/5 text-xs uppercase tracking-wider text-charcoal">
                <th className="p-4 font-semibold">Colaborador</th>
                <th className="p-4 font-semibold">Correo</th>
                <th className="p-4 font-semibold">Rol</th>
                <th className="p-4 font-semibold text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-sm text-sterling">
              {members.map(member => (
                <tr key={member.id} className="hover:bg-white/5 transition-colors group">
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-pitch border border-white/10 flex items-center justify-center overflow-hidden shrink-0">
                        {member.avatarUrl ? (
                          <img src={member.avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                        ) : (
                          <span className="font-serif font-bold text-sterling">{member.fullName.charAt(0).toUpperCase()}</span>
                        )}
                      </div>
                      <div>
                        <p className="font-semibold text-white">{member.fullName}</p>
                        {member.isCurrentUser && <span className="text-[10px] text-cognac font-bold">Tú</span>}
                      </div>
                    </div>
                  </td>
                  <td className="p-4 text-charcoal">{member.email}</td>
                  <td className="p-4">
                    <select 
                      value={member.role}
                      onChange={(e) => handleRoleChange(member.userId, e.target.value)}
                      disabled={member.isCurrentUser || isPending}
                      className="bg-pitch/80 border border-charcoal/30 text-sterling text-xs rounded-lg px-2 py-1 focus:outline-none focus:border-cognac disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <option value="ADMIN">Administrador</option>
                      <option value="BARBER">Barbero</option>
                      <option value="RECEPTIONIST">Recepcionista</option>
                    </select>
                  </td>
                  <td className="p-4 text-right">
                    {!member.isCurrentUser && (
                      <button 
                        onClick={() => setMemberToDelete(member.userId)}
                        disabled={isPending}
                        className="text-red-400 hover:text-red-300 font-medium px-3 py-1.5 rounded-lg hover:bg-red-500/10 transition-colors disabled:opacity-50"
                      >
                        Eliminar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {members.length === 0 && (
                <tr><td colSpan={4} className="p-8 text-center text-charcoal">No hay miembros.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Invitaciones Pendientes */}
      {invitations.length > 0 && (
        <div className="bg-midnight/90 rounded-2xl shadow-2xl border border-white/10 overflow-hidden">
          <div className="p-6 border-b border-white/10 bg-[#1a1a1a]">
            <h2 className="text-xl font-serif text-white">Invitaciones Pendientes</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-pitch/50 border-b border-white/5 text-xs uppercase tracking-wider text-charcoal">
                  <th className="p-4 font-semibold">Correo</th>
                  <th className="p-4 font-semibold">Rol Asignado</th>
                  <th className="p-4 font-semibold">Estado</th>
                  <th className="p-4 font-semibold text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-sm text-sterling">
                {invitations.map(inv => (
                  <tr key={inv.id} className="hover:bg-white/5 transition-colors">
                    <td className="p-4 text-white font-medium">{inv.email}</td>
                    <td className="p-4">
                      <span className="px-2.5 py-1 bg-white/5 rounded-full text-xs text-charcoal border border-white/10">
                        {inv.role}
                      </span>
                    </td>
                    <td className="p-4">
                      <span className="px-2.5 py-1 bg-yellow-500/10 text-yellow-500 rounded-full text-xs font-medium border border-yellow-500/20">
                        Pendiente
                      </span>
                    </td>
                    <td className="p-4 text-right">
                      <button 
                        onClick={() => setInviteToCancel(inv.id)}
                        disabled={isPending}
                        className="text-red-400 hover:text-red-300 font-medium px-3 py-1.5 rounded-lg hover:bg-red-500/10 transition-colors disabled:opacity-50"
                      >
                        Cancelar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal Invitar */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-[#141414] border border-white/10 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-6 border-b border-white/10 flex justify-between items-center bg-[#1a1a1a]">
              <h3 className="text-xl font-serif text-white">Invitar al Equipo</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-charcoal hover:text-white transition-colors">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            </div>
            
            <form onSubmit={handleInvite} className="p-6 space-y-5">
              <div>
                <label className="block text-sm font-medium text-sterling mb-1.5">Correo del Colaborador</label>
                <input 
                  type="email" 
                  name="email"
                  placeholder="ejemplo@correo.com"
                  className="w-full px-4 py-2.5 bg-pitch/80 border border-charcoal/30 rounded-xl focus:outline-none focus:border-cognac focus:ring-1 focus:ring-cognac text-white transition-all shadow-inner"
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-sterling mb-1.5">Rol en la Barbería</label>
                <select 
                  name="role"
                  className="w-full px-4 py-2.5 bg-pitch/80 border border-charcoal/30 rounded-xl focus:outline-none focus:border-cognac focus:ring-1 focus:ring-cognac text-white transition-all shadow-inner appearance-none"
                  required
                >
                  <option value="BARBER">Barbero</option>
                  <option value="RECEPTIONIST">Recepcionista</option>
                  <option value="ADMIN">Administrador</option>
                </select>
              </div>

              <div className="pt-4 flex justify-end gap-3">
                <button 
                  type="button" 
                  onClick={() => setIsModalOpen(false)}
                  className="px-5 py-2.5 text-sterling hover:text-white font-medium transition-colors"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  disabled={isPending}
                  className="px-6 py-2.5 bg-cognac hover:bg-cognac-hover text-white font-medium rounded-full shadow-lg transform transition-all active:scale-95 disabled:opacity-50"
                >
                  {isPending ? "Enviando..." : "Enviar Invitación"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmModal 
        isOpen={!!memberToDelete}
        title="Eliminar Miembro"
        message="¿Estás seguro de eliminar a este miembro de la organización?"
        onConfirm={confirmRemoveMember}
        onCancel={() => setMemberToDelete(null)}
        isLoading={isPending}
      />

      <ConfirmModal 
        isOpen={!!inviteToCancel}
        title="Cancelar Invitación"
        message="¿Estás seguro de cancelar esta invitación pendiente?"
        onConfirm={confirmCancelInvite}
        onCancel={() => setInviteToCancel(null)}
        isLoading={isPending}
      />
    </div>
  );
}
