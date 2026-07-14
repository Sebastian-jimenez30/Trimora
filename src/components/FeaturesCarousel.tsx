"use client";

import { useState } from "react";
import Image from "next/image";

export function FeaturesCarousel() {
  const [activeTab, setActiveTab] = useState(0);

  const features = [
    {
      id: "agenda",
      title: "Agenda Inteligente",
      icon: (
        <svg className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor">
          <path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.11 0-1.99.9-1.99 2L3 20a2 2 0 0 0 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10zm0-12H5V6h14v2zm-7 5h5v5h-5z"/>
        </svg>
      ),
      description: "El corazón de tu barbería. Organiza tus turnos sin esfuerzo, evitando empalmes y tiempos muertos. Diseñada específicamente para el flujo rápido y dinámico de los barberos con una visualización adaptativa.",
      image: "/images/mockups/agenda.png",
      details: [
        "Visualización de cuadrícula adaptativa.",
        "Estados de cita dinámicos (Pendiente, Completado).",
        "Control de tiempos y servicios."
      ]
    },
    {
      id: "clientes",
      title: "Gestión de Clientes",
      icon: (
        <svg className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
        </svg>
      ),
      description: "Conoce a tu clientela mejor que nunca. Crea perfiles personalizados con historiales de cortes, preferencias y un análisis financiero de los ingresos generados por cada cliente.",
      image: "/images/mockups/clientes.png",
      details: [
        "Perfiles y preferencias guardadas.",
        "Historial completo de cortes.",
        "Seguimiento financiero individual."
      ]
    },
    {
      id: "pos",
      title: "Punto de Venta e Inventario",
      icon: (
        <svg className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor">
          <path d="M20 4H4c-1.11 0-1.99.89-1.99 2L2 18c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V6c0-1.11-.89-2-2-2zm0 14H4v-6h16v6zm0-10H4V6h16v2z"/>
        </svg>
      ),
      description: "Vende servicios y productos rápidamente. Tu inventario se conecta en tiempo real, bloqueando ventas si no hay stock y descontando automáticamente los productos usados durante un servicio.",
      image: "/images/mockups/pos.png",
      details: [
        "Facturación rápida de servicios y productos.",
        "Descuento automático de inventario.",
        "Alertas en tiempo real de stock bajo."
      ]
    }
  ];

  return (
    <section className="w-full py-20 bg-[#0a0a0a]/95 backdrop-blur-md border-t border-white/5 relative z-10">
      <div className="container mx-auto max-w-[1200px] px-5">
        
        <div className="text-center mb-16">
          <h2 className="font-serif text-3xl md:text-5xl font-bold mb-4 text-white">Descubre el Ecosistema</h2>
          <p className="text-[#dcdcdc] font-light max-w-2xl mx-auto text-lg">
            Navega por los módulos principales y observa cómo se ve la herramienta diseñada para potenciar tu barbería.
          </p>
        </div>

        {/* Tabs de Navegación */}
        <div className="flex flex-col md:flex-row justify-center gap-4 md:gap-8 mb-12">
          {features.map((feature, index) => (
            <button
              key={feature.id}
              onClick={() => setActiveTab(index)}
              className={`flex items-center gap-3 px-6 py-4 rounded-xl font-bold transition-all duration-300 border ${
                activeTab === index 
                  ? "bg-cognac border-cognac shadow-[0_0_20px_rgba(139,69,19,0.4)] text-white scale-105" 
                  : "bg-[#141414] border-white/10 text-sterling hover:bg-white/5 hover:text-white"
              }`}
            >
              {feature.icon}
              <span className="tracking-wide">{feature.title}</span>
            </button>
          ))}
        </div>

        {/* Contenido Dinámico */}
        <div className="bg-[#141414] rounded-2xl border border-white/10 shadow-2xl overflow-hidden relative">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-0">
            {/* Texto Descriptivo */}
            <div className="p-10 md:p-14 flex flex-col justify-center">
              <h3 className="text-3xl font-serif font-bold text-white mb-6">
                {features[activeTab].title}
              </h3>
              <p className="text-[#dcdcdc] text-lg font-light leading-relaxed mb-8">
                {features[activeTab].description}
              </p>
              
              <ul className="space-y-4">
                {features[activeTab].details.map((detail, idx) => (
                  <li key={idx} className="flex items-start gap-3">
                    <svg className="w-6 h-6 text-cognac flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="text-sterling">{detail}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Imagen Mockup */}
            <div className="bg-[#0f0f0f] relative min-h-[300px] lg:min-h-full border-t lg:border-t-0 lg:border-l border-white/10 p-8 flex items-center justify-center">
              {/* Decorative Background Glow */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3/4 h-3/4 bg-cognac/20 blur-[80px] rounded-full z-0"></div>
              
              <div className="relative z-10 w-full rounded-lg overflow-hidden shadow-[0_10px_40px_rgba(0,0,0,0.5)] border border-white/5 transition-opacity duration-500">
                <Image 
                  src={features[activeTab].image} 
                  alt={features[activeTab].title}
                  width={800}
                  height={600}
                  className="w-full h-auto object-cover"
                />
              </div>
            </div>
          </div>
        </div>

      </div>
    </section>
  );
}
