"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import { toast } from "react-hot-toast";
import { batchImportProducts } from "@/modules/inventory/actions";
import { batchImportServices } from "@/modules/services/actions";

type ImportExportModalProps = {
  entityType: "products" | "services";
};

export default function ImportExportModal({ entityType }: ImportExportModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [step, setStep] = useState<"upload" | "preview">("upload");
  const [previewData, setPreviewData] = useState<any[]>([]);
  const router = useRouter();

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError("");
    setIsLoading(true);

    try {
      const isImage = file.type.startsWith("image/");
      let payloadData: string = "";

      if (isImage) {
        // Convert image to Base64
        payloadData = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.readAsDataURL(file);
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = (error) => reject(error);
        });
      } else {
        // Parse Excel/CSV
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: "array" });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const json = XLSX.utils.sheet_to_json(worksheet);
        payloadData = JSON.stringify(json);
      }

      // Send to API
      const res = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entityType,
          data: payloadData,
          isImage,
        }),
      });

      const result = await res.json();

      if (result.success) {
        toast.success("Análisis completado. Por favor revisa los datos.");
        setPreviewData(result.data);
        setStep("preview");
      } else {
        setError(result.error || "Hubo un error importando los datos.");
      }
    } catch (err: any) {
      setError(err.message || "Error procesando el archivo.");
    } finally {
      setIsLoading(false);
      // reset file input
      if (e.target) e.target.value = '';
    }
  };

  const handleFieldChange = (index: number, field: string, value: string | number) => {
    const newData = [...previewData];
    newData[index] = { ...newData[index], [field]: value };
    setPreviewData(newData);
  };

  const handleSavePreview = async () => {
    setIsLoading(true);
    try {
      let res;
      if (entityType === "products") {
        res = await batchImportProducts(previewData);
      } else {
        res = await batchImportServices(previewData);
      }

      if (res.success) {
        toast.success("¡Importación completada!");
        setIsOpen(false);
        setStep("upload");
      } else {
        toast.error(res.error || "Error al guardar los datos");
      }
    } catch (err: any) {
      toast.error(err.message || "Error inesperado");
    } finally {
      setIsLoading(false);
    }
  };

  const handleExport = () => {
    toast("Función de exportación en desarrollo.", { icon: "🚧" });
  };

  return (
    <>
      <div className="flex gap-2">
        <button
          onClick={() => handleExport()}
          className="bg-white/5 border border-white/10 text-sterling px-4 py-2 rounded-lg text-sm hover:bg-white/10 transition-colors flex items-center gap-2"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
          Exportar
        </button>
        <button
          onClick={() => setIsOpen(true)}
          className="bg-cognac hover:brightness-110 text-white border border-cognac/50 px-4 py-2 rounded-lg text-sm transition-all flex items-center gap-2 shadow-[0_0_15px_rgba(139,69,19,0.3)]"
        >
          <span className="text-lg leading-none">✨</span>
          Importar con IA
        </button>
      </div>

      {isOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-[#141414] border border-white/10 w-full max-w-5xl rounded-xl shadow-2xl p-6 animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-6 border-b border-white/10 pb-4">
              <h3 className="text-xl font-serif text-sterling flex items-center gap-2">
                <span className="text-cognac">✨</span> Importación IA
              </h3>
              <button
                type="button"
                onClick={() => {
                  if (!isLoading) {
                    setIsOpen(false);
                    setStep("upload");
                  }
                }}
                className="text-charcoal hover:text-white transition-colors"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            </div>

            {step === "upload" ? (
              <div className="flex flex-col gap-4">
                <p className="text-sm text-[#888]">
                  Sube un archivo <strong>Excel, CSV</strong>, o una <strong>Fotografía</strong> (ej. lista de precios, menú). La Inteligencia Artificial extraerá, corregirá y mapeará la información automáticamente hacia tu base de datos.
                </p>

                {error && (
                  <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded-lg text-sm">
                    {error}
                  </div>
                )}

                <div className="relative border-2 border-dashed border-white/20 rounded-xl p-8 text-center hover:bg-white/5 transition-colors group cursor-pointer">
                  <input
                    type="file"
                    accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel, image/png, image/jpeg, image/jpg"
                    onChange={handleFileChange}
                    disabled={isLoading}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                  />
                  <div className="flex flex-col items-center gap-3">
                    {isLoading ? (
                      <>
                        <div className="w-10 h-10 border-4 border-cognac border-t-transparent rounded-full animate-spin"></div>
                        <span className="text-sm font-medium text-cognac animate-pulse">
                          La IA está analizando e importando...
                        </span>
                      </>
                    ) : (
                      <>
                        <div className="w-12 h-12 bg-white/5 rounded-full flex items-center justify-center text-charcoal group-hover:text-sterling group-hover:scale-110 transition-all">
                          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
                        </div>
                        <span className="text-sm font-medium text-sterling">
                          Haz clic o arrastra aquí tu archivo
                        </span>
                        <span className="text-xs text-charcoal">
                          Soporta: .xlsx, .csv, .jpg, .png
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                <p className="text-sm text-sterling">
                  Por favor aprueba los siguientes {previewData.length} registros generados por la IA:
                </p>
                <div className="overflow-x-auto max-h-[50vh] border border-white/10 rounded-lg">
                  <table className="w-full text-left text-sm text-sterling">
                    <thead className="bg-white/5 text-xs uppercase sticky top-0 z-10 backdrop-blur-md">
                      <tr>
                        <th className="px-4 py-3">Nombre</th>
                        {entityType === "products" ? (
                          <>
                            <th className="px-4 py-3 w-32">Categoría</th>
                            <th className="px-4 py-3 w-24">Precio (V)</th>
                            <th className="px-4 py-3 w-24">Stock</th>
                          </>
                        ) : (
                          <>
                            <th className="px-4 py-3 w-24">Duración</th>
                            <th className="px-4 py-3 w-24">Precio</th>
                          </>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {previewData.map((item, idx) => (
                        <tr key={idx} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                          <td className="px-4 py-2">
                            <input 
                              type="text" 
                              value={item.name || ""} 
                              onChange={(e) => handleFieldChange(idx, "name", e.target.value)}
                              className="w-full bg-white/5 border border-white/10 focus:bg-white/10 focus:ring-1 focus:ring-cognac rounded px-2 py-1 outline-none transition-colors" 
                            />
                          </td>
                          {entityType === "products" ? (
                            <>
                              <td className="px-4 py-2">
                                <select 
                                  value={item.category || "VENTA"} 
                                  onChange={(e) => handleFieldChange(idx, "category", e.target.value)}
                                  className="w-full bg-white/5 border border-white/10 focus:bg-white/10 focus:ring-1 focus:ring-cognac rounded px-2 py-1 outline-none text-sterling transition-colors"
                                >
                                  <option value="VENTA" className="text-black bg-white">VENTA</option>
                                  <option value="CONSUMO" className="text-black bg-white">CONSUMO</option>
                                </select>
                              </td>
                              <td className="px-4 py-2">
                                <input 
                                  type="number" 
                                  value={item.salePrice || 0} 
                                  onChange={(e) => handleFieldChange(idx, "salePrice", parseFloat(e.target.value))}
                                  className="w-full bg-white/5 border border-white/10 focus:bg-white/10 focus:ring-1 focus:ring-cognac rounded px-2 py-1 outline-none transition-colors" 
                                />
                              </td>
                              <td className="px-4 py-2">
                                <input 
                                  type="number" 
                                  value={item.currentStock || 0} 
                                  onChange={(e) => handleFieldChange(idx, "currentStock", parseFloat(e.target.value))}
                                  className="w-full bg-white/5 border border-white/10 focus:bg-white/10 focus:ring-1 focus:ring-cognac rounded px-2 py-1 outline-none transition-colors" 
                                />
                              </td>
                            </>
                          ) : (
                            <>
                              <td className="px-4 py-2">
                                <input 
                                  type="number" 
                                  value={item.durationMinutes || 30} 
                                  onChange={(e) => handleFieldChange(idx, "durationMinutes", parseInt(e.target.value))}
                                  className="w-full bg-white/5 border border-white/10 focus:bg-white/10 focus:ring-1 focus:ring-cognac rounded px-2 py-1 outline-none transition-colors" 
                                />
                              </td>
                              <td className="px-4 py-2">
                                <input 
                                  type="number" 
                                  value={item.price || 0} 
                                  onChange={(e) => handleFieldChange(idx, "price", parseFloat(e.target.value))}
                                  className="w-full bg-white/5 border border-white/10 focus:bg-white/10 focus:ring-1 focus:ring-cognac rounded px-2 py-1 outline-none transition-colors" 
                                />
                              </td>
                            </>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                
                <div className="flex gap-2 justify-end mt-2">
                  <button
                    onClick={() => setStep("upload")}
                    disabled={isLoading}
                    className="px-4 py-2 text-sm text-sterling hover:text-white"
                  >
                    Volver
                  </button>
                  <button
                    onClick={handleSavePreview}
                    disabled={isLoading}
                    className="bg-cognac hover:brightness-110 text-white px-4 py-2 rounded-lg text-sm transition-colors flex items-center gap-2 disabled:opacity-50"
                  >
                    {isLoading ? "Guardando..." : "Aprobar e Insertar"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
