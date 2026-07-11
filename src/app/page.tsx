import Link from "next/link";

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
          
          <div className="hidden md:flex gap-8">
            <Link href="#" className="text-[#ccc] text-sm font-normal hover:text-sterling transition-colors">Home</Link>
            <Link href="#" className="text-[#ccc] text-sm font-normal hover:text-sterling transition-colors">Características</Link>
            <Link href="#" className="text-[#ccc] text-sm font-normal hover:text-sterling transition-colors">Contact us</Link>
            <Link href="#" className="text-[#ccc] text-sm font-normal hover:text-sterling transition-colors">Blog</Link>
          </div>

          <Link href="/register" className="bg-cognac hover:bg-cognac-hover text-sterling px-7 py-3 rounded-full text-[13px] font-semibold tracking-[0.5px] transition-all duration-300 hover:scale-105 shadow-lg">
            PRUEBA GRATIS 14 DÍAS
          </Link>
        </nav>

        {/* Hero */}
        <main className="flex-1 flex flex-col justify-center max-w-[650px] pb-10">
          <h1 className="font-serif text-5xl md:text-[64px] leading-[1.1] mb-6 drop-shadow-xl text-white font-bold">
            TRIMORA: EL ERP PARA BARBERÍAS
          </h1>
          <p className="text-lg leading-[1.6] text-[#dcdcdc] font-light max-w-[500px] mb-10">
            TU NEGOCIO, BAJO TU CONTROL.<br/>EFICACIA Y ESTILO EN CADA CORTE.
          </p>
          <div>
            <Link href="/register" className="inline-block bg-cognac hover:bg-cognac-hover text-sterling px-7 py-3 rounded-full text-[13px] font-semibold tracking-[0.5px] transition-all duration-300 hover:scale-105 shadow-lg">
              PRUEBA GRATIS 14 DÍAS
            </Link>
          </div>
        </main>

        {/* Features Cards */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-6 pb-[60px]">
          {/* Card 1 */}
          <div className="bg-gradient-to-br from-[#9ca3af] via-midnight to-pitch p-[35px_25px] rounded-2xl text-center shadow-2xl relative overflow-hidden border border-white/10 hover:-translate-y-1 transition-transform duration-300 group">
            <div className="absolute top-0 -left-full w-1/2 h-full bg-gradient-to-r from-transparent via-white/10 to-transparent -skew-x-[25deg] animate-shine"></div>
            <svg className="h-[60px] w-auto mx-auto mb-6 fill-sterling drop-shadow-md" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.11 0-1.99.9-1.99 2L3 20a2 2 0 0 0 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10zm0-12H5V6h14v2zm-7 5h5v5h-5z"/>
            </svg>
            <h3 className="text-base font-bold mb-3 tracking-[0.5px] text-white">AGENDA INTELIGENTE</h3>
            <p className="text-[13px] text-[#dcdcdc] leading-relaxed font-light">Sincronización de agendas de manera eficiente.</p>
          </div>
          
          {/* Card 2 */}
          <div className="bg-gradient-to-br from-[#9ca3af] via-midnight to-pitch p-[35px_25px] rounded-2xl text-center shadow-2xl relative overflow-hidden border border-white/10 hover:-translate-y-1 transition-transform duration-300 group">
            <div className="absolute top-0 -left-full w-1/2 h-full bg-gradient-to-r from-transparent via-white/10 to-transparent -skew-x-[25deg] animate-shine"></div>
            <svg className="h-[60px] w-auto mx-auto mb-6 fill-sterling drop-shadow-md" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
            </svg>
            <h3 className="text-base font-bold mb-3 tracking-[0.5px] text-white">GESTIÓN DE CLIENTES</h3>
            <p className="text-[13px] text-[#dcdcdc] leading-relaxed font-light">Perfiles personalizados, clientes y su historial de servicio.</p>
          </div>

          {/* Card 3 */}
          <div className="bg-gradient-to-br from-[#9ca3af] via-midnight to-pitch p-[35px_25px] rounded-2xl text-center shadow-2xl relative overflow-hidden border border-white/10 hover:-translate-y-1 transition-transform duration-300 group">
            <div className="absolute top-0 -left-full w-1/2 h-full bg-gradient-to-r from-transparent via-white/10 to-transparent -skew-x-[25deg] animate-shine"></div>
            <svg className="h-[60px] w-auto mx-auto mb-6 fill-sterling drop-shadow-md" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M20 4H4c-1.11 0-1.99.89-1.99 2L2 18c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V6c0-1.11-.89-2-2-2zm0 14H4v-6h16v6zm0-10H4V6h16v2z"/>
            </svg>
            <h3 className="text-base font-bold mb-3 tracking-[0.5px] text-white">INVENTARIO Y VENTAS</h3>
            <p className="text-[13px] text-[#dcdcdc] leading-relaxed font-light">Gestión de stock, control de productos y punto de venta.</p>
          </div>
        </section>
      </div>
    </div>
  );
}
