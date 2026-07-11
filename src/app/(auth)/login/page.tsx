import { login, loginWithGoogle } from "@/modules/auth/actions";
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

          <div className="mt-6 flex items-center justify-center">
            <div className="border-t border-charcoal/30 flex-grow"></div>
            <span className="px-3 text-charcoal text-sm">O continúa con</span>
            <div className="border-t border-charcoal/30 flex-grow"></div>
          </div>

          <form action={loginWithGoogle} className="mt-6">
            <button 
              type="submit"
              className="w-full py-3.5 px-4 bg-[#1a1a1a] hover:bg-[#222] border border-charcoal/30 text-white font-medium rounded-full shadow-inner transform transition-all active:scale-95 flex justify-center items-center gap-3"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Google
            </button>
          </form>

        </div>
      </div>
    </div>
  );
}
