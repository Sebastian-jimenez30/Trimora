"use client";

export default function AnalyticsError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="h-full bg-[#0f0f0f] flex items-center justify-center p-6">
      <div className="max-w-md w-full rounded-xl border border-red-500/20 bg-[#141414] p-7 text-center">
        <div className="w-12 h-12 rounded-full bg-red-500/10 text-red-400 mx-auto flex items-center justify-center mb-4">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" /></svg>
        </div>
        <h2 className="font-serif text-xl text-white">No pudimos cargar la analítica</h2>
        <p className="text-sm text-charcoal mt-2">La información del negocio sigue intacta. Intenta consultar nuevamente.</p>
        <button onClick={reset} className="mt-5 bg-cognac hover:brightness-110 text-white px-5 py-2.5 rounded-lg text-sm font-semibold">Reintentar</button>
      </div>
    </div>
  );
}
