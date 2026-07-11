import { login } from "@/modules/auth/actions";
import Link from "next/link";

export default async function LoginPage(props: { searchParams: Promise<{ message?: string }> }) {
  const searchParams = await props.searchParams;
  
  return (
    <div 
      className="min-h-screen w-full bg-pitch flex items-center justify-center p-4 font-sans text-sterling relative"
      style={{
        backgroundImage: `linear-gradient(rgba(10,10,10,0.85), rgba(10,10,10,0.95)), url('https://images.unsplash.com/photo-1503951914875-452162b0f3f1?ixlib=rb-4.0.3&auto=format&fit=crop&w=1920&q=80')`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      <div className="max-w-md w-full bg-midnight/90 rounded-2xl shadow-2xl overflow-hidden border border-white/10 backdrop-blur-xl">
        <div className="p-10">
          
          <div className="text-center mb-8">
            <div className="flex justify-center mb-4">
              <svg width="50" height="50" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M40 60 L10 30 L20 20 L50 50" stroke="white" strokeWidth="4" strokeLinecap="round"/>
                  <path d="M60 60 L90 30 L80 20 L50 50" stroke="white" strokeWidth="4" strokeLinecap="round"/>
                  <circle cx="35" cy="75" r="8" stroke="white" strokeWidth="4"/>
                  <circle cx="65" cy="75" r="8" stroke="white" strokeWidth="4"/>
                  <path d="M41 69 L50 50 L59 69" stroke="white" strokeWidth="4" strokeLinecap="round"/>
                  <circle cx="50" cy="50" r="3" fill="white"/>
              </svg>
            </div>
            <h1 className="text-3xl font-bold tracking-widest font-serif text-white uppercase">
              Trimora
            </h1>
            <p className="text-[#a0a0a0] mt-2 text-sm font-light">Accede a tu panel de control</p>
          </div>
          
          {searchParams?.message && (
            <div className="bg-[#93000a]/20 border border-[#93000a] text-[#ffdad6] px-4 py-3 rounded-xl mb-6 text-sm text-center">
              {searchParams.message}
            </div>
          )}
          
          <form action={login} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-sterling mb-2">Correo Electrónico</label>
              <input 
                name="email"
                type="email" 
                required
                className="w-full px-4 py-3 bg-pitch/80 border border-charcoal/30 rounded-xl focus:outline-none focus:border-cognac focus:ring-1 focus:ring-cognac text-white transition-all shadow-inner"
                placeholder="tu@correo.com"
              />
            </div>
            
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="block text-sm font-medium text-sterling">Contraseña</label>
                <a href="#" className="text-xs text-cognac hover:text-cognac-hover transition-colors font-semibold">¿La olvidaste?</a>
              </div>
              <input 
                name="password"
                type="password" 
                required
                className="w-full px-4 py-3 bg-pitch/80 border border-charcoal/30 rounded-xl focus:outline-none focus:border-cognac focus:ring-1 focus:ring-cognac text-white transition-all shadow-inner"
                placeholder="••••••••"
              />
            </div>
            
            <div className="pt-4 flex flex-col gap-4">
              <button 
                type="submit"
                className="w-full py-3.5 px-4 bg-cognac hover:bg-cognac-hover text-white font-semibold tracking-wide rounded-full shadow-[0_4px_15px_rgba(139,69,19,0.3)] transform transition-all active:scale-95 flex justify-center items-center"
              >
                Iniciar Sesión
              </button>
              
              <div className="text-center text-sm text-charcoal mt-2">
                ¿No tienes cuenta?{" "}
                <Link href="/register" className="text-cognac hover:text-cognac-hover font-bold transition-colors">
                  Regístrate aquí
                </Link>
              </div>
            </div>
          </form>

        </div>
      </div>
    </div>
  );
}
