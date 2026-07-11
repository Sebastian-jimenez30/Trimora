import { register } from "@/modules/auth/actions";
import Link from "next/link";

export default async function RegisterPage(props: { searchParams: Promise<{ message?: string }> }) {
  const searchParams = await props.searchParams;
  
  return (
    <div className="min-h-screen w-full bg-[#17111b] flex items-center justify-center p-4 font-sans text-white">
      <div className="max-w-md w-full bg-[#231d28]/80 rounded-2xl shadow-2xl overflow-hidden border border-[#39323e] backdrop-blur-xl">
        <div className="p-8">
          
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold tracking-tight text-white">
              Crea tu cuenta
            </h1>
            <p className="text-[#cfc2d7] mt-2 text-sm">Únete a Trimora y lleva tu barbería al siguiente nivel</p>
          </div>
          
          {searchParams?.message && (
            <div className="bg-[#93000a]/20 border border-[#93000a] text-[#ffdad6] px-4 py-3 rounded-xl mb-6 text-sm text-center">
              {searchParams.message}
            </div>
          )}
          
          <form action={register} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-[#cfc2d7] mb-1">Correo Electrónico</label>
              <input 
                name="email"
                type="email" 
                required
                className="w-full px-4 py-3 bg-[#1f1924] border border-[#39323e] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#9333ea] text-white transition-all shadow-inner"
                placeholder="tu@correo.com"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-[#cfc2d7] mb-1">Contraseña</label>
              <input 
                name="password"
                type="password" 
                required
                minLength={6}
                className="w-full px-4 py-3 bg-[#1f1924] border border-[#39323e] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#9333ea] text-white transition-all shadow-inner"
                placeholder="Mínimo 6 caracteres"
              />
            </div>
            
            <div className="pt-2 flex flex-col gap-4">
              <button 
                type="submit"
                className="w-full py-3.5 px-4 bg-gradient-to-r from-[#9333ea] to-[#5c3286] hover:from-[#861fdd] hover:to-[#44186d] text-white font-medium rounded-xl shadow-[0_0_15px_rgba(147,51,234,0.3)] transform transition-all active:scale-95 flex justify-center items-center"
              >
                Crear Cuenta
              </button>
              
              <div className="text-center text-sm text-[#cfc2d7]">
                ¿Ya tienes cuenta?{" "}
                <Link href="/login" className="text-[#ddb8ff] hover:text-[#f0dbff] font-medium transition-colors">
                  Inicia sesión
                </Link>
              </div>
            </div>
          </form>

        </div>
      </div>
    </div>
  );
}
