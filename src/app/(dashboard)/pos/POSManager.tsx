"use client"

import { useState, useTransition } from "react";
import { processSale, registerExpense, CartItem } from "@/modules/pos/actions";

type POSProps = {
  services: any[];
  products: any[];
  clients: any[];
  staff: any[];
  history: any[];
};

export default function POSManager({ services, products, clients, staff, history }: POSProps) {
  const [activeTab, setActiveTab] = useState<"SERVICES" | "PRODUCTS" | "HISTORY" | "EXPENSES">("SERVICES");
  const [searchTerm, setSearchTerm] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  
  const [isCartModalOpen, setIsCartModalOpen] = useState(false);
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [paymentMethod, setPaymentMethod] = useState<string>("CASH");

  const [isPending, startTransition] = useTransition();

  // Helper para añadir al carrito
  const addToCart = (item: any, type: "SERVICE" | "PRODUCT") => {
    if (type === "PRODUCT" && parseFloat(item.currentStock) <= 0) {
      alert("No puedes agregar este producto. Stock agotado (0).");
      return;
    }

    setCart(prev => {
      const existing = prev.find(i => i.id === item.id);
      if (existing) {
        if (type === "PRODUCT" && existing.quantity >= parseFloat(item.currentStock)) {
          alert("No puedes agregar más unidades de las disponibles en stock.");
          return prev;
        }
        return prev.map(i => i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i);
      }
      return [...prev, {
        id: item.id,
        type,
        name: item.name,
        price: parseFloat(type === "SERVICE" ? item.price : item.salePrice),
        quantity: 1,
        staffId: type === "SERVICE" && staff.length > 0 ? staff[0].id : undefined
      }];
    });
  };

  const updateCartQty = (id: string, delta: number) => {
    setCart(prev => prev.map(i => {
      if (i.id === id) {
        const newQty = i.quantity + delta;
        return newQty > 0 ? { ...i, quantity: newQty } : i;
      }
      return i;
    }));
  };

  const updateCartStaff = (id: string, staffId: string) => {
    setCart(prev => prev.map(i => i.id === id ? { ...i, staffId } : i));
  };

  const removeFromCart = (id: string) => {
    setCart(prev => prev.filter(i => i.id !== id));
  };

  const cartTotal = cart.reduce((acc, item) => acc + (item.price * item.quantity), 0);
  const cartCount = cart.reduce((acc, item) => acc + item.quantity, 0);

  const handleCheckout = () => {
    if (cart.length === 0) return;
    startTransition(async () => {
      const result = await processSale(cart, selectedClientId || null, paymentMethod);
      if (result.success) {
        setCart([]);
        setIsCartModalOpen(false);
        setSelectedClientId("");
        setActiveTab("HISTORY");
      } else {
        alert(result.error);
      }
    });
  };

  const handleExpenseSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const amount = parseFloat(formData.get("amount") as string);
    const description = formData.get("description") as string;
    const method = formData.get("paymentMethod") as string;

    startTransition(async () => {
      const result = await registerExpense(amount, description, method);
      if (result.success) {
        setIsExpenseModalOpen(false);
        setActiveTab("HISTORY");
      } else {
        alert(result.error);
      }
    });
  };

  // Filtrado
  const filteredServices = services.filter(s => s.name.toLowerCase().includes(searchTerm.toLowerCase()));
  const filteredProducts = products.filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase()) && p.category !== "CONSUMO");

  return (
    <div className="flex flex-col h-full bg-[#0f0f0f] relative">
      {/* Topbar */}
      <header className="border-b border-white/10 flex flex-col sm:flex-row items-start sm:items-center justify-between px-4 sm:px-8 bg-pitch shrink-0 gap-4 sm:gap-0 pt-4 sm:pt-0 min-h-[70px]">
        <div className="flex gap-6 overflow-x-auto whitespace-nowrap w-full sm:w-auto scrollbar-hide pb-0 sm:pb-0">
          {(["SERVICES", "PRODUCTS", "HISTORY", "EXPENSES"] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`text-sm font-semibold transition-colors pb-[23px] pt-[23px] border-b-2 ${
                activeTab === tab 
                  ? "text-sterling border-[#8B4513]" 
                  : "text-[#888] border-transparent hover:text-[#ccc]"
              }`}
            >
              {tab === "SERVICES" ? "Servicios" : tab === "PRODUCTS" ? "Productos" : tab === "HISTORY" ? "Historial" : "Registrar Gasto"}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-5 w-full sm:w-auto pb-4 sm:pb-0">
          {(activeTab === "SERVICES" || activeTab === "PRODUCTS") && (
            <input 
              type="text" 
              placeholder="Buscar..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-[#141414] border border-white/10 text-sterling px-4 py-2 rounded-full text-sm w-full sm:w-[250px] focus:outline-none focus:border-[#888]"
            />
          )}
        </div>
      </header>

      {/* Main Area */}
      <div className="flex-1 overflow-y-auto p-8 relative">
        
        {/* SERVICIOS */}
        {activeTab === "SERVICES" && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
            {filteredServices.map(srv => (
              <div 
                key={srv.id} 
                onClick={() => addToCart(srv, "SERVICE")}
                className="bg-[#141414] border border-white/10 rounded-xl p-5 cursor-pointer hover:-translate-y-1 hover:border-[#8B4513] hover:shadow-lg transition-all flex flex-col items-center text-center"
              >
                <div className="w-[60px] h-[60px] rounded-full bg-[#2C2C2C] text-[#8B4513] flex items-center justify-center mb-4">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>
                </div>
                <h4 className="text-sm font-semibold text-sterling mb-1">{srv.name}</h4>
                <p className="text-lg text-[#8B4513] font-bold">${srv.price}</p>
                <span className="text-[10px] text-[#888] mt-2">{srv.durationMinutes} min</span>
              </div>
            ))}
          </div>
        )}

        {/* PRODUCTOS */}
        {activeTab === "PRODUCTS" && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
            {filteredProducts.map(prd => {
              const isOutOfStock = parseFloat(prd.currentStock) <= 0;
              return (
                <div 
                  key={prd.id} 
                  onClick={() => !isOutOfStock && addToCart(prd, "PRODUCT")}
                  className={`bg-[#141414] border border-white/10 rounded-xl p-5 flex flex-col items-center text-center transition-all ${
                    isOutOfStock ? "opacity-50 cursor-not-allowed grayscale" : "cursor-pointer hover:-translate-y-1 hover:border-[#8B4513] hover:shadow-lg"
                  }`}
                >
                  <div className="w-[60px] h-[60px] rounded-full bg-[#2C2C2C] text-blue-400 flex items-center justify-center mb-4">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
                  </div>
                  <h4 className="text-sm font-semibold text-sterling mb-1">{prd.name}</h4>
                  <p className="text-lg text-[#8B4513] font-bold">${prd.salePrice}</p>
                  <span className={`text-[10px] font-bold mt-2 ${isOutOfStock ? "text-red-500" : "text-[#888]"}`}>
                    {isOutOfStock ? "Agotado (0)" : `Stock: ${prd.currentStock}`}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* HISTORIAL */}
        {activeTab === "HISTORY" && (
          <div className="bg-[#141414] border border-white/10 rounded-xl overflow-hidden">
            <div className="p-5 border-b border-white/10">
              <h3 className="font-serif text-lg text-sterling">Transacciones Recientes</h3>
            </div>
            <table className="w-full text-left border-collapse">
              <thead>
                <tr>
                  <th className="py-3 px-5 text-xs text-[#888] font-medium border-b border-white/10">Fecha / Hora</th>
                  <th className="py-3 px-5 text-xs text-[#888] font-medium border-b border-white/10">Tipo</th>
                  <th className="py-3 px-5 text-xs text-[#888] font-medium border-b border-white/10">Descripción</th>
                  <th className="py-3 px-5 text-xs text-[#888] font-medium border-b border-white/10">Cliente</th>
                  <th className="py-3 px-5 text-xs text-[#888] font-medium border-b border-white/10 text-right">Monto</th>
                </tr>
              </thead>
              <tbody>
                {history.map(tx => (
                  <tr key={tx.id} className="hover:bg-white/5 border-b border-white/5 transition-colors">
                    <td className="py-3 px-5 text-sm text-sterling">
                      {new Date(tx.createdAt).toLocaleDateString()} {new Date(tx.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                    </td>
                    <td className="py-3 px-5">
                      <span className={`px-2 py-1 rounded text-[10px] uppercase font-bold tracking-wider ${
                        tx.type === "INCOME" ? "bg-green-900/30 text-green-500" : "bg-red-900/30 text-red-500"
                      }`}>
                        {tx.type === "INCOME" ? "VENTA" : "GASTO"}
                      </span>
                    </td>
                    <td className="py-3 px-5 text-sm text-sterling">{tx.description}</td>
                    <td className="py-3 px-5 text-sm text-[#888]">{tx.clientName}</td>
                    <td className={`py-3 px-5 text-sm font-bold text-right ${tx.type === "INCOME" ? "text-green-500" : "text-red-500"}`}>
                      {tx.type === "INCOME" ? "+" : "-"}${tx.totalAmount}
                    </td>
                  </tr>
                ))}
                {history.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-10 text-center text-[#888] text-sm">No hay transacciones recientes.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* GASTOS */}
        {activeTab === "EXPENSES" && (
          <div className="flex items-center justify-center pt-10">
            <div className="bg-[#141414] border border-white/10 rounded-xl p-8 w-full max-w-md">
              <h3 className="font-serif text-2xl text-sterling mb-2">Registrar Gasto</h3>
              <p className="text-sm text-[#888] mb-6">Salida de dinero de la caja para insumos, recibos o emergencias.</p>
              
              <form onSubmit={handleExpenseSubmit} className="flex flex-col gap-5">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-charcoal uppercase tracking-wider">Descripción del Gasto *</label>
                  <input type="text" name="description" required placeholder="Ej. Pago de Luz" className="bg-pitch border border-white/10 text-sterling px-4 py-3 rounded-lg text-sm focus:outline-none focus:border-red-500" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-charcoal uppercase tracking-wider">Monto Total ($) *</label>
                  <input type="number" step="0.01" min="0" name="amount" required placeholder="0.00" className="bg-pitch border border-white/10 text-sterling px-4 py-3 rounded-lg text-sm focus:outline-none focus:border-red-500" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-charcoal uppercase tracking-wider">Método de Pago</label>
                  <select name="paymentMethod" className="bg-pitch border border-white/10 text-sterling px-4 py-3 rounded-lg text-sm focus:outline-none focus:border-red-500">
                    <option value="CASH">Efectivo (Caja)</option>
                    <option value="TRANSFER">Transferencia (Banco)</option>
                    <option value="CARD">Tarjeta</option>
                  </select>
                </div>
                <button type="submit" disabled={isPending} className="bg-red-900/80 hover:bg-red-800 text-white w-full py-3 rounded-lg text-sm font-bold transition-colors mt-2">
                  {isPending ? "Registrando..." : "Confirmar Gasto"}
                </button>
              </form>
            </div>
          </div>
        )}

      </div>

      {/* Botón Flotante del Carrito */}
      {(activeTab === "SERVICES" || activeTab === "PRODUCTS") && cart.length > 0 && (
        <button 
          onClick={() => setIsCartModalOpen(true)}
          className="absolute bottom-4 right-4 sm:bottom-8 sm:right-8 bg-[#8B4513] hover:brightness-110 text-white rounded-full px-5 py-3 sm:px-6 sm:py-4 shadow-[0_10px_25px_rgba(139,69,19,0.4)] flex items-center gap-2 sm:gap-3 transition-transform hover:scale-105 z-40"
        >
          <div className="bg-white/20 text-white text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center">
            {cartCount}
          </div>
          <span className="font-semibold hidden sm:inline">Ver Cuenta / Cobrar</span>
          <span className="font-semibold sm:hidden">Cobrar</span>
          <span className="font-bold border-l border-white/30 pl-2 sm:pl-3 ml-0 sm:ml-1">${cartTotal.toFixed(2)}</span>
        </button>
      )}

      {/* Modal Factura / Checkout */}
      {isCartModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-200 sm:p-4">
          <div className="bg-[#0f0f0f] sm:border border-white/10 w-full max-w-2xl h-full sm:h-[85vh] sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
            
            {/* Cabecera Ticket */}
            <div className="p-6 border-b border-white/10 bg-[#141414] flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-serif text-sterling">Detalle de Cuenta</h2>
                <p className="text-xs text-[#888] mt-1">Nº de Ticket temporal • {new Date().toLocaleDateString()}</p>
              </div>
              <button onClick={() => setIsCartModalOpen(false)} className="bg-white/5 hover:bg-white/10 w-10 h-10 rounded-full flex items-center justify-center transition-colors">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            </div>

            {/* Cuerpo de la Factura */}
            <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6">
              
              <div className="bg-[#141414] border border-white/5 rounded-xl p-5 flex flex-col gap-4">
                <h3 className="text-sm font-semibold text-sterling border-b border-white/5 pb-2">Información del Cliente</h3>
                <select 
                  value={selectedClientId} 
                  onChange={(e) => setSelectedClientId(e.target.value)}
                  className="bg-pitch border border-white/10 text-sterling px-4 py-3 rounded-lg text-sm focus:outline-none focus:border-[#8B4513] w-full"
                >
                  <option value="">Cliente General (Sin Registrar)</option>
                  {clients.map(c => (
                    <option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>
                  ))}
                </select>
              </div>

              <div className="bg-[#141414] border border-white/5 rounded-xl p-5">
                <h3 className="text-sm font-semibold text-sterling border-b border-white/5 pb-3 mb-3">Ítems a Cobrar</h3>
                
                <div className="flex flex-col gap-4">
                  {cart.map(item => (
                    <div key={item.id} className="flex items-center justify-between border-b border-white/5 pb-4 last:border-0 last:pb-0">
                      
                      <div className="flex-1">
                        <h4 className="text-sm font-bold text-sterling">{item.name}</h4>
                        <div className="flex items-center gap-3 mt-2">
                          <span className="text-xs text-[#888]">${item.price.toFixed(2)} c/u</span>
                          {item.type === "SERVICE" && (
                            <select 
                              value={item.staffId} 
                              onChange={(e) => updateCartStaff(item.id, e.target.value)}
                              className="bg-pitch border border-white/10 text-[#888] px-2 py-1 rounded text-xs focus:outline-none"
                            >
                              {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </select>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-6">
                        <div className="flex items-center gap-3 bg-pitch border border-white/10 rounded-lg px-2 py-1">
                          <button onClick={() => updateCartQty(item.id, -1)} className="text-[#888] hover:text-white px-2">-</button>
                          <span className="text-sm font-medium w-4 text-center">{item.quantity}</span>
                          <button onClick={() => updateCartQty(item.id, 1)} className="text-[#888] hover:text-white px-2">+</button>
                        </div>
                        <div className="text-right min-w-[80px]">
                          <p className="text-base font-bold text-sterling">${(item.price * item.quantity).toFixed(2)}</p>
                          <button onClick={() => removeFromCart(item.id)} className="text-[10px] text-red-400 hover:underline mt-1">Quitar</button>
                        </div>
                      </div>

                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-[#141414] border border-white/5 rounded-xl p-5 flex flex-col gap-3">
                <h3 className="text-sm font-semibold text-sterling border-b border-white/5 pb-2 mb-1">Método de Pago</h3>
                <div className="flex gap-3">
                  {(["CASH", "CARD", "TRANSFER"] as const).map(method => (
                    <button 
                      key={method}
                      onClick={() => setPaymentMethod(method)}
                      className={`flex-1 py-3 text-sm font-medium rounded-lg border transition-all ${
                        paymentMethod === method 
                          ? "bg-[#8B4513]/20 border-[#8B4513] text-white" 
                          : "bg-pitch border-white/10 text-[#888] hover:border-white/30"
                      }`}
                    >
                      {method === "CASH" ? "Efectivo" : method === "CARD" ? "Tarjeta" : "Transferencia"}
                    </button>
                  ))}
                </div>
              </div>

            </div>

            {/* Total y Confirmación */}
            <div className="p-4 sm:p-6 border-t border-white/10 bg-[#141414] flex flex-col sm:flex-row justify-between items-center gap-4">
              <div className="w-full sm:w-auto text-center sm:text-left">
                <p className="text-sm text-[#888]">Total a Cobrar</p>
                <p className="text-4xl font-serif font-bold text-[#8B4513]">${cartTotal.toFixed(2)}</p>
              </div>
              <button 
                onClick={handleCheckout} 
                disabled={isPending}
                className="w-full sm:w-auto bg-[#8B4513] hover:brightness-110 text-white px-10 py-4 rounded-xl font-bold text-lg transition-transform hover:scale-105 disabled:opacity-50 disabled:hover:scale-100"
              >
                {isPending ? "Procesando..." : "Completar Venta"}
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
