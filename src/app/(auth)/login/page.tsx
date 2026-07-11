import { login, register } from "@/modules/auth/actions";

export default async function LoginPage(props: { searchParams: Promise<{ message?: string }> }) {
  const searchParams = await props.searchParams;
  
  return (
    <div className="min-h-screen w-full bg-[#17111b] flex items-center justify-center p-4 font-sans text-white">
      <div className="max-w-md w-full bg-[#231d28]/80 rounded-2xl shadow-2xl overflow-hidden border border-[#39323e] backdrop-blur-xl">
        <div className="p-8">
          
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold tracking-tight bg-gradient-to-r from-[#ddb8ff] to-[#9333ea] bg-clip-text text-transparent">
              Trimora
            </h1>
            <p className="text-[#cfc2d7] mt-2 text-sm">Gestiona tu barbería como un profesional</p>
          </div>
          
          {searchParams?.message && (
            <div className="bg-[#93000a]/20 border border-[#93000a] text-[#ffdad6] px-4 py-3 rounded-xl mb-6 text-sm text-center">
              {searchParams.message}
            </div>
          )}
          
          <form className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-[#cfc2d7] mb-1">Correo Electrónico</label>
              <input 
                name="email"
                type="email" 
                required
                className="w-full px-4 py-3 bg-[#1f1924] border border-[#39323e] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#9333ea] text-white transition-all shadow-inner"
                placeholder="admin@trimora.com"
              />
            </div>
            
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="block text-sm font-medium text-[#cfc2d7]">Contraseña</label>
                <a href="#" className="text-xs text-[#ddb8ff] hover:text-[#f0dbff] transition-colors">¿Olvidaste tu contraseña?</a>
              </div>
              <input 
                name="password"
                type="password" 
                required
                className="w-full px-4 py-3 bg-[#1f1924] border border-[#39323e] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#9333ea] text-white transition-all shadow-inner"
                placeholder="••••••••"
              />
            </div>
            
            <div className="pt-2 flex flex-col gap-3">
              <button 
                formAction={login}
                className="w-full py-3.5 px-4 bg-gradient-to-r from-[#9333ea] to-[#5c3286] hover:from-[#861fdd] hover:to-[#44186d] text-white font-medium rounded-xl shadow-[0_0_15px_rgba(147,51,234,0.3)] transform transition-all active:scale-95 flex justify-center items-center"
              >
                Iniciar Sesión
              </button>
              
              <button 
                formAction={register}
                className="w-full py-3.5 px-4 bg-[#39323e]/50 hover:bg-[#39323e] border border-[#4d4354] text-[#eadfee] font-medium rounded-xl shadow-inner transform transition-all active:scale-95 flex justify-center items-center"
              >
                Registrar Administrador
              </button>
            </div>
          </form>

        </div>
      </div>
    </div>
  );
}
