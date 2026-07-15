import { sendPasswordReset } from "@/modules/auth/actions";
import Link from "next/link";

export default function ForgotPasswordPage() {
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
            <h1 className="text-3xl font-bold tracking-wide font-serif text-white">
              Recuperar Contraseña
            </h1>
            <p className="text-[#a0a0a0] mt-2 text-sm font-light">
              Ingresa tu correo electrónico y te enviaremos un código para restablecer tu contraseña.
            </p>
          </div>
          
          <form action={sendPasswordReset} className="space-y-6">
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
            
            <div className="pt-4 flex flex-col gap-4">
              <button 
                type="submit"
                className="w-full py-3.5 px-4 bg-cognac hover:bg-cognac-hover text-white font-semibold tracking-wide rounded-full shadow-[0_4px_15px_rgba(139,69,19,0.3)] transform transition-all active:scale-95 flex justify-center items-center"
              >
                Enviar Código
              </button>
              
              <div className="text-center text-sm text-charcoal mt-2">
                <Link href="/login" className="text-cognac hover:text-cognac-hover font-bold transition-colors">
                  Volver al inicio de sesión
                </Link>
              </div>
            </div>
          </form>

        </div>
      </div>
    </div>
  );
}
