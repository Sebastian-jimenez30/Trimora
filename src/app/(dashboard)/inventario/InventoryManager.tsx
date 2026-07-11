"use client"

import { useState, useTransition } from "react";
import { createProduct, updateProduct, deleteProduct } from "@/modules/inventory/actions";

type ProductType = {
  id: string;
  name: string;
  description: string | null;
  category: string;
  currentStock: string;
  minimumStock: string;
  salePrice: string | null;
  costPrice: string | null;
  isActive: boolean;
};

export default function InventoryManager({ initialProducts }: { initialProducts: ProductType[] }) {
  const [searchTerm, setSearchTerm] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Estado para el ajuste rápido de stock (delta)
  const [deltas, setDeltas] = useState<Record<string, number>>({});
  const [confirmingProduct, setConfirmingProduct] = useState<ProductType | null>(null);

  const filteredProducts = initialProducts.filter(p => {
    const term = searchTerm.toLowerCase();
    return p.name.toLowerCase().includes(term) || p.category.toLowerCase().includes(term);
  });

  const getDelta = (p: ProductType) => {
    return deltas[p.id] || 0;
  };

  const handleAdjustDelta = (product: ProductType, amountChange: number) => {
    const currentDelta = getDelta(product);
    const newDelta = currentDelta + amountChange;
    const currentStock = parseFloat(product.currentStock);
    
    // No puede restar más del stock actual
    if (newDelta < -currentStock) return;
    
    setDeltas(prev => ({ ...prev, [product.id]: newDelta }));
  };

  const openCreateModal = () => {
    setIsModalOpen(true);
  };

  const closeCreateModal = () => {
    setIsModalOpen(false);
  };

  const closeConfirmModal = () => {
    setConfirmingProduct(null);
  };

  const handleCreateSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    
    startTransition(async () => {
      const result = await createProduct(formData);
      if (result.success) {
        closeCreateModal();
      } else {
        alert(result.error);
      }
    });
  };

  const handleUpdateStock = (product: ProductType, newStock: number) => {
    startTransition(async () => {
      const formData = new FormData();
      formData.append("name", product.name);
      formData.append("category", product.category);
      formData.append("currentStock", newStock.toString());
      formData.append("minimumStock", product.minimumStock);
      if (product.description) formData.append("description", product.description);
      if (product.salePrice) formData.append("salePrice", product.salePrice);
      if (product.costPrice) formData.append("costPrice", product.costPrice);

      const result = await updateProduct(product.id, formData);
      if (result.success) {
        setDeltas(prev => {
          const next = { ...prev };
          delete next[product.id];
          return next;
        });
        closeConfirmModal();
      } else {
        alert(result.error);
      }
    });
  };

  const handleDeleteProduct = (id: string) => {
    startTransition(async () => {
      const result = await deleteProduct(id);
      if (result.success) {
        setDeltas(prev => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
        closeConfirmModal();
      } else {
        alert(result.error);
      }
    });
  };

  return (
    <div className="flex flex-col gap-6 flex-1 h-full">
      {/* Barra superior con Buscador y Botón */}
      <div className="flex justify-between items-center bg-[#141414] p-4 rounded-xl border border-white/10">
        <div className="relative flex items-center">
          <svg className="w-4 h-4 absolute left-3 text-charcoal" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
          <input 
            type="text" 
            placeholder="Buscar por nombre o categoría..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="bg-pitch border border-white/10 text-sterling pl-10 pr-4 py-2 rounded-lg text-sm w-[350px] focus:outline-none focus:border-cognac transition-colors"
          />
        </div>
        <button 
          onClick={openCreateModal}
          className="bg-cognac hover:brightness-110 text-white px-5 py-2 rounded-lg text-sm font-medium transition-all"
        >
          + Nuevo Producto
        </button>
      </div>

      {/* Tabla de Inventario */}
      <div className="bg-[#141414] border border-white/10 rounded-xl overflow-hidden flex-1 overflow-y-auto">
        <table className="w-full text-left border-collapse">
          <thead className="sticky top-0 bg-[#141414] shadow-sm z-10">
            <tr className="border-b border-white/10 bg-white/5">
              <th className="py-4 px-6 text-xs text-charcoal font-medium uppercase tracking-wider">Producto</th>
              <th className="py-4 px-6 text-xs text-charcoal font-medium uppercase tracking-wider">Categoría</th>
              <th className="py-4 px-6 text-xs text-charcoal font-medium uppercase tracking-wider">Stock Actual</th>
              <th className="py-4 px-6 text-xs text-charcoal font-medium uppercase tracking-wider">Precios (Costo / Venta)</th>
              <th className="py-4 px-6 text-xs text-charcoal font-medium uppercase tracking-wider text-right">Ajuste Rápido</th>
            </tr>
          </thead>
          <tbody>
            {filteredProducts.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-10 text-center text-charcoal text-sm">
                  No se encontraron productos en el inventario.
                </td>
              </tr>
            ) : (
              filteredProducts.map(product => {
                const delta = getDelta(product);
                const current = parseFloat(product.currentStock);
                const min = parseFloat(product.minimumStock);
                const isLowStock = current <= min;

                return (
                  <tr key={product.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                    <td className="py-4 px-6">
                      <div className="text-sm font-medium text-sterling">{product.name}</div>
                      {product.description && <div className="text-xs text-charcoal mt-1 line-clamp-1">{product.description}</div>}
                    </td>
                    <td className="py-4 px-6">
                      <span className={`px-2 py-1 rounded text-[10px] uppercase font-bold tracking-wider ${
                        product.category === 'VENTA' ? 'bg-blue-900/30 text-blue-400' : 'bg-purple-900/30 text-purple-400'
                      }`}>
                        {product.category}
                      </span>
                    </td>
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-bold ${isLowStock ? 'text-red-400' : 'text-sterling'}`}>
                          {product.currentStock}
                        </span>
                        <span className="text-xs text-charcoal">/ {product.minimumStock} min</span>
                        {isLowStock && (
                          <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse ml-1" title="Stock bajo"></div>
                        )}
                      </div>
                    </td>
                    <td className="py-4 px-6">
                      <div className="text-sm text-sterling">V: ${product.salePrice || "0.00"}</div>
                      <div className="text-xs text-charcoal">C: ${product.costPrice || "0.00"}</div>
                    </td>
                    <td className="py-4 px-6 text-right">
                      <div className="flex items-center justify-end gap-3">
                        <div className="flex items-center bg-pitch border border-white/10 rounded-lg overflow-hidden">
                          <button 
                            onClick={() => handleAdjustDelta(product, -1)} 
                            disabled={delta <= -current}
                            className="px-3 py-1.5 text-sterling hover:bg-white/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            -
                          </button>
                          <span className={`w-12 text-center text-sm font-medium ${delta > 0 ? 'text-green-400' : delta < 0 ? 'text-red-400' : 'text-sterling'}`}>
                            {delta > 0 ? `+${delta}` : delta}
                          </span>
                          <button 
                            onClick={() => handleAdjustDelta(product, 1)} 
                            className="px-3 py-1.5 text-sterling hover:bg-white/10 transition-colors"
                          >
                            +
                          </button>
                        </div>
                        <button 
                          onClick={() => setConfirmingProduct(product)}
                          disabled={delta === 0}
                          className="bg-cognac text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:brightness-110 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Actualizar
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Modal Confirmación Ajuste de Stock */}
      {confirmingProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-[#141414] border border-white/10 w-full max-w-md rounded-xl shadow-2xl p-7 animate-in zoom-in-95 duration-200">
            <h3 className="text-xl font-serif text-sterling mb-4">Confirmar Ajuste</h3>
            
            {(() => {
              const currentStock = parseFloat(confirmingProduct.currentStock);
              const delta = getDelta(confirmingProduct);
              const newStock = currentStock + delta;

              if (newStock === 0) {
                return (
                  <div className="flex flex-col gap-4">
                    <p className="text-sm text-charcoal">
                      El stock de <strong className="text-sterling">{confirmingProduct.name}</strong> llegará a 0.
                    </p>
                    <p className="text-sm text-charcoal">
                      ¿Deseas mantenerlo en el catálogo con stock 0, o prefieres eliminar el producto definitivamente del sistema?
                    </p>
                    
                    <div className="flex flex-col gap-3 mt-4">
                      <button 
                        onClick={() => handleUpdateStock(confirmingProduct, 0)} 
                        disabled={isPending}
                        className="bg-cognac hover:brightness-110 text-white px-5 py-2.5 rounded-lg text-sm font-medium transition-all"
                      >
                        {isPending ? "Guardando..." : "Mantener en 0"}
                      </button>
                      <button 
                        onClick={() => handleDeleteProduct(confirmingProduct.id)} 
                        disabled={isPending}
                        className="bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20 px-5 py-2.5 rounded-lg text-sm font-medium transition-all"
                      >
                        Eliminar Producto Definitivamente
                      </button>
                      <button 
                        onClick={closeConfirmModal} 
                        disabled={isPending}
                        className="mt-2 text-charcoal hover:text-sterling text-sm transition-colors"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                );
              }

              return (
                <div className="flex flex-col gap-4">
                  <p className="text-sm text-charcoal">
                    Estás a punto de actualizar el stock de <strong className="text-sterling">{confirmingProduct.name}</strong>.
                  </p>
                  <div className="flex items-center justify-between bg-white/5 p-4 rounded-lg">
                    <div className="text-center">
                      <p className="text-xs text-charcoal mb-1">Stock Actual</p>
                      <p className="text-lg text-sterling font-bold">{currentStock}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-charcoal mb-1">Ajuste</p>
                      <p className={`text-lg font-bold ${delta > 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {delta > 0 ? `+${delta}` : delta}
                      </p>
                    </div>
                    <div className="text-charcoal">→</div>
                    <div className="text-center">
                      <p className="text-xs text-charcoal mb-1">Nuevo Stock</p>
                      <p className="text-lg text-cognac font-bold">{newStock}</p>
                    </div>
                  </div>
                  
                  <div className="flex justify-end gap-3 mt-4">
                    <button onClick={closeConfirmModal} className="px-5 py-2 text-sm text-sterling hover:bg-white/5 rounded-lg transition-colors font-medium">
                      Cancelar
                    </button>
                    <button 
                      onClick={() => handleUpdateStock(confirmingProduct, newStock)} 
                      disabled={isPending}
                      className="bg-cognac hover:brightness-110 text-white px-5 py-2.5 rounded-lg text-sm font-medium transition-all"
                    >
                      {isPending ? "Guardando..." : "Confirmar Ajuste"}
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* Modal Nuevo Producto */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-[#141414] border border-white/10 w-full max-w-lg rounded-xl shadow-2xl p-7 animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-serif text-sterling">Nuevo Producto</h3>
              <button type="button" onClick={closeCreateModal} className="text-charcoal hover:text-white transition-colors bg-white/5 w-8 h-8 rounded-full flex items-center justify-center">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="flex flex-col gap-5">
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5 col-span-2">
                  <label className="text-xs text-charcoal uppercase tracking-wider">Nombre del Producto *</label>
                  <input type="text" name="name" required className="bg-pitch border border-white/10 text-sterling px-3 py-2.5 rounded-lg text-sm focus:outline-none focus:border-cognac" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-charcoal uppercase tracking-wider">Categoría *</label>
                  <select name="category" required defaultValue="VENTA" className="bg-pitch border border-white/10 text-sterling px-3 py-2.5 rounded-lg text-sm focus:outline-none focus:border-cognac">
                    <option value="VENTA">Producto para Venta</option>
                    <option value="CONSUMO">Material de Consumo interno</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-charcoal uppercase tracking-wider">Stock Inicial *</label>
                  <input type="number" step="0.01" name="currentStock" required defaultValue="0" className="bg-pitch border border-white/10 text-sterling px-3 py-2.5 rounded-lg text-sm focus:outline-none focus:border-cognac" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-charcoal uppercase tracking-wider">Stock Mínimo (Alerta) *</label>
                  <input type="number" step="0.01" name="minimumStock" required defaultValue="0" className="bg-pitch border border-white/10 text-sterling px-3 py-2.5 rounded-lg text-sm focus:outline-none focus:border-cognac" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-charcoal uppercase tracking-wider">Precio de Costo</label>
                  <input type="number" step="0.01" name="costPrice" className="bg-pitch border border-white/10 text-sterling px-3 py-2.5 rounded-lg text-sm focus:outline-none focus:border-cognac" placeholder="Ej: 15.00" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-charcoal uppercase tracking-wider">Precio de Venta</label>
                  <input type="number" step="0.01" name="salePrice" className="bg-pitch border border-white/10 text-sterling px-3 py-2.5 rounded-lg text-sm focus:outline-none focus:border-cognac" placeholder="Ej: 30.00" />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-charcoal uppercase tracking-wider">Descripción Breve</label>
                <textarea name="description" rows={2} className="bg-pitch border border-white/10 text-sterling px-3 py-2.5 rounded-lg text-sm focus:outline-none focus:border-cognac resize-none"></textarea>
              </div>

              <div className="flex justify-end gap-3 mt-2 border-t border-white/10 pt-5">
                <button type="button" onClick={closeCreateModal} className="px-5 py-2.5 text-sm text-sterling hover:bg-white/5 rounded-lg transition-colors font-medium">
                  Cancelar
                </button>
                <button type="submit" disabled={isPending} className="bg-cognac hover:brightness-110 text-white px-6 py-2.5 rounded-lg text-sm font-medium transition-all disabled:opacity-50 flex items-center gap-2">
                  {isPending && <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>}
                  {isPending ? "Guardando..." : "Crear Producto"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
