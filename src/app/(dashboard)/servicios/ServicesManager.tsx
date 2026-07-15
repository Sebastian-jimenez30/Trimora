"use client"

import { useState, useTransition } from "react";
import { createServiceWithMaterials, updateServiceWithMaterials, deleteService, quickCreateProduct } from "@/modules/services/actions";

type Product = {
  id: string;
  name: string;
  currentStock: string;
};

type Material = {
  productId: string;
  quantityUsed: string | number;
  productName?: string | null;
};

type Service = {
  id: string;
  name: string;
  description: string | null;
  durationMinutes: number;
  price: string;
  isActive: boolean;
  materials: Material[];
};

type Props = {
  services: Service[];
  products: Product[];
};

export default function ServicesManager({ services, products: initialProducts }: Props) {
  const [products, setProducts] = useState(initialProducts);
  const [isPending, startTransition] = useTransition();

  // Modals state
  const [isServiceModalOpen, setIsServiceModalOpen] = useState(false);
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  
  // Current editing service
  const [editingId, setEditingId] = useState<string | null>(null);
  
  // Service Form State
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [duration, setDuration] = useState(30);
  const [price, setPrice] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [materials, setMaterials] = useState<Material[]>([]);

  // Product Form State (Quick create)
  const [prodName, setProdName] = useState("");
  const [prodCost, setProdCost] = useState("");
  const [prodStock, setProdStock] = useState("0");
  const [prodMinStock, setProdMinStock] = useState("0");
  const [prodMsg, setProdMsg] = useState({ text: "", type: "" });

  const openNewService = () => {
    setEditingId(null);
    setName("");
    setDescription("");
    setDuration(30);
    setPrice("");
    setIsActive(true);
    setMaterials([]);
    setIsServiceModalOpen(true);
  };

  const openEditService = (service: Service) => {
    setEditingId(service.id);
    setName(service.name);
    setDescription(service.description || "");
    setDuration(service.durationMinutes);
    setPrice(service.price.toString());
    setIsActive(service.isActive);
    setMaterials(service.materials.map(m => ({ productId: m.productId, quantityUsed: m.quantityUsed })));
    setIsServiceModalOpen(true);
  };

  const addMaterialRow = () => {
    setMaterials([...materials, { productId: "", quantityUsed: 1 }]);
  };

  const removeMaterialRow = (index: number) => {
    setMaterials(materials.filter((_, i) => i !== index));
  };

  const updateMaterial = (index: number, field: keyof Material, value: string) => {
    const newMats = [...materials];
    newMats[index] = { ...newMats[index], [field]: value };
    setMaterials(newMats);
  };

  const handleSaveService = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Filtrar filas vacías (donde no seleccionaron ningún producto)
    const validMaterials = materials.filter(m => m.productId);

    // Validar cantidades de los materiales que sí se seleccionaron
    if (validMaterials.some(m => Number(m.quantityUsed) <= 0)) {
      alert("Por favor, ingresa una cantidad válida mayor a 0 para los consumibles seleccionados.");
      return;
    }

    const formData = new FormData();
    formData.append("name", name);
    formData.append("description", description);
    formData.append("durationMinutes", duration.toString());
    formData.append("price", price);
    formData.append("isActive", isActive.toString());

    startTransition(async () => {
      let res;
      if (editingId) {
        res = await updateServiceWithMaterials(editingId, formData, validMaterials as any);
      } else {
        res = await createServiceWithMaterials(formData, validMaterials as any);
      }

      if (res.success) {
        setIsServiceModalOpen(false);
      } else {
        alert(res.error || "Error al guardar el servicio");
      }
    });
  };

  const handleDeleteService = (id: string) => {
    if (!confirm("¿Seguro que deseas eliminar este servicio de forma permanente?")) return;
    startTransition(async () => {
      await deleteService(id);
    });
  };

  const handleQuickCreateProduct = (e: React.FormEvent) => {
    e.preventDefault();
    const formData = new FormData();
    formData.append("name", prodName);
    formData.append("costPrice", prodCost);
    formData.append("currentStock", prodStock);
    formData.append("minimumStock", prodMinStock);

    setProdMsg({ text: "", type: "" });

    startTransition(async () => {
      const res = await quickCreateProduct(formData);
      if (res.success && res.data) {
        setProducts([...products, res.data as any]);
        setIsProductModalOpen(false);
        // Add it directly to materials if we want
        setMaterials([...materials, { productId: res.data.id, quantityUsed: 1 }]);
        setProdName(""); setProdCost(""); setProdStock("0"); setProdMinStock("0");
      } else {
        setProdMsg({ text: res.error || "Error al crear", type: "error" });
      }
    });
  };

  return (
    <div className="space-y-8">
      
      {/* Barra superior */}
      <div className="flex justify-end">
        <button 
          onClick={openNewService}
          className="bg-cognac hover:bg-cognac-hover text-white px-6 py-2.5 rounded-full font-medium transition-all shadow-[0_4px_15px_rgba(139,69,19,0.3)] active:scale-95 flex items-center gap-2"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
          Nuevo Servicio
        </button>
      </div>

      {/* Tabla de Servicios */}
      <div className="bg-midnight/90 rounded-2xl shadow-2xl border border-white/10 overflow-hidden">
        <div className="p-6 border-b border-white/10 bg-[#1a1a1a]">
          <h2 className="text-xl font-serif text-white">Catálogo de Servicios</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-pitch/50 border-b border-white/5 text-xs uppercase tracking-wider text-charcoal">
                <th className="p-4 font-semibold">Servicio</th>
                <th className="p-4 font-semibold">Precio</th>
                <th className="p-4 font-semibold">Duración</th>
                <th className="p-4 font-semibold">Consumibles</th>
                <th className="p-4 font-semibold">Estado</th>
                <th className="p-4 font-semibold text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-sm text-sterling">
              {services.map(srv => (
                <tr key={srv.id} className="hover:bg-white/5 transition-colors">
                  <td className="p-4">
                    <p className="font-semibold text-white">{srv.name}</p>
                    <p className="text-xs text-charcoal line-clamp-1">{srv.description}</p>
                  </td>
                  <td className="p-4 text-cognac font-medium">${Number(srv.price).toFixed(2)}</td>
                  <td className="p-4 text-sterling">{srv.durationMinutes} min</td>
                  <td className="p-4">
                    {srv.materials.length > 0 ? (
                      <span className="px-2 py-1 bg-white/5 text-xs rounded border border-white/10">
                        {srv.materials.length} productos
                      </span>
                    ) : (
                      <span className="text-xs text-charcoal">Ninguno</span>
                    )}
                  </td>
                  <td className="p-4">
                    {srv.isActive ? (
                      <span className="px-2.5 py-1 bg-green-500/10 text-green-400 rounded-full text-xs border border-green-500/20">Activo</span>
                    ) : (
                      <span className="px-2.5 py-1 bg-red-500/10 text-red-400 rounded-full text-xs border border-red-500/20">Inactivo</span>
                    )}
                  </td>
                  <td className="p-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button 
                        onClick={() => openEditService(srv)}
                        disabled={isPending}
                        className="text-sterling hover:text-white px-2 py-1 transition-colors disabled:opacity-50"
                      >
                        Editar
                      </button>
                      <button 
                        onClick={() => handleDeleteService(srv.id)}
                        disabled={isPending}
                        className="text-red-400 hover:text-red-300 px-2 py-1 transition-colors disabled:opacity-50"
                      >
                        Eliminar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {services.length === 0 && (
                <tr><td colSpan={6} className="p-8 text-center text-charcoal">No hay servicios registrados.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL PRINCIPAL: SERVICIO */}
      {isServiceModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
          <div className="bg-[#141414] border border-white/10 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden my-8">
            <div className="p-6 border-b border-white/10 flex justify-between items-center bg-[#1a1a1a] sticky top-0 z-10">
              <h3 className="text-xl font-serif text-white">{editingId ? "Editar Servicio" : "Nuevo Servicio"}</h3>
              <button onClick={() => setIsServiceModalOpen(false)} className="text-charcoal hover:text-white transition-colors">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            </div>
            
            <form onSubmit={handleSaveService} className="p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-sterling mb-1.5">Nombre del Servicio</label>
                  <input 
                    type="text" 
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ej. Corte Clásico"
                    className="w-full px-4 py-2.5 bg-pitch/80 border border-charcoal/30 rounded-xl focus:outline-none focus:border-cognac focus:ring-1 focus:ring-cognac text-white"
                    required
                  />
                </div>
                
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-sterling mb-1.5">Descripción (Opcional)</label>
                  <textarea 
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={2}
                    className="w-full px-4 py-2.5 bg-pitch/80 border border-charcoal/30 rounded-xl focus:outline-none focus:border-cognac focus:ring-1 focus:ring-cognac text-white resize-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-sterling mb-1.5">Precio ($)</label>
                  <input 
                    type="number" 
                    step="0.01"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    placeholder="25.00"
                    className="w-full px-4 py-2.5 bg-pitch/80 border border-charcoal/30 rounded-xl focus:outline-none focus:border-cognac focus:ring-1 focus:ring-cognac text-white"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-sterling mb-1.5">Duración</label>
                  <select 
                    value={duration}
                    onChange={(e) => setDuration(Number(e.target.value))}
                    className="w-full px-4 py-2.5 bg-pitch/80 border border-charcoal/30 rounded-xl focus:outline-none focus:border-cognac focus:ring-1 focus:ring-cognac text-white"
                  >
                    <option value={15}>15 minutos</option>
                    <option value={30}>30 minutos</option>
                    <option value={45}>45 minutos</option>
                    <option value={60}>1 hora</option>
                    <option value={90}>1.5 horas</option>
                    <option value={120}>2 horas</option>
                  </select>
                </div>
              </div>

              {/* MATERIALES CONSUMIBLES */}
              <div className="pt-4 border-t border-white/10">
                <div className="flex justify-between items-center mb-4">
                  <div>
                    <h4 className="text-white font-medium">Materiales Consumidos</h4>
                    <p className="text-xs text-charcoal">Inventario que se descuenta automáticamente por cita.</p>
                  </div>
                  <button 
                    type="button" 
                    onClick={addMaterialRow}
                    className="text-xs font-medium text-cognac hover:text-cognac-hover border border-cognac/30 px-3 py-1.5 rounded-lg flex items-center gap-1"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                    Añadir Consumible
                  </button>
                </div>

                <div className="space-y-3">
                  {materials.map((mat, index) => (
                    <div key={index} className="flex gap-3 items-start bg-white/5 p-3 rounded-xl border border-white/5">
                      <div className="flex-1">
                        <label className="block text-[10px] uppercase text-charcoal mb-1">Producto</label>
                        <select
                          value={mat.productId}
                          onChange={(e) => updateMaterial(index, 'productId', e.target.value)}
                          className="w-full px-3 py-2 bg-pitch border border-charcoal/30 rounded-lg text-sm text-white focus:border-cognac"
                          required
                        >
                          <option value="">Selecciona un producto...</option>
                          {products.map(p => (
                            <option key={p.id} value={p.id}>{p.name} (Stock: {Number(p.currentStock)})</option>
                          ))}
                        </select>
                      </div>
                      <div className="w-24 shrink-0">
                        <label className="block text-[10px] uppercase text-charcoal mb-1">Cantidad</label>
                        <input 
                          type="number"
                          step="0.01"
                          min="0.01"
                          value={mat.quantityUsed}
                          onChange={(e) => updateMaterial(index, 'quantityUsed', e.target.value)}
                          className="w-full px-3 py-2 bg-pitch border border-charcoal/30 rounded-lg text-sm text-white focus:border-cognac"
                          required
                        />
                      </div>
                      <button 
                        type="button" 
                        onClick={() => removeMaterialRow(index)}
                        className="mt-5 p-2 text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                      </button>
                    </div>
                  ))}
                  
                  {materials.length > 0 && (
                    <div className="mt-2 text-right">
                      <button 
                        type="button"
                        onClick={() => setIsProductModalOpen(true)}
                        className="text-xs text-blue-400 hover:text-blue-300 underline underline-offset-2"
                      >
                        ¿No encuentras el producto? Créalo rápidamente
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input 
                  type="checkbox" 
                  id="isActive" 
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-600 bg-pitch text-cognac focus:ring-cognac"
                />
                <label htmlFor="isActive" className="text-sm text-sterling">Servicio Activo (Visible para agendar)</label>
              </div>

              <div className="pt-4 flex justify-end gap-3 border-t border-white/10 mt-4">
                <button 
                  type="button" 
                  onClick={() => setIsServiceModalOpen(false)}
                  className="px-5 py-2.5 text-sterling hover:text-white font-medium"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  disabled={isPending}
                  className="px-6 py-2.5 bg-cognac hover:bg-cognac-hover text-white font-medium rounded-full shadow-lg transition-all active:scale-95 disabled:opacity-50"
                >
                  {isPending ? "Guardando..." : "Guardar Servicio"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL SECUNDARIO: CREACIÓN RÁPIDA DE PRODUCTO */}
      {isProductModalOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-[#1a1a1a] border border-white/10 rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-5 border-b border-white/10 flex justify-between items-center">
              <h3 className="text-lg font-serif text-white">Nuevo Consumible</h3>
              <button onClick={() => setIsProductModalOpen(false)} className="text-charcoal hover:text-white">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            </div>
            <form onSubmit={handleQuickCreateProduct} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-sterling mb-1">Nombre del Producto</label>
                <input 
                  type="text" 
                  value={prodName}
                  onChange={(e) => setProdName(e.target.value)}
                  className="w-full px-3 py-2 bg-pitch border border-charcoal/30 rounded-lg text-sm text-white focus:border-cognac"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-sterling mb-1">Costo Unit. ($)</label>
                  <input 
                    type="number" step="0.01" min="0"
                    value={prodCost}
                    onChange={(e) => setProdCost(e.target.value)}
                    className="w-full px-3 py-2 bg-pitch border border-charcoal/30 rounded-lg text-sm text-white focus:border-cognac"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-sterling mb-1">Stock Actual</label>
                  <input 
                    type="number" step="1" min="0"
                    value={prodStock}
                    onChange={(e) => setProdStock(e.target.value)}
                    className="w-full px-3 py-2 bg-pitch border border-charcoal/30 rounded-lg text-sm text-white focus:border-cognac"
                    required
                  />
                </div>
              </div>
              
              {prodMsg.text && (
                <p className={`text-xs ${prodMsg.type === 'error' ? 'text-red-400' : 'text-green-400'}`}>{prodMsg.text}</p>
              )}

              <div className="pt-2 flex justify-end gap-2">
                <button type="button" onClick={() => setIsProductModalOpen(false)} className="px-3 py-1.5 text-xs text-sterling hover:text-white">Cancelar</button>
                <button type="submit" disabled={isPending} className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded-full font-medium transition-colors disabled:opacity-50">
                  Crear y Usar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
