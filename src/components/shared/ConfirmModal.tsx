"use client";

type Props = {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  isLoading?: boolean;
};

export default function ConfirmModal({ isOpen, title, message, onConfirm, onCancel, isLoading }: Props) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-[#141414] border border-white/10 rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="p-5 border-b border-white/10">
          <h3 className="text-lg font-serif text-white">{title}</h3>
        </div>
        <div className="p-5">
          <p className="text-sm text-sterling mb-6">{message}</p>
          <div className="flex justify-end gap-3">
            <button 
              onClick={onCancel}
              disabled={isLoading}
              className="px-4 py-2 text-sm text-sterling hover:text-white transition-colors"
            >
              Cancelar
            </button>
            <button 
              onClick={onConfirm}
              disabled={isLoading}
              className="px-4 py-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 text-sm rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              {isLoading ? "Procesando..." : "Confirmar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
