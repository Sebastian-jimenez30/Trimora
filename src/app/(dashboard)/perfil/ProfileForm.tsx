"use client"

import { useState, useTransition, useRef } from "react";
import { updateProfileInfo, updatePassword, uploadAvatar } from "@/modules/profile/actions";

type Props = {
  initialName: string;
  email: string;
  initialAvatarUrl: string;
  role: string;
};

export default function ProfileForm({ initialName, email, initialAvatarUrl, role }: Props) {
  const [avatarUrl, setAvatarUrl] = useState(initialAvatarUrl);
  const [name, setName] = useState(initialName);
  
  const [isPendingInfo, startTransitionInfo] = useTransition();
  const [infoMsg, setInfoMsg] = useState({ text: "", type: "" });

  const [isPendingPwd, startTransitionPwd] = useTransition();
  const [pwdMsg, setPwdMsg] = useState({ text: "", type: "" });

  const [isPendingAvatar, startTransitionAvatar] = useTransition();
  const [avatarMsg, setAvatarMsg] = useState({ text: "", type: "" });
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleInfoSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setInfoMsg({ text: "", type: "" });
    const formData = new FormData(e.currentTarget);
    
    startTransitionInfo(async () => {
      const res = await updateProfileInfo(formData);
      if (res.success) {
        setInfoMsg({ text: "Información actualizada correctamente.", type: "success" });
      } else {
        setInfoMsg({ text: res.error || "Error al actualizar", type: "error" });
      }
    });
  };

  const handlePwdSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setPwdMsg({ text: "", type: "" });
    const form = e.currentTarget;
    const formData = new FormData(form);
    
    startTransitionPwd(async () => {
      const res = await updatePassword(formData);
      if (res.success) {
        setPwdMsg({ text: "Contraseña actualizada correctamente.", type: "success" });
        form.reset();
      } else {
        setPwdMsg({ text: res.error || "Error al actualizar", type: "error" });
      }
    });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    
    const file = e.target.files[0];
    const formData = new FormData();
    formData.append('avatar', file);

    setAvatarMsg({ text: "", type: "" });
    startTransitionAvatar(async () => {
      const res = await uploadAvatar(formData);
      if (res.success && res.avatarUrl) {
        setAvatarUrl(res.avatarUrl);
        setAvatarMsg({ text: "Foto actualizada.", type: "success" });
      } else {
        setAvatarMsg({ text: res.error || "Error al subir foto", type: "error" });
      }
    });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      
      {/* Columna Izquierda: Foto de Perfil */}
      <div className="col-span-1">
        <div className="bg-midnight/90 rounded-2xl shadow-2xl border border-white/10 p-6 flex flex-col items-center text-center">
          <div className="relative group cursor-pointer" onClick={() => fileInputRef.current?.click()}>
            <div className="w-32 h-32 rounded-full bg-pitch border-2 border-white/10 flex items-center justify-center overflow-hidden mb-4 relative z-10 transition-transform group-hover:scale-105">
              {avatarUrl ? (
                <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                <span className="text-4xl font-serif text-sterling font-bold">
                  {name.charAt(0).toUpperCase()}
                </span>
              )}
              
              {/* Overlay on hover */}
              <div className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
              </div>
            </div>
            
            <input 
              type="file" 
              ref={fileInputRef} 
              className="hidden" 
              accept="image/*"
              onChange={handleFileChange}
              disabled={isPendingAvatar}
            />
          </div>
          
          <h2 className="text-xl font-bold text-white mb-1">{name}</h2>
          <p className="text-charcoal text-sm">{email}</p>
          <span className="mt-3 px-3 py-1 bg-cognac/20 text-cognac rounded-full text-xs font-semibold tracking-wide uppercase border border-cognac/30">
            {role}
          </span>
          
          {isPendingAvatar && <p className="text-xs text-blue-400 mt-4 animate-pulse">Subiendo foto...</p>}
          {avatarMsg.text && (
            <p className={`text-xs mt-4 ${avatarMsg.type === 'success' ? 'text-green-400' : 'text-red-400'}`}>
              {avatarMsg.text}
            </p>
          )}
        </div>
      </div>

      {/* Columna Derecha: Formularios */}
      <div className="col-span-1 lg:col-span-2 space-y-6">
        
        {/* Info Form */}
        <div className="bg-midnight/90 rounded-2xl shadow-2xl border border-white/10 p-6 md:p-8">
          <h3 className="text-xl font-serif text-white mb-6 border-b border-white/10 pb-4">Información Personal</h3>
          <form onSubmit={handleInfoSubmit} className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="block text-sm font-medium text-sterling mb-1.5">Nombre Completo</label>
                <input 
                  type="text" 
                  name="fullName"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-4 py-2.5 bg-pitch/80 border border-charcoal/30 rounded-xl focus:outline-none focus:border-cognac focus:ring-1 focus:ring-cognac text-white transition-all shadow-inner"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-sterling mb-1.5">Correo Electrónico</label>
                <input 
                  type="email" 
                  value={email}
                  disabled
                  className="w-full px-4 py-2.5 bg-pitch/40 border border-charcoal/30 rounded-xl text-gray-500 cursor-not-allowed shadow-inner"
                />
                <p className="text-[10px] text-charcoal mt-1">El correo no se puede cambiar.</p>
              </div>
            </div>
            
            <div className="pt-2 flex items-center justify-between">
              <div>
                {infoMsg.text && (
                  <span className={`text-sm ${infoMsg.type === 'success' ? 'text-green-400' : 'text-red-400'}`}>
                    {infoMsg.text}
                  </span>
                )}
              </div>
              <button 
                type="submit"
                disabled={isPendingInfo}
                className="px-6 py-2.5 bg-[#1a1a1a] hover:bg-[#252525] border border-charcoal/30 text-white font-medium rounded-full shadow-inner transform transition-all active:scale-95 disabled:opacity-50 disabled:active:scale-100"
              >
                {isPendingInfo ? "Guardando..." : "Guardar Cambios"}
              </button>
            </div>
          </form>
        </div>

        {/* Security Form */}
        <div className="bg-midnight/90 rounded-2xl shadow-2xl border border-white/10 p-6 md:p-8">
          <h3 className="text-xl font-serif text-white mb-6 border-b border-white/10 pb-4">Seguridad</h3>
          <form onSubmit={handlePwdSubmit} className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="block text-sm font-medium text-sterling mb-1.5">Nueva Contraseña</label>
                <input 
                  type="password" 
                  name="password"
                  placeholder="Mínimo 6 caracteres"
                  className="w-full px-4 py-2.5 bg-pitch/80 border border-charcoal/30 rounded-xl focus:outline-none focus:border-cognac focus:ring-1 focus:ring-cognac text-white transition-all shadow-inner"
                  required
                  minLength={6}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-sterling mb-1.5">Confirmar Contraseña</label>
                <input 
                  type="password" 
                  name="confirmPassword"
                  placeholder="Repite tu contraseña"
                  className="w-full px-4 py-2.5 bg-pitch/80 border border-charcoal/30 rounded-xl focus:outline-none focus:border-cognac focus:ring-1 focus:ring-cognac text-white transition-all shadow-inner"
                  required
                  minLength={6}
                />
              </div>
            </div>
            
            <div className="pt-2 flex items-center justify-between">
              <div>
                {pwdMsg.text && (
                  <span className={`text-sm ${pwdMsg.type === 'success' ? 'text-green-400' : 'text-red-400'}`}>
                    {pwdMsg.text}
                  </span>
                )}
              </div>
              <button 
                type="submit"
                disabled={isPendingPwd}
                className="px-6 py-2.5 bg-cognac hover:bg-cognac-hover text-white font-medium rounded-full shadow-[0_4px_15px_rgba(139,69,19,0.3)] transform transition-all active:scale-95 disabled:opacity-50 disabled:active:scale-100"
              >
                {isPendingPwd ? "Actualizando..." : "Actualizar Contraseña"}
              </button>
            </div>
          </form>
        </div>

      </div>
    </div>
  );
}
