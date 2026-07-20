"use client"

import { useEffect } from "react";

export default function PrintReceiptClient() {
  useEffect(() => {
    // Retrasar levemente la impresión para asegurar que todo renderice
    const timer = setTimeout(() => {
      window.print();
    }, 500);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="mt-8 text-center print:hidden">
      <button 
        onClick={() => window.print()}
        className="bg-black text-white px-4 py-2 rounded-lg text-sm mr-2"
      >
        Imprimir de Nuevo
      </button>
      <button 
        onClick={() => window.close()}
        className="bg-gray-200 text-black px-4 py-2 rounded-lg text-sm"
      >
        Cerrar
      </button>
    </div>
  );
}
