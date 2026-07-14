import Link from "next/link";
import { FeaturesCarousel } from "@/components/FeaturesCarousel";

export default function Home() {
  return (
    <div 
      className="min-h-screen flex flex-col relative"
      style={{
        backgroundImage: `linear-gradient(90deg, rgba(10,10,10,1) 30%, rgba(10,10,10,0.7) 60%, rgba(10,10,10,0.1) 100%), url('https://images.unsplash.com/photo-1503951914875-452162b0f3f1?ixlib=rb-4.0.3&auto=format&fit=crop&w=1920&q=80')`,
        backgroundSize: 'cover',
        backgroundPosition: 'center right',
        backgroundRepeat: 'no-repeat',
        backgroundAttachment: 'fixed',
      }}
    >
      <div className="container mx-auto max-w-[1200px] px-5 flex flex-col min-h-screen relative z-10">
        {/* Navbar */}
        <nav className="flex justify-between items-center py-10">
          <Link href="/" className="flex items-center gap-3 text-sterling hover:text-white transition-colors">
            <svg width="40" height="40" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M40 60 L10 30 L20 20 L50 50" stroke="currentColor" strokeWidth="4" strokeLinecap="round"/>
                <path d="M60 60 L90 30 L80 20 L50 50" stroke="currentColor" strokeWidth="4" strokeLinecap="round"/>
                <circle cx="35" cy="75" r="8" stroke="currentColor" strokeWidth="4"/>
                <circle cx="65" cy="75" r="8" stroke="currentColor" strokeWidth="4"/>
                <path d="M41 69 L50 50 L59 69" stroke="currentColor" strokeWidth="4" strokeLinecap="round"/>
                <circle cx="50" cy="50" r="3" fill="currentColor"/>
            </svg>
            <span className="font-serif text-[28px] font-bold tracking-[2px]">TRIMORA</span>
          </Link>
          
          <nav className="hidden md:flex items-center gap-8 text-sm tracking-wide">
            <Link href="/login" className="hover:text-cognac font-semibold transition-colors duration-300">INICIAR SESIÓN</Link>
            <Link href="/register" className="px-5 py-2.5 bg-cognac hover:bg-cognac-hover text-white rounded-full transition-all duration-300 shadow-[0_0_15px_rgba(139,69,19,0.3)] hover:shadow-[0_0_20px_rgba(139,69,19,0.5)]">
              REGISTRARSE
            </Link>
          </nav>
        </nav>

        {/* Hero */}
        <main className="flex-1 flex flex-col justify-center max-w-[650px] pb-10">
          <h1 className="font-serif text-5xl md:text-[64px] leading-[1.1] mb-6 drop-shadow-xl text-white font-bold">
            TRIMORA
          </h1>
          <p className="text-lg leading-[1.6] text-[#dcdcdc] font-light max-w-[500px] mb-10">
            Somos la plataforma que te ayuda a organizar y profesionalizar la administración de tu negocio. Facilitamos tu día a día con herramientas intuitivas para gestionar tu tiempo, tus clientes y tus ingresos.
          </p>
        </main>

        {/* Ecosistema Carousel */}
        <FeaturesCarousel />

        {/* Harmony Section */}
        <section className="py-24 relative z-10 w-full max-w-[1200px] mx-auto mt-10">
          <div className="bg-gradient-to-br from-[#141414] to-pitch p-12 md:p-16 rounded-3xl border border-white/10 shadow-2xl overflow-hidden relative">
            <div className="absolute top-0 right-0 w-full h-full bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-cognac/20 via-transparent to-transparent opacity-60"></div>
            
            <div className="relative z-10 max-w-3xl">
              <h2 className="font-serif text-3xl md:text-5xl font-bold mb-6 text-white leading-tight">
                Todo Conectado, <br/> Todo en Armonía
              </h2>
              <p className="text-[#dcdcdc] text-lg font-light leading-relaxed mb-8">
                El verdadero poder de <strong>Trimora</strong> no está en sus herramientas individuales, sino en cómo colaboran. 
                Cada funcionalidad tiene un propósito mayor dentro de tu negocio:
              </p>

              <div className="space-y-8">
                <div className="flex gap-4 items-start">
                  <div className="w-10 h-10 rounded-full bg-cognac/20 border border-cognac flex items-center justify-center flex-shrink-0 text-cognac font-bold">1</div>
                  <div>
                    <h4 className="text-xl font-bold text-white mb-2">Comienza en la Agenda</h4>
                    <p className="text-[#dcdcdc] text-sm leading-relaxed">Al programar una cita, el cliente queda automáticamente vinculado. No hay registros duplicados ni confusiones.</p>
                  </div>
                </div>

                <div className="flex gap-4 items-start">
                  <div className="w-10 h-10 rounded-full bg-cognac/20 border border-cognac flex items-center justify-center flex-shrink-0 text-cognac font-bold">2</div>
                  <div>
                    <h4 className="text-xl font-bold text-white mb-2">Impacta al Cliente</h4>
                    <p className="text-[#dcdcdc] text-sm leading-relaxed">Cuando el cliente asiste, su perfil se actualiza con un nuevo historial, ayudándote a fidelizarlo con un servicio más personalizado en el futuro.</p>
                  </div>
                </div>

                <div className="flex gap-4 items-start">
                  <div className="w-10 h-10 rounded-full bg-cognac/20 border border-cognac flex items-center justify-center flex-shrink-0 text-cognac font-bold">3</div>
                  <div>
                    <h4 className="text-xl font-bold text-white mb-2">Finaliza en la Caja</h4>
                    <p className="text-[#dcdcdc] text-sm leading-relaxed">Al completar el servicio, pasas al Punto de Venta. Se cobra el servicio, se venden los productos asociados y el <strong>inventario se descuenta automáticamente</strong>.</p>
                  </div>
                </div>
              </div>

              <div className="mt-12 pt-8 border-t border-white/10">
                <p className="text-sterling italic text-lg">
                  "Menos tiempo administrando, más tiempo creando tu arte."
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
