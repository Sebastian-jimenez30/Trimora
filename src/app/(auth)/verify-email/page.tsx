"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/core/database/client";
import Link from "next/link";

export default function VerifyEmailPage() {
  const router = useRouter();
  const [isVerified, setIsVerified] = useState(false);
  
  useEffect(() => {
    const supabase = createClient();
    
    // Escuchar cambios en el estado de autenticación (cuando confirmen en otra pestaña)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session) {
        setIsVerified(true);
        // Esperar un poco para que el usuario vea que se verificó, y luego redirigir
        setTimeout(() => {
          router.push("/dashboard");
          router.refresh(); // Refrescar para asegurar que el layout lea la cookie nueva
        }, 1500);
      }
    });
    
    return () => {
      subscription.unsubscribe();
    };
  }, [router]);

  return (
    <div 
      className="min-h-screen w-full bg-pitch flex items-center justify-center p-4 font-sans text-sterling relative"
      style={{
        backgroundImage: `linear-gradient(rgba(10,10,10,0.85), rgba(10,10,10,0.95)), url('https://images.unsplash.com/photo-1503951914875-452162b0f3f1?ixlib=rb-4.0.3&auto=format&fit=crop&w=1920&q=80')`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      <div className="max-w-md w-full bg-midnight/90 rounded-2xl shadow-2xl overflow-hidden border border-white/10 backdrop-blur-xl text-center p-10">
        
        {!isVerified ? (
          <>
            <div className="mx-auto w-16 h-16 bg-cognac/20 rounded-full flex items-center justify-center mb-6">
              <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-cognac">
                <rect width="20" height="16" x="2" y="4" rx="2"></rect>
                <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"></path>
              </svg>
            </div>
            <h1 className="text-3xl font-bold tracking-wide font-serif text-white mb-2">
              Revisa tu correo
            </h1>
            <p className="text-[#a0a0a0] mb-8 font-light leading-relaxed">
              Te hemos enviado un enlace de confirmación. Por favor, revisa tu bandeja de entrada o la carpeta de spam para verificar tu cuenta.
            </p>
            <div className="flex items-center justify-center gap-3 text-sm text-cognac animate-pulse">
              <div className="w-2 h-2 bg-cognac rounded-full"></div>
              <span>Esperando confirmación...</span>
            </div>
          </>
        ) : (
          <>
            <div className="mx-auto w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mb-6">
              <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-green-500">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                <path d="m9 11 3 3L22 4"></path>
              </svg>
            </div>
            <h1 className="text-3xl font-bold tracking-wide font-serif text-white mb-2">
              ¡Cuenta Verificada!
            </h1>
            <p className="text-[#a0a0a0] mb-8 font-light leading-relaxed">
              Tu correo ha sido confirmado exitosamente. Te estamos redirigiendo al dashboard...
            </p>
            <div className="flex justify-center">
              <Link href="/dashboard" className="flex items-center gap-2 px-6 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-full text-white transition-all text-sm font-medium">
                Ir al Dashboard 
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14"></path>
                  <path d="m12 5 7 7-7 7"></path>
                </svg>
              </Link>
            </div>
          </>
        )}

      </div>
    </div>
  );
}
