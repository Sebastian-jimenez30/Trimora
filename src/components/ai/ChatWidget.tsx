"use client"

import { useState, useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { getWebChatHistory, clearWebChatHistory } from "@/modules/ai/actions";

type Message = {
  id?: string;
  role: "user" | "assistant";
  content: string;
  createdAt?: Date;
};

export default function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isInitialLoaded, setIsInitialLoaded] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    if (isOpen && !isInitialLoaded) {
      loadHistory();
    }
  }, [isOpen, isInitialLoaded]);

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [messages, isOpen, isLoading]);

  const loadHistory = async () => {
    setIsLoading(true);
    const res = await getWebChatHistory();
    if (res.success && res.data.length > 0) {
      setMessages(res.data);
    } else {
      // Mensaje de bienvenida inicial si no hay historial
      setMessages([
        {
          role: "assistant",
          content: "¡Hola! 👋 Soy tu asistente de Trimora. Puedo ayudarte a agendar citas, ver la caja del día, consultar el inventario, registrar ventas y más. ¿En qué te ayudo hoy?"
        }
      ]);
    }
    setIsLoading(false);
    setIsInitialLoaded(true);
  };

  const handleSend = async (textToSend?: string) => {
    const query = (textToSend || input).trim();
    if (!query || isLoading) return;

    const userMessage: Message = { role: "user", content: query };
    setMessages((prev) => [...prev, userMessage]);
    if (!textToSend) setInput("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: query }),
      });

      const data = await response.json();

      if (data.success && data.message) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: data.message },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: `⚠️ Error: ${data.error || "No se pudo procesar la solicitud."}`,
          },
        ]);
      }
    } catch (error: any) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "⚠️ Hubo un error de conexión con la IA. Por favor intenta de nuevo.",
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearHistory = async () => {
    if (!confirm("¿Deseas reiniciar la conversación con la IA?")) return;
    setIsLoading(true);
    await clearWebChatHistory();
    setMessages([
      {
        role: "assistant",
        content: "Conversación reiniciada. ¿En qué te puedo colaborar?"
      }
    ]);
    setIsLoading(false);
  };

  const quickSuggestions = [
    "📅 Agenda de hoy",
    "💰 Finanzas del día",
    "📦 Consultar productos",
    "📋 Servicios disponibles",
  ];

  const pathname = usePathname();
  const isAgenda = pathname === "/agenda";

  return (
    <>
      {/* Botón Flotante (Burbuja) - Oculto si el chat está abierto */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(!isOpen)}
          className={`fixed right-6 z-50 bg-cognac hover:brightness-110 text-white p-3.5 rounded-full shadow-2xl transition-all duration-300 transform hover:scale-105 flex items-center justify-center border border-white/20 active:scale-95 group ${
            isAgenda ? "bottom-24" : "bottom-6"
          }`}
          title="Asistente de Trimora"
          aria-label="Abrir asistente de IA"
        >
          <div className="relative flex items-center justify-center">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
              <path d="M8 10h.01"></path>
              <path d="M12 10h.01"></path>
              <path d="M16 10h.01"></path>
            </svg>
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-green-400 rounded-full border-2 border-[#0f0f0f] animate-pulse"></span>
          </div>
        </button>
      )}

      {/* Ventana Emergente del Chatbot */}
      {isOpen && (
        <div className={`fixed right-4 sm:right-6 z-50 w-[calc(100vw-2rem)] sm:w-[380px] h-[520px] max-h-[80vh] bg-[#141414] border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-5 fade-in duration-200 backdrop-blur-md ${
          isAgenda ? "bottom-24" : "bottom-6"
        }`}>
          {/* Header */}
          <div className="p-4 bg-pitch border-b border-white/10 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="w-9 h-9 rounded-full bg-cognac/20 border border-cognac/40 flex items-center justify-center text-cognac font-bold text-sm">
                  ✨
                </div>
                <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 rounded-full border-2 border-pitch"></span>
              </div>
              <div>
                <h4 className="text-sm font-semibold text-sterling leading-tight">Asistente IA Trimora</h4>
                <p className="text-[11px] text-charcoal">En línea • Operación & Consultas</p>
              </div>
            </div>
            
            <div className="flex items-center gap-1">
              <button
                onClick={handleClearHistory}
                title="Limpiar chat"
                className="p-1.5 text-charcoal hover:text-sterling hover:bg-white/5 rounded-lg transition-colors"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18"></path><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
              </button>
              <button
                onClick={() => setIsOpen(false)}
                title="Cerrar"
                className="p-1.5 text-charcoal hover:text-sterling hover:bg-white/5 rounded-lg transition-colors"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            </div>
          </div>

          {/* Área de Mensajes */}
          <div className="flex-1 p-4 overflow-y-auto space-y-3 scrollbar-thin scrollbar-thumb-white/10">
            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={`flex flex-col ${
                  msg.role === "user" ? "items-end" : "items-start"
                }`}
              >
                <div
                  className={`max-w-[85%] px-3.5 py-2.5 rounded-2xl text-xs leading-relaxed whitespace-pre-wrap ${
                    msg.role === "user"
                      ? "bg-cognac text-white rounded-br-xs font-medium shadow-sm"
                      : "bg-pitch border border-white/10 text-sterling rounded-bl-xs"
                  }`}
                >
                  {msg.content}
                </div>
              </div>
            ))}

            {/* Spinner de Carga */}
            {isLoading && (
              <div className="flex items-start gap-2">
                <div className="bg-pitch border border-white/10 px-3.5 py-2.5 rounded-2xl rounded-bl-xs text-xs text-charcoal flex items-center gap-2">
                  <svg className="animate-spin h-3.5 w-3.5 text-cognac" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span>Consultando información...</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Sugerencias Rápidas */}
          {messages.length <= 2 && !isLoading && (
            <div className="px-3 py-2 bg-pitch/50 border-t border-white/5 flex gap-1.5 overflow-x-auto scrollbar-none shrink-0">
              {quickSuggestions.map((sug, i) => (
                <button
                  key={i}
                  onClick={() => handleSend(sug)}
                  className="whitespace-nowrap text-[11px] bg-white/5 hover:bg-white/10 text-sterling px-2.5 py-1 rounded-full border border-white/10 transition-colors shrink-0"
                >
                  {sug}
                </button>
              ))}
            </div>
          )}

          {/* Barra de Entrada */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="p-3 bg-pitch border-t border-white/10 flex items-center gap-2 shrink-0"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Escribe tu consulta o acción..."
              disabled={isLoading}
              className="flex-1 bg-[#141414] border border-white/10 text-sterling text-xs px-3.5 py-2.5 rounded-xl focus:outline-none focus:border-cognac placeholder:text-charcoal transition-colors disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={!input.trim() || isLoading}
              className="bg-cognac hover:brightness-110 text-white p-2.5 rounded-xl transition-all disabled:opacity-30 disabled:cursor-not-allowed shrink-0 flex items-center justify-center"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13"></line>
                <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
              </svg>
            </button>
          </form>
        </div>
      )}
    </>
  );
}
