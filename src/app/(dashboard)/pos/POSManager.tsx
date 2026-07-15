"use client"

import { useState, useTransition, useEffect } from "react";
import { processSale, registerExpense, CartItem } from "@/modules/pos/actions";
import { useSearchParams, useRouter } from "next/navigation";

type POSProps = {
  services: any[];
  products: any[];
  clients: any[];
  staff: any[];
  history: any[];
  pendingAppointments?: any[];
};

export default function POSManager({ services, products, clients, staff, history, pendingAppointments }: POSProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  
  const [activeTab, setActiveTab] = useState<"VENTA" | "HISTORY" | "COMPRA">("VENTA");
  const [isServicesOpen, setIsServicesOpen] = useState(true);
  const [isProductsOpen, setIsProductsOpen] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [paymentMethod, setPaymentMethod] = useState<string>("CASH");
  const [currentAppointmentId, setCurrentAppointmentId] = useState<string>("");

  const [isPending, startTransition] = useTransition();

  // Cargar una cita al POS
  const loadAppointment = (appointmentId: string) => {
    if (!pendingAppointments) return;
    const app = pendingAppointments.find(a => a.id === appointmentId);
    if (!app) return;

    // Setear cliente y el ID de la cita
    setSelectedClientId(app.clientId);
    setCurrentAppointmentId(app.id);

    // Buscar el servicio y agregarlo al carrito
    const srv = services.find(s => s.id === app.serviceId);
    if (srv) {
      setCart([{
        id: srv.id,
        type: "SERVICE",
        name: srv.name,
        price: parseFloat(srv.price),
        quantity: 1,
        staffId: app.staffId
      }]);
    }
  };

  useEffect(() => {
    const urlAppId = searchParams?.get("appointmentId");
    if (urlAppId && pendingAppointments) {
      loadAppointment(urlAppId);
      // Limpiar la URL para evitar recargas raras
      router.replace("/pos");
    }
  }, [searchParams, pendingAppointments, services, router]);

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
    setCart(prev => {
      return prev.map(i => {
        if (i.id === id) {
          const newQty = i.quantity + delta;
          // Validación de stock para productos
          if (i.type === "PRODUCT" && delta > 0) {
            const product = products.find(p => p.id === id);
            if (product && newQty > parseFloat(product.currentStock)) {
              alert("No puedes agregar más unidades de las disponibles en stock.");
              return i;
            }
          }
          if (newQty <= 0) return i; // No baja de 1
          return { ...i, quantity: newQty };
        }
        return i;
      });
    });
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
      const result = await processSale(cart, selectedClientId || null, paymentMethod, currentAppointmentId || undefined);
      if (result.success) {
        setCart([]);
        setSelectedClientId("");
        setCurrentAppointmentId("");
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
    <div className="flex h-full bg-[#0f0f0f] relative overflow-hidden">
      
      {/* Contenido Principal (Izquierda) */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Topbar */}
        <header className="border-b border-white/10 flex flex-col lg:flex-row items-start lg:items-center justify-between px-4 lg:px-8 bg-pitch shrink-0 gap-4 lg:gap-0 pt-4 lg:pt-0 min-h-[70px]">
          <div className="flex gap-6 overflow-x-auto whitespace-nowrap w-full lg:w-auto scrollbar-hide pb-0 lg:pb-0">
            {(["VENTA", "COMPRA", "HISTORY"] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`text-sm font-semibold transition-colors pb-[23px] pt-[23px] border-b-2 ${
                  activeTab === tab 
                    ? "text-sterling border-[#8B4513]" 
                    : "text-[#888] border-transparent hover:text-[#ccc]"
                }`}
              >
                {tab === "VENTA" ? "Venta" : tab === "COMPRA" ? "Compra (Gastos)" : "Historial"}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-5 w-full lg:w-auto pb-4 lg:pb-0">
            {activeTab === "VENTA" && (
              <input 
                type="text" 
                placeholder="Buscar..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="bg-[#141414] border border-white/10 text-sterling px-4 py-2 rounded-full text-sm w-full lg:w-[250px] focus:outline-none focus:border-[#888]"
              />
            )}
          </div>
        </header>

        {/* Main Area */}
        <div className="flex-1 overflow-y-auto p-4 lg:p-8 relative">
          
          {/* VENTA (SERVICIOS Y PRODUCTOS) */}
          {activeTab === "VENTA" && (
            <div className="flex flex-col gap-8">
              
              {/* CITAS PENDIENTES EN PAGINA PRINCIPAL */}
              <div className="bg-[#141414] border border-[#8B4513]/50 p-5 rounded-xl shadow-[0_0_15px_rgba(139,69,19,0.1)] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h3 className="text-lg font-serif text-[#8B4513] font-bold mb-1">Citas Pendientes de Cobro</h3>
                  <p className="text-xs text-charcoal">Selecciona una cita para registrar el pago.</p>
                </div>
                <select 
                  value={currentAppointmentId} 
                  onChange={(e) => {
                    if (e.target.value) loadAppointment(e.target.value);
                    else setCurrentAppointmentId("");
                  }}
                  disabled={!pendingAppointments || pendingAppointments.length === 0}
                  className="bg-pitch border border-[#8B4513]/50 text-sterling px-4 py-3 rounded-lg text-sm focus:outline-none focus:border-[#8B4513] min-w-[250px] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <option value="">
                    {(!pendingAppointments || pendingAppointments.length === 0) ? "No hay citas pendientes hoy" : "(Seleccionar Cita)"}
                  </option>
                  {pendingAppointments?.map(app => (
                    <option key={app.id} value={app.id}>
                      {app.clientName} {app.clientLastName} - {app.serviceName}
                    </option>
                  ))}
                </select>
              </div>

              {/* SERVICIOS */}
              <div className="flex flex-col gap-4">
                <button 
                  onClick={() => setIsServicesOpen(!isServicesOpen)} 
                  className="flex items-center justify-between text-lg font-serif text-sterling bg-[#141414] border border-white/10 px-5 py-3 rounded-xl hover:bg-white/5 transition-colors"
                >
                  <span>Servicios</span>
                  <svg className={`w-5 h-5 transition-transform ${isServicesOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                </button>
                
                {isServicesOpen && (
                  <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 lg:gap-5">
                    {filteredServices.map(srv => {
                      const cartItem = cart.find(i => i.id === srv.id);
                      return (
                        <div 
                          key={srv.id} 
                          className={`relative bg-[#141414] border rounded-xl p-5 transition-all flex flex-col items-center text-center select-none ${
                            cartItem ? "border-[#8B4513] shadow-[0_0_15px_rgba(139,69,19,0.2)]" : "border-white/10 hover:-translate-y-1 hover:border-[#8B4513] hover:shadow-lg cursor-pointer"
                          }`}
                          onClick={() => !cartItem && addToCart(srv, "SERVICE")}
                        >
                          {/* Controles de Tarjeta (Aparece cuando está en el carrito) */}
                          {cartItem && (
                            <div className="absolute top-2 right-2 flex bg-pitch border border-[#8B4513]/50 rounded-lg overflow-hidden items-center shadow-lg z-10" onClick={e => e.stopPropagation()}>
                              <button 
                                onClick={() => removeFromCart(srv.id)} 
                                className="px-2 py-1.5 text-red-400 hover:bg-white/10 transition-colors border-r border-[#8B4513]/30"
                                title="Eliminar del carrito"
                              >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                              </button>
                              <button onClick={() => updateCartQty(srv.id, -1)} className="px-2.5 py-1 text-sterling hover:bg-white/10 transition-colors">-</button>
                              <span className="w-6 text-center text-xs font-bold text-[#8B4513]">{cartItem.quantity}</span>
                              <button onClick={() => updateCartQty(srv.id, 1)} className="px-2.5 py-1 text-sterling hover:bg-white/10 transition-colors border-l border-[#8B4513]/30">+</button>
                            </div>
                          )}

                          <div className="w-[60px] h-[60px] rounded-full bg-[#2C2C2C] text-[#8B4513] flex items-center justify-center mb-4 mt-2">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>
                          </div>
                          <h4 className="text-sm font-semibold text-sterling mb-1">{srv.name}</h4>
                          <p className="text-lg text-[#8B4513] font-bold">${srv.price}</p>
                          <span className="text-[10px] text-[#888] mt-2">{srv.durationMinutes} min</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* PRODUCTOS */}
              <div className="flex flex-col gap-4">
                <button 
                  onClick={() => setIsProductsOpen(!isProductsOpen)} 
                  className="flex items-center justify-between text-lg font-serif text-sterling bg-[#141414] border border-white/10 px-5 py-3 rounded-xl hover:bg-white/5 transition-colors"
                >
                  <span>Productos</span>
                  <svg className={`w-5 h-5 transition-transform ${isProductsOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                </button>
                
                {isProductsOpen && (
                  <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 lg:gap-5">
                    {filteredProducts.map(prd => {
                      const isOutOfStock = parseFloat(prd.currentStock) <= 0;
                      const cartItem = cart.find(i => i.id === prd.id);
                      
                      return (
                        <div 
                          key={prd.id} 
                          className={`relative bg-[#141414] border rounded-xl p-5 transition-all flex flex-col items-center text-center select-none ${
                            isOutOfStock ? "opacity-50 border-white/10 cursor-not-allowed grayscale" :
                            cartItem ? "border-blue-500/50 shadow-[0_0_15px_rgba(59,130,246,0.15)]" : "border-white/10 hover:-translate-y-1 hover:border-blue-500/50 hover:shadow-lg cursor-pointer"
                          }`}
                          onClick={() => !isOutOfStock && !cartItem && addToCart(prd, "PRODUCT")}
                        >
                          {/* Controles de Tarjeta */}
                          {cartItem && (
                            <div className="absolute top-2 right-2 flex bg-pitch border border-blue-500/30 rounded-lg overflow-hidden items-center shadow-lg z-10" onClick={e => e.stopPropagation()}>
                              <button 
                                onClick={() => removeFromCart(prd.id)} 
                                className="px-2 py-1.5 text-red-400 hover:bg-white/10 transition-colors border-r border-blue-500/30"
                              >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                              </button>
                              <button onClick={() => updateCartQty(prd.id, -1)} className="px-2.5 py-1 text-sterling hover:bg-white/10 transition-colors">-</button>
                              <span className="w-6 text-center text-xs font-bold text-blue-400">{cartItem.quantity}</span>
                              <button 
                                onClick={() => updateCartQty(prd.id, 1)} 
                                className={`px-2.5 py-1 text-sterling transition-colors border-l border-blue-500/30 ${cartItem.quantity >= parseFloat(prd.currentStock) ? 'opacity-30 cursor-not-allowed' : 'hover:bg-white/10'}`}
                                disabled={cartItem.quantity >= parseFloat(prd.currentStock)}
                              >
                                +
                              </button>
                            </div>
                          )}

                          <div className="w-[60px] h-[60px] rounded-full bg-[#2C2C2C] text-blue-400 flex items-center justify-center mb-4 mt-2">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
                          </div>
                          <h4 className="text-sm font-semibold text-sterling mb-1">{prd.name}</h4>
                          <p className="text-lg text-blue-400 font-bold">${prd.salePrice}</p>
                          <span className={`text-[10px] font-bold mt-2 ${isOutOfStock ? "text-red-500" : "text-[#888]"}`}>
                            {isOutOfStock ? "Agotado (0)" : `Stock: ${prd.currentStock}`}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

            </div>
          )}

          {/* HISTORIAL */}
          {activeTab === "HISTORY" && (
            <div className="bg-[#141414] border border-white/10 rounded-xl overflow-hidden max-w-5xl">
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
          {activeTab === "COMPRA" && (
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
      </div>

      {/* Barra Lateral de Caja (Sidebar POS) */}
      {activeTab === "VENTA" && cart.length > 0 && (
        <div className="w-full lg:w-[420px] bg-[#101010] border-l border-white/10 flex flex-col h-full z-20 animate-in slide-in-from-right duration-300 absolute lg:relative right-0 shadow-[-10px_0_20px_rgba(0,0,0,0.5)] lg:shadow-none">
          
          <div className="p-5 border-b border-white/10 bg-[#141414] flex justify-between items-center shrink-0">
            <div>
              <h2 className="text-xl font-serif text-sterling">Ticket de Venta</h2>
              <p className="text-[10px] text-charcoal uppercase tracking-wider mt-1">{cartCount} {cartCount === 1 ? 'ítem' : 'ítems'}</p>
            </div>
            {/* Botón solo visible en móviles para ocultar el carrito si se desea seguir agregando */}
            <button onClick={() => {/* En un app real, aquí se podría minimizar la barra lateral en mobile */}} className="lg:hidden text-charcoal hover:text-white">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-5">
            
            <div className="flex flex-col gap-2">
              <label className="text-xs text-charcoal uppercase tracking-wider">Cliente (Opcional)</label>
              <select 
                value={selectedClientId} 
                onChange={(e) => setSelectedClientId(e.target.value)}
                className="bg-pitch border border-white/10 text-sterling px-3 py-2.5 rounded-lg text-sm focus:outline-none focus:border-[#8B4513] w-full"
              >
                <option value="">Cliente General</option>
                {clients.map(c => (
                  <option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>
                ))}
              </select>
            </div>

            <div className="border-t border-white/5 pt-4 flex-1">
              <h3 className="text-xs text-charcoal uppercase tracking-wider mb-3">Detalle</h3>
              <div className="flex flex-col gap-3">
                {cart.map(item => (
                  <div key={item.id} className="flex flex-col bg-white/5 rounded-lg p-3">
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex-1 pr-2">
                        <h4 className="text-sm font-bold text-sterling leading-tight">{item.name}</h4>
                        <span className="text-[10px] text-[#888]">${item.price.toFixed(2)} c/u</span>
                      </div>
                      <span className="text-sm font-bold text-sterling">${(item.price * item.quantity).toFixed(2)}</span>
                    </div>

                    <div className="flex items-center justify-between mt-1">
                      {item.type === "SERVICE" ? (
                        <select 
                          value={item.staffId} 
                          onChange={(e) => updateCartStaff(item.id, e.target.value)}
                          className="bg-pitch border border-white/10 text-[#888] px-2 py-1 rounded text-[10px] focus:outline-none w-[120px]"
                        >
                          {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                      ) : (
                        <div className="w-[120px]"></div>
                      )}

                      <div className="flex items-center bg-pitch border border-white/10 rounded-md">
                        <button onClick={() => removeFromCart(item.id)} className="px-2 py-1 text-red-400 hover:text-red-300 border-r border-white/10">
                           <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                        </button>
                        <button onClick={() => updateCartQty(item.id, -1)} className="px-2 py-1 text-[#888] hover:text-white">-</button>
                        <span className="text-xs font-bold text-sterling w-5 text-center">{item.quantity}</span>
                        <button onClick={() => updateCartQty(item.id, 1)} className="px-2 py-1 text-[#888] hover:text-white">+</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="border-t border-white/5 pt-4">
              <h3 className="text-xs text-charcoal uppercase tracking-wider mb-2">Método de Pago</h3>
              <div className="grid grid-cols-3 gap-2">
                {(["CASH", "CARD", "TRANSFER"] as const).map(method => (
                  <button 
                    key={method}
                    onClick={() => setPaymentMethod(method)}
                    className={`py-2 text-[11px] font-medium rounded-lg border transition-all ${
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

          <div className="p-5 border-t border-white/10 bg-[#141414] shrink-0">
            <div className="flex justify-between items-end mb-4">
              <span className="text-sm text-[#888]">Total</span>
              <span className="text-3xl font-serif font-bold text-[#8B4513]">${cartTotal.toFixed(2)}</span>
            </div>
            <button 
              onClick={handleCheckout} 
              disabled={isPending}
              className="w-full bg-[#8B4513] hover:brightness-110 text-white py-3.5 rounded-xl font-bold text-sm transition-transform hover:scale-[1.02] disabled:opacity-50 flex justify-center items-center gap-2 shadow-[0_0_15px_rgba(139,69,19,0.3)]"
            >
              {isPending && <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>}
              {isPending ? "Procesando Venta..." : "Cobrar"}
            </button>
          </div>
          
        </div>
      )}

    </div>
  );
}
