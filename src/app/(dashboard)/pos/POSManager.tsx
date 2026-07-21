"use client"

import { useState, useTransition, useEffect } from "react";
import { processSale, registerExpense, registerPayment, exportFinancialReport, CartItem } from "@/modules/pos/actions";
import { useSearchParams, useRouter } from "next/navigation";
import { toast } from "react-hot-toast";

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
  const [isCartOpenMobile, setIsCartOpenMobile] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [paymentMethod, setPaymentMethod] = useState<string>("CASH");
  const [currentAppointmentId, setCurrentAppointmentId] = useState<string>("");

  const [initialPaidAmount, setInitialPaidAmount] = useState<string>("");
  const [initialPaymentMethod, setInitialPaymentMethod] = useState<string>("CASH");
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [selectedTxId, setSelectedTxId] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [successTxId, setSuccessTxId] = useState("");
  
  const [isExporting, setIsExporting] = useState(false);

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

    const tab = searchParams?.get("tab");
    if (tab === "HISTORY" || tab === "VENTA" || tab === "COMPRA") {
      setActiveTab(tab as any);
    }
    
    const payTx = searchParams?.get("payTx");
    const payAmountParam = searchParams?.get("payAmount");
    if (payTx && payAmountParam) {
      setSelectedTxId(payTx);
      setPaymentAmount(payAmountParam);
      setIsPaymentModalOpen(true);
      router.replace("/pos");
    }
  }, [searchParams, pendingAppointments, services, router]);

  // Helper para añadir al carrito
  const addToCart = (item: any, type: "SERVICE" | "PRODUCT") => {
    if (type === "PRODUCT" && parseFloat(item.currentStock) <= 0) {
      toast.error("No puedes agregar este producto. Stock agotado (0).");
      return;
    }

    setCart(prev => {
      const existing = prev.find(i => i.id === item.id);
      if (existing) {
        if (type === "PRODUCT" && existing.quantity >= parseFloat(item.currentStock)) {
          toast.error("No puedes agregar más unidades de las disponibles en stock.");
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
              toast.error("No puedes agregar más unidades de las disponibles en stock.");
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
    if (paymentMethod === 'CREDIT' && !selectedClientId) {
      toast.error("Debe seleccionar un cliente para fiados.");
      return;
    }
    const parsedInitialPaid = parseFloat(initialPaidAmount) || 0;
    
    startTransition(async () => {
      const result = await processSale(cart, selectedClientId || null, paymentMethod, currentAppointmentId || undefined, parsedInitialPaid, initialPaymentMethod);
      if (result.success && result.transactionId) {
        setCart([]);
        setSelectedClientId("");
        setCurrentAppointmentId("");
        setInitialPaidAmount("");
        setSuccessTxId(result.transactionId); // Abrir modal de éxito
        setActiveTab("HISTORY");
      } else {
        toast.error(result.error || "Error al procesar la venta");
      }
    });
  };

  const handlePayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTxId || !paymentAmount) return;
    const amount = parseFloat(paymentAmount);
    if (amount <= 0) return;

    startTransition(async () => {
      const result = await registerPayment(selectedTxId, amount, "CASH"); // Asumimos efectivo por rapidez, se podría mejorar
      if (result.success) {
        setIsPaymentModalOpen(false);
        setSelectedTxId("");
        setPaymentAmount("");
        toast.success("Abono registrado");
      } else {
        toast.error(result.error || "Error al registrar el abono");
      }
    });
  };

  const handleExport = async () => {
    setIsExporting(true);
    // Exportamos el mes actual como ejemplo, idealmente tendría selectores
    const start = new Date();
    start.setDate(1);
    start.setHours(0,0,0,0);
    const end = new Date();
    end.setHours(23,59,59,999);
    
    const result = await exportFinancialReport(start.toISOString(), end.toISOString());
    setIsExporting(false);
    if (result.success && result.csv) {
      const blob = new Blob([result.csv], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `reporte_financiero_${start.toLocaleDateString().replace(/\//g, '-')}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
    } else {
      toast.error(result.error || "Error exportando el reporte");
    }
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
        toast.success("Gasto registrado");
        setActiveTab("HISTORY");
      } else {
        toast.error(result.error || "Error al registrar gasto");
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
              <div className="p-5 border-b border-white/10 flex justify-between items-center">
                <h3 className="font-serif text-lg text-sterling">Transacciones Recientes</h3>
                <button 
                  onClick={handleExport}
                  disabled={isExporting}
                  className="bg-[#1a1a1a] border border-white/10 hover:bg-white/5 text-[#888] hover:text-white px-4 py-2 rounded-lg text-xs font-bold transition-colors disabled:opacity-50"
                >
                  {isExporting ? "Exportando..." : "Exportar CSV (Mes)"}
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse whitespace-nowrap min-w-[600px]">
                  <thead>
                    <tr>
                    <th className="py-3 px-5 text-xs text-[#888] font-medium border-b border-white/10">Fecha / Hora</th>
                    <th className="py-3 px-5 text-xs text-[#888] font-medium border-b border-white/10">Tipo</th>
                    <th className="py-3 px-5 text-xs text-[#888] font-medium border-b border-white/10">Descripción</th>
                    <th className="py-3 px-5 text-xs text-[#888] font-medium border-b border-white/10">Cliente</th>
                    <th className="py-3 px-5 text-xs text-[#888] font-medium border-b border-white/10">Estado</th>
                    <th className="py-3 px-5 text-xs text-[#888] font-medium border-b border-white/10 text-right">Monto</th>
                    <th className="py-3 px-5 text-xs text-[#888] font-medium border-b border-white/10 text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map(tx => {
                    const isPending = tx.status === 'PENDING';
                    const remaining = isPending ? (parseFloat(tx.totalAmount) - parseFloat(tx.paidAmount || '0')).toFixed(2) : '0.00';
                    return (
                    <tr key={tx.id} className={`hover:bg-white/5 border-b border-white/5 transition-colors ${isPending ? 'bg-[#8B4513]/10' : ''}`}>
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
                      <td className="py-3 px-5">
                        {isPending ? (
                          <div className="flex flex-col">
                            <span className="text-orange-400 font-bold text-xs uppercase tracking-wider">Pendiente</span>
                            <span className="text-[10px] text-orange-400/70">Debe: ${remaining}</span>
                          </div>
                        ) : (
                          <span className="text-green-500 font-bold text-xs uppercase tracking-wider">Completado</span>
                        )}
                      </td>
                      <td className={`py-3 px-5 text-sm font-bold text-right ${tx.type === "INCOME" ? "text-green-500" : "text-red-500"}`}>
                        {tx.type === "INCOME" ? "+" : "-"}${tx.totalAmount}
                      </td>
                      <td className="py-3 px-5 text-center flex items-center justify-center gap-2">
                        {tx.type === "INCOME" && (
                          <button
                            onClick={() => window.open(`/pos/receipt/${tx.id}`, '_blank')}
                            className="bg-white/5 hover:bg-white/10 text-sterling px-3 py-1.5 rounded text-xs transition-colors"
                            title="Imprimir Factura"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
                          </button>
                        )}
                        {isPending && (
                           <button
                             onClick={() => {
                               setSelectedTxId(tx.id);
                               setPaymentAmount(remaining);
                               setIsPaymentModalOpen(true);
                             }}
                             className="bg-orange-500/20 hover:bg-orange-500/40 border border-orange-500/50 text-orange-400 px-3 py-1.5 rounded text-xs transition-colors font-bold"
                             title="Abonar"
                           >
                             Abonar
                           </button>
                        )}
                      </td>
                    </tr>
                  )})}
                  {history.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-10 text-center text-[#888] text-sm">No hay transacciones recientes.</td>
                    </tr>
                  )}
                </tbody>
              </table>
              </div>
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
      
      {/* Botón Flotante para Móviles */}
      {activeTab === "VENTA" && cart.length > 0 && !isCartOpenMobile && (
        <div className="lg:hidden absolute bottom-4 left-4 right-4 z-10">
          <button 
            onClick={() => setIsCartOpenMobile(true)}
            className="w-full bg-[#8B4513] hover:bg-[#A0522D] text-white py-4 rounded-xl font-bold shadow-lg flex justify-between px-6 items-center"
          >
            <span>Ver Carrito ({cartCount})</span>
            <span>${cartTotal.toFixed(2)}</span>
          </button>
        </div>
      )}

      {activeTab === "VENTA" && cart.length > 0 && (
        <div className={`w-full lg:w-[420px] bg-[#101010] border-l border-white/10 flex-col h-full z-20 animate-in slide-in-from-right duration-300 absolute lg:relative right-0 shadow-[-10px_0_20px_rgba(0,0,0,0.5)] lg:shadow-none ${isCartOpenMobile ? 'flex' : 'hidden lg:flex'}`}>
          
          <div className="p-5 border-b border-white/10 bg-[#141414] flex justify-between items-center shrink-0">
            <div>
              <h2 className="text-xl font-serif text-sterling">Ticket de Venta</h2>
              <p className="text-[10px] text-charcoal uppercase tracking-wider mt-1">{cartCount} {cartCount === 1 ? 'ítem' : 'ítems'}</p>
            </div>
            {/* Botón solo visible en móviles para ocultar el carrito si se desea seguir agregando */}
            <button onClick={() => setIsCartOpenMobile(false)} className="lg:hidden text-charcoal hover:text-white">
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
              <div className="grid grid-cols-4 gap-2">
                {(["CASH", "CARD", "TRANSFER", "CREDIT"] as const).map(method => (
                  <button 
                    key={method}
                    onClick={() => setPaymentMethod(method)}
                    className={`py-2 text-[10px] font-medium rounded-lg border transition-all ${
                      paymentMethod === method 
                        ? "bg-[#8B4513]/20 border-[#8B4513] text-white" 
                        : "bg-pitch border-white/10 text-[#888] hover:border-white/30"
                    }`}
                  >
                    {method === "CASH" ? "Efectivo" : method === "CARD" ? "Tarjeta" : method === "TRANSFER" ? "Transferencia" : "Fiado"}
                  </button>
                ))}
              </div>
              
              {paymentMethod === "CREDIT" && (
                <div className="mt-4 p-3 bg-white/5 rounded-lg border border-orange-500/30 animate-in fade-in slide-in-from-top-2">
                  <label className="text-xs text-orange-400 font-bold mb-2 block">Abono Inicial (Opcional)</label>
                  <div className="flex gap-2">
                    <input 
                      type="number" 
                      min="0"
                      step="0.01"
                      placeholder="0.00" 
                      value={initialPaidAmount}
                      onChange={e => setInitialPaidAmount(e.target.value)}
                      className="bg-pitch border border-white/10 text-sterling px-3 py-2 rounded-lg text-sm w-full focus:outline-none focus:border-orange-500"
                    />
                    <select 
                      value={initialPaymentMethod}
                      onChange={e => setInitialPaymentMethod(e.target.value)}
                      className="bg-pitch border border-white/10 text-[#888] px-2 py-2 rounded-lg text-xs focus:outline-none w-[110px]"
                    >
                      <option value="CASH">Efectivo</option>
                      <option value="CARD">Tarjeta</option>
                      <option value="TRANSFER">Transf.</option>
                    </select>
                  </div>
                  <p className="text-[10px] text-charcoal mt-1">Deje vacío si no hay abono inicial.</p>
                </div>
              )}
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

      {/* MODAL PARA ABONAR */}
      {isPaymentModalOpen && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#141414] border border-white/10 p-6 rounded-xl w-full max-w-sm shadow-2xl animate-in zoom-in-95">
            <h3 className="text-lg font-serif text-sterling mb-1">Registrar Abono</h3>
            <p className="text-xs text-[#888] mb-4">Ingrese el monto a abonar a la deuda.</p>
            <form onSubmit={handlePayment} className="flex flex-col gap-4">
              <div>
                <label className="text-xs text-charcoal uppercase tracking-wider block mb-1">Monto ($)</label>
                <input 
                  type="number" 
                  step="0.01" 
                  min="0.01"
                  required
                  autoFocus
                  value={paymentAmount}
                  onChange={e => setPaymentAmount(e.target.value)}
                  className="bg-pitch border border-white/10 text-sterling px-4 py-3 rounded-lg text-sm focus:outline-none focus:border-orange-500 w-full"
                />
              </div>
              <div className="flex gap-3 mt-2">
                <button 
                  type="button" 
                  onClick={() => setIsPaymentModalOpen(false)}
                  className="flex-1 bg-white/5 hover:bg-white/10 text-sterling py-2.5 rounded-lg text-sm font-bold transition-colors"
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  disabled={isPending}
                  className="flex-1 bg-orange-500/80 hover:bg-orange-500 text-white py-2.5 rounded-lg text-sm font-bold transition-colors disabled:opacity-50"
                >
                  {isPending ? "Procesando..." : "Confirmar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL DE VENTA EXITOSA */}
      {successTxId && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#141414] border border-white/10 p-8 rounded-xl w-full max-w-sm shadow-2xl animate-in zoom-in-95 flex flex-col items-center text-center">
            <div className="w-16 h-16 bg-green-500/20 text-green-500 rounded-full flex items-center justify-center mb-4">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"></polyline></svg>
            </div>
            <h3 className="text-2xl font-serif text-sterling mb-2">¡Venta Exitosa!</h3>
            <p className="text-sm text-[#888] mb-6">La transacción se ha registrado correctamente.</p>
            <div className="flex flex-col gap-3 w-full">
              <button 
                onClick={() => window.open(`/pos/receipt/${successTxId}`, '_blank')}
                className="w-full bg-[#8B4513] hover:bg-[#A0522D] text-white py-3 rounded-lg text-sm font-bold transition-colors flex items-center justify-center gap-2 shadow-lg"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
                Imprimir Factura
              </button>
              <button 
                onClick={() => setSuccessTxId("")}
                className="w-full bg-white/5 hover:bg-white/10 text-sterling py-3 rounded-lg text-sm font-bold transition-colors"
              >
                Continuar
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
