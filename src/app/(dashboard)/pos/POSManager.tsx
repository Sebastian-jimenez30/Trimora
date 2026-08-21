"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import {
  processSale,
  registerExpense,
  registerPayment,
  registerClientPayment,
  exportFinancialReport,
  updateTransaction,
  deleteTransaction,
} from "@/modules/pos/actions";
import type { CartItem } from "@/modules/pos/actions";
import { useSearchParams, useRouter } from "next/navigation";
import { toast } from "react-hot-toast";
import Dialog from "@/components/shared/Dialog";
import type {
  HistoryRange,
  POSActiveTab,
  POSHistoryEntry,
  POSManagerProps,
  POSProduct,
  POSReceivable,
  POSReceivableMovement,
  POSService,
} from "@/modules/pos/ui/types";

type CreditPaymentMode = "PAID" | "PARTIAL";

type ReceivableConcept = {
  key: string;
  transactionId: string;
  transactionItemId: string | null;
  name: string;
  itemType: "SERVICE" | "PRODUCT" | "LEGACY";
  quantity: string;
  subtotal: string;
  paidAmount: string;
  remaining: number;
  allocationStatus: "EXACT" | "LEGACY_ESTIMATED";
};

function getReceivableConcepts(receivable: POSReceivable): ReceivableConcept[] {
  return receivable.movements.flatMap((movement) => {
    const pendingItems: ReceivableConcept[] = movement.itemDetails
      .filter((item) => item.remaining > 0)
      .map((item) => ({
        key: `${movement.transactionId}:${item.id}`,
        transactionId: movement.transactionId,
        transactionItemId: item.id,
        name: item.name,
        itemType: item.itemType,
        quantity: item.quantity,
        subtotal: item.subtotal,
        paidAmount: item.paidAmount,
        remaining: item.remaining,
        allocationStatus: movement.allocationStatus,
      }));

    const detailedRemaining = pendingItems.reduce((sum, item) => sum + item.remaining, 0);
    const residual = Math.max(0, movement.remaining - detailedRemaining);
    if (residual > 0.005) {
      pendingItems.push({
        key: `${movement.transactionId}:legacy-balance`,
        transactionId: movement.transactionId,
        transactionItemId: null,
        name: "Saldo anterior",
        itemType: "LEGACY",
        quantity: "1",
        subtotal: residual.toFixed(2),
        paidAmount: "0.00",
        remaining: residual,
        allocationStatus: "LEGACY_ESTIMATED",
      });
    }

    return pendingItems;
  });
}

export default function POSManager({
  services,
  products,
  clients,
  staff,
  history,
  receivables,
  historyRange,
  historyStart,
  historyEnd,
  pendingAppointments,
}: POSManagerProps) {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<POSActiveTab>("VENTA");
  const [isServicesOpen, setIsServicesOpen] = useState(true);
  const [isProductsOpen, setIsProductsOpen] = useState(true);
  const [isCartOpenMobile, setIsCartOpenMobile] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);

  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [clientSearch, setClientSearch] = useState("");
  const [isClientPickerOpen, setIsClientPickerOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<string>("CASH");
  const [currentAppointmentId, setCurrentAppointmentId] = useState<string>("");

  const [creditPaidAmounts, setCreditPaidAmounts] = useState<Record<string, string>>({});
  const [creditPaymentModes, setCreditPaymentModes] = useState<Record<string, CreditPaymentMode>>(
    {},
  );
  const [initialPaymentMethod, setInitialPaymentMethod] = useState<string>("CASH");
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [selectedTxId, setSelectedTxId] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentRemaining, setPaymentRemaining] = useState("");
  const [paymentMethodForMovement, setPaymentMethodForMovement] = useState("CASH");
  const [paymentMovement, setPaymentMovement] = useState<POSReceivableMovement | null>(null);
  const [selectedPaymentItemId, setSelectedPaymentItemId] = useState<string | null>(null);
  const [paymentTargetName, setPaymentTargetName] = useState("");
  const [paymentItemAmounts, setPaymentItemAmounts] = useState<Record<string, string>>({});
  const [successTxId, setSuccessTxId] = useState("");
  const [selectedTransaction, setSelectedTransaction] = useState<POSHistoryEntry | null>(null);
  const [editingTransaction, setEditingTransaction] = useState<POSHistoryEntry | null>(null);
  const [selectedReceivable, setSelectedReceivable] = useState<POSReceivable | null>(null);
  const [receivableToPay, setReceivableToPay] = useState<POSReceivable | null>(null);
  const [receivablePaymentAmount, setReceivablePaymentAmount] = useState("");
  const [receivablePaymentMethod, setReceivablePaymentMethod] = useState("CASH");

  const [isExporting, setIsExporting] = useState(false);
  const [exportRangeType, setExportRangeType] = useState<HistoryRange>(historyRange);
  const [customStartDate, setCustomStartDate] = useState(historyStart);
  const [customEndDate, setCustomEndDate] = useState(historyEnd);

  const [isPending, startTransition] = useTransition();

  // Cargar una cita al POS
  const loadAppointment = useCallback(
    (appointmentId: string) => {
      if (!pendingAppointments) return;
      const app = pendingAppointments.find((appointment) => appointment.id === appointmentId);
      if (!app) return;

      setSelectedClientId(app.clientId);
      setClientSearch(`${app.clientName || ""} ${app.clientLastName || ""}`.trim());
      setCurrentAppointmentId(app.id);

      const service = services.find((candidate) => candidate.id === app.serviceId);
      if (service) {
        setCart([
          {
            id: service.id,
            type: "SERVICE",
            name: service.name,
            price: parseFloat(service.price),
            quantity: 1,
            staffId: app.staffId,
          },
        ]);
      }
    },
    [pendingAppointments, services],
  );

  useEffect(() => {
    const urlAppId = searchParams?.get("appointmentId");
    if (urlAppId) {
      setTimeout(() => {
        loadAppointment(urlAppId);
        router.replace("/pos");
      }, 0);
    }

    const tab = searchParams?.get("tab");
    if (tab === "HISTORY" || tab === "VENTA" || tab === "RECEIVABLES" || tab === "COMPRA") {
      setTimeout(() => {
        setActiveTab(tab);
      }, 0);
    }

    const receivableClientId = searchParams?.get("clientId");
    if (tab === "RECEIVABLES" && receivableClientId) {
      const account = receivables.find((receivable) => receivable.clientId === receivableClientId);
      if (account)
        setTimeout(() => {
          setSelectedReceivable(account);
          router.replace("/pos?tab=RECEIVABLES");
        }, 0);
    }

    const payTx = searchParams?.get("payTx");
    const payAmountParam = searchParams?.get("payAmount");
    if (payTx && payAmountParam) {
      setTimeout(() => {
        setSelectedTxId(payTx);
        setPaymentAmount(payAmountParam);
        setPaymentRemaining(payAmountParam);
        setIsPaymentModalOpen(true);
        router.replace("/pos");
      }, 0);
    }
  }, [searchParams, loadAppointment, receivables, router]);

  // Helper para añadir al carrito
  const addToCart = (item: POSService | POSProduct, type: "SERVICE" | "PRODUCT") => {
    const product = type === "PRODUCT" ? (item as POSProduct) : null;
    const service = type === "SERVICE" ? (item as POSService) : null;
    if (product && parseFloat(product.currentStock) <= 0) {
      toast.error("No puedes agregar este producto. Stock agotado (0).");
      return;
    }

    setCart((prev) => {
      const existing = prev.find((i) => i.id === item.id);
      if (existing) {
        if (product && existing.quantity >= parseFloat(product.currentStock)) {
          toast.error("No puedes agregar más unidades de las disponibles en stock.");
          return prev;
        }
        return prev.map((i) => (i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i));
      }
      return [
        ...prev,
        {
          id: item.id,
          type,
          name: item.name,
          price: parseFloat(service ? service.price : product?.salePrice || "0"),
          quantity: 1,
          staffId: type === "SERVICE" && staff.length > 0 ? staff[0].id : undefined,
        },
      ];
    });
  };

  const updateCartQty = (id: string, delta: number) => {
    setCart((prev) => {
      return prev.map((i) => {
        if (i.id === id) {
          const newQty = i.quantity + delta;
          // Validación de stock para productos
          if (i.type === "PRODUCT" && delta > 0) {
            const product = products.find((p) => p.id === id);
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
    setCart((prev) => prev.map((i) => (i.id === id ? { ...i, staffId } : i)));
  };

  const removeFromCart = (id: string) => {
    setCart((prev) => prev.filter((i) => i.id !== id));
  };

  const cartTotal = cart.reduce((acc, item) => acc + item.price * item.quantity, 0);
  const cartCount = cart.reduce((acc, item) => acc + item.quantity, 0);
  const filteredClients = clients.filter((client) =>
    `${client.firstName} ${client.lastName || ""}`
      .toLowerCase()
      .includes(clientSearch.trim().toLowerCase()),
  );
  const selectedReceivableConcepts = selectedReceivable
    ? getReceivableConcepts(selectedReceivable)
    : [];

  const handleCheckout = () => {
    if (cart.length === 0) return;
    if (paymentMethod === "CREDIT" && !selectedClientId) {
      toast.error("Debe seleccionar un cliente para fiados.");
      return;
    }
    if (paymentMethod === "CREDIT") {
      const invalidPartial = cart.find((item) => {
        const key = `${item.type}:${item.id}`;
        if (creditPaymentModes[key] !== "PARTIAL") return false;
        const amount = Number(creditPaidAmounts[key]);
        return !Number.isFinite(amount) || amount <= 0 || amount >= item.price * item.quantity;
      });
      if (invalidPartial) {
        toast.error(`Ingrese un abono parcial válido para ${invalidPartial.name}.`);
        return;
      }
    }
    const itemizedCart = cart.map((item) => ({
      ...item,
      paidAmount:
        paymentMethod === "CREDIT"
          ? creditPaymentModes[`${item.type}:${item.id}`] === "PAID"
            ? item.price * item.quantity
            : creditPaymentModes[`${item.type}:${item.id}`] === "PARTIAL"
              ? Math.min(
                  item.price * item.quantity,
                  Math.max(0, Number(creditPaidAmounts[`${item.type}:${item.id}`]) || 0),
                )
              : 0
          : undefined,
    }));
    const parsedInitialPaid = itemizedCart.reduce(
      (sum, item) => sum + (item.paidAmount ?? item.price * item.quantity),
      0,
    );

    startTransition(async () => {
      const result = await processSale(
        itemizedCart,
        selectedClientId || null,
        paymentMethod,
        currentAppointmentId || undefined,
        parsedInitialPaid,
        initialPaymentMethod,
      );
      if (result.success && result.transactionId) {
        setCart([]);
        setSelectedClientId("");
        setClientSearch("");
        setCurrentAppointmentId("");
        setCreditPaidAmounts({});
        setCreditPaymentModes({});
        setSuccessTxId(result.transactionId); // Abrir modal de éxito
        toast.success("Cobro registrado correctamente");
      } else {
        toast.error(result.error || "Error al procesar la venta");
      }
    });
  };

  const handlePayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTxId) return;
    const movementAllocations = paymentMovement
      ? paymentMovement.itemDetails.flatMap((item) => {
          const amount = Number(paymentItemAmounts[item.id]);
          return Number.isFinite(amount) && amount > 0
            ? [{ transactionItemId: item.id, amount }]
            : [];
        })
      : [];
    const amount =
      movementAllocations.length > 0
        ? movementAllocations.reduce((sum, allocation) => sum + allocation.amount, 0)
        : parseFloat(paymentAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("Distribuya un monto mayor a cero.");
      return;
    }
    const allocations =
      movementAllocations.length > 0
        ? movementAllocations
        : selectedPaymentItemId
          ? [{ transactionItemId: selectedPaymentItemId, amount }]
          : [];

    startTransition(async () => {
      const result = await registerPayment(
        selectedTxId,
        amount,
        paymentMethodForMovement,
        allocations.length > 0 ? allocations : undefined,
      );
      if (result.success) {
        setIsPaymentModalOpen(false);
        setSelectedTxId("");
        setPaymentAmount("");
        setPaymentRemaining("");
        setPaymentMovement(null);
        setSelectedPaymentItemId(null);
        setPaymentTargetName("");
        setPaymentItemAmounts({});
        toast.success("Abono registrado");
      } else {
        toast.error(result.error || "Error al registrar el abono");
      }
    });
  };

  const openReceivablePayment = (receivable: POSReceivable) => {
    setSelectedReceivable(null);
    setReceivableToPay(receivable);
    setReceivablePaymentAmount(receivable.totalDebt);
    setReceivablePaymentMethod("CASH");
  };

  const openMovementPayment = (movement: POSReceivableMovement, payInFull: boolean) => {
    const amount = movement.remaining.toFixed(2);
    setSelectedReceivable(null);
    setSelectedTxId(movement.transactionId);
    setPaymentMovement(movement);
    setSelectedPaymentItemId(null);
    setPaymentTargetName(movement.description);
    setPaymentItemAmounts(
      payInFull
        ? Object.fromEntries(
            movement.itemDetails
              .filter((item) => item.remaining > 0)
              .map((item) => [item.id, item.remaining.toFixed(2)]),
          )
        : {},
    );
    setPaymentAmount(payInFull ? amount : "");
    setPaymentRemaining(amount);
    setPaymentMethodForMovement("CASH");
    setIsPaymentModalOpen(true);
  };

  const openConceptPayment = (concept: ReceivableConcept, payInFull: boolean) => {
    setSelectedReceivable(null);
    setSelectedTxId(concept.transactionId);
    setPaymentMovement(null);
    setSelectedPaymentItemId(concept.transactionItemId);
    setPaymentTargetName(concept.name);
    setPaymentItemAmounts({});
    setPaymentAmount(payInFull ? concept.remaining.toFixed(2) : "");
    setPaymentRemaining(concept.remaining.toFixed(2));
    setPaymentMethodForMovement("CASH");
    setIsPaymentModalOpen(true);
  };

  const closePaymentModal = () => {
    setIsPaymentModalOpen(false);
    setSelectedTxId("");
    setPaymentAmount("");
    setPaymentRemaining("");
    setPaymentMovement(null);
    setSelectedPaymentItemId(null);
    setPaymentTargetName("");
    setPaymentItemAmounts({});
  };

  const openHistoryMovementPayment = (transaction: POSHistoryEntry, payInFull: boolean) => {
    const remaining = Math.max(
      0,
      Number(transaction.originalTotalAmount) - Number(transaction.paidAmount),
    );
    openMovementPayment(
      {
        transactionId: transaction.transactionId,
        createdAt: transaction.createdAt,
        description: transaction.description,
        totalAmount: transaction.originalTotalAmount,
        paidAmount: transaction.paidAmount,
        remaining,
        itemDetails: transaction.itemDetails,
        allocationStatus: transaction.allocationStatus,
      },
      payInFull,
    );
  };

  const handleReceivablePayment = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!receivableToPay) return;

    const amount = Number(receivablePaymentAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("Ingrese un monto válido.");
      return;
    }
    if (amount > Number(receivableToPay.totalDebt)) {
      toast.error("El abono no puede superar la deuda total del cliente.");
      return;
    }

    startTransition(async () => {
      const result = await registerClientPayment(
        receivableToPay.clientId,
        amount,
        receivablePaymentMethod,
      );
      if (result.success) {
        setReceivableToPay(null);
        setReceivablePaymentAmount("");
        toast.success(
          amount >= Number(receivableToPay.totalDebt)
            ? "Cuenta pagada completamente"
            : "Abono registrado",
        );
      } else {
        toast.error(result.error || "Error al registrar el abono");
      }
    });
  };

  const handleExport = async () => {
    setIsExporting(true);
    let start = new Date();
    let end = new Date();

    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);

    if (exportRangeType === "MONTH") {
      start.setDate(1);
    } else if (exportRangeType === "WEEK") {
      const day = start.getDay();
      const diff = start.getDate() - day + (day === 0 ? -6 : 1);
      start.setDate(diff);
    } else if (exportRangeType === "YEAR") {
      start.setMonth(0, 1);
    } else if (exportRangeType === "HISTORIC") {
      start = new Date(0);
    } else if (exportRangeType === "CUSTOM") {
      if (!customStartDate || !customEndDate) {
        toast.error("Seleccione ambas fechas para el rango personalizado.");
        setIsExporting(false);
        return;
      }
      start = new Date(customStartDate + "T00:00:00");
      end = new Date(customEndDate + "T23:59:59.999");
    }

    const result = await exportFinancialReport(start.toISOString(), end.toISOString());
    setIsExporting(false);
    if (result.success && result.csv) {
      const blob = new Blob([result.csv], { type: "text/csv" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `reporte_financiero_${start.toLocaleDateString().replace(/\//g, "-")}_al_${end.toLocaleDateString().replace(/\//g, "-")}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
    } else {
      toast.error(result.error || "Error exportando el reporte");
    }
  };

  const applyHistoryFilter = (
    range: HistoryRange,
    startDate = customStartDate,
    endDate = customEndDate,
  ) => {
    if (range === "CUSTOM" && (!startDate || !endDate)) {
      toast.error("Seleccione ambas fechas para filtrar el historial.");
      return;
    }

    const params = new URLSearchParams(searchParams?.toString() || "");
    params.set("tab", "HISTORY");
    params.set("historyRange", range);
    if (range === "CUSTOM") {
      params.set("historyStart", startDate);
      params.set("historyEnd", endDate);
    } else {
      params.delete("historyStart");
      params.delete("historyEnd");
    }
    router.replace(`/pos?${params.toString()}`);
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

  const handleUpdateTransaction = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editingTransaction) return;

    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await updateTransaction(
        editingTransaction.transactionId || editingTransaction.id,
        formData,
      );
      if (result.success) {
        setEditingTransaction(null);
        toast.success("Movimiento actualizado");
      } else {
        toast.error(result.error || "Error al actualizar el movimiento");
      }
    });
  };

  const handleDeleteTransaction = () => {
    if (
      !editingTransaction ||
      !window.confirm(
        "¿Eliminar este movimiento? Esta acción también revertirá el inventario asociado a la venta.",
      )
    )
      return;

    startTransition(async () => {
      const result = await deleteTransaction(
        editingTransaction.transactionId || editingTransaction.id,
      );
      if (result.success) {
        setEditingTransaction(null);
        toast.success("Movimiento eliminado");
      } else {
        toast.error(result.error || "Error al eliminar el movimiento");
      }
    });
  };

  // Filtrado
  const filteredServices = services.filter((s) =>
    s.name.toLowerCase().includes(searchTerm.toLowerCase()),
  );
  const filteredProducts = products.filter(
    (p) => p.name.toLowerCase().includes(searchTerm.toLowerCase()) && p.category !== "CONSUMO",
  );

  return (
    <div className="flex h-full bg-[#0f0f0f] relative overflow-hidden">
      {/* Contenido Principal (Izquierda) */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Topbar */}
        <header className="border-b border-white/10 flex flex-col lg:flex-row items-start lg:items-center justify-between px-4 lg:px-8 bg-pitch shrink-0 gap-4 lg:gap-0 pt-4 lg:pt-0 min-h-[70px]">
          <div className="flex gap-6 overflow-x-auto whitespace-nowrap w-full lg:w-auto scrollbar-hide pb-0 lg:pb-0">
            {(["VENTA", "RECEIVABLES", "COMPRA", "HISTORY"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`text-sm font-semibold transition-colors pb-[23px] pt-[23px] border-b-2 ${
                  activeTab === tab
                    ? "text-sterling border-[#8B4513]"
                    : "text-[#888] border-transparent hover:text-[#ccc]"
                }`}
              >
                {tab === "VENTA"
                  ? "Venta"
                  : tab === "RECEIVABLES"
                    ? "Por cobrar"
                    : tab === "COMPRA"
                      ? "Compra (Gastos)"
                      : "Historial"}
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
              {pendingAppointments && pendingAppointments.length > 0 && (
                <div className="bg-[#141414] border border-[#8B4513]/50 p-5 rounded-xl shadow-[0_0_15px_rgba(139,69,19,0.1)] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-serif text-[#8B4513] font-bold mb-1">
                      Citas Pendientes de Cobro
                    </h3>
                    <p className="text-xs text-charcoal">
                      Selecciona una cita para registrar el pago.
                    </p>
                  </div>
                  <select
                    value={currentAppointmentId}
                    onChange={(e) => {
                      if (e.target.value) loadAppointment(e.target.value);
                      else setCurrentAppointmentId("");
                    }}
                    className="bg-pitch border border-[#8B4513]/50 text-sterling px-4 py-3 rounded-lg text-sm focus:outline-none focus:border-[#8B4513] min-w-[250px]"
                  >
                    <option value="">(Seleccionar Cita)</option>
                    {pendingAppointments?.map((app) => (
                      <option key={app.id} value={app.id}>
                        {app.clientName} {app.clientLastName} - {app.serviceName}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* SERVICIOS */}
              <div className="flex flex-col gap-4">
                <button
                  onClick={() => setIsServicesOpen(!isServicesOpen)}
                  className="flex items-center justify-between text-lg font-serif text-sterling bg-[#141414] border border-white/10 px-5 py-3 rounded-xl hover:bg-white/5 transition-colors"
                >
                  <span>Servicios</span>
                  <svg
                    className={`w-5 h-5 transition-transform ${isServicesOpen ? "rotate-180" : ""}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M19 9l-7 7-7-7"
                    ></path>
                  </svg>
                </button>

                {isServicesOpen && (
                  <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 lg:gap-5">
                    {filteredServices.map((srv) => {
                      const cartItem = cart.find((i) => i.id === srv.id);
                      return (
                        <div
                          key={srv.id}
                          className={`relative bg-[#141414] border rounded-xl p-5 transition-all flex flex-col items-center text-center select-none ${
                            cartItem
                              ? "border-[#8B4513] shadow-[0_0_15px_rgba(139,69,19,0.2)]"
                              : "border-white/10 hover:-translate-y-1 hover:border-[#8B4513] hover:shadow-lg cursor-pointer"
                          }`}
                          onClick={() => !cartItem && addToCart(srv, "SERVICE")}
                        >
                          {/* Controles de Tarjeta (Aparece cuando está en el carrito) */}
                          {cartItem && (
                            <div
                              className="absolute top-2 right-2 flex bg-pitch border border-[#8B4513]/50 rounded-lg overflow-hidden items-center shadow-lg z-10"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <button
                                onClick={() => removeFromCart(srv.id)}
                                className="px-2 py-1.5 text-red-400 hover:bg-white/10 transition-colors border-r border-[#8B4513]/30"
                                title="Eliminar del carrito"
                              >
                                <svg
                                  width="14"
                                  height="14"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                >
                                  <polyline points="3 6 5 6 21 6"></polyline>
                                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                </svg>
                              </button>
                              <button
                                onClick={() => updateCartQty(srv.id, -1)}
                                className="px-2.5 py-1 text-sterling hover:bg-white/10 transition-colors"
                              >
                                -
                              </button>
                              <span className="w-6 text-center text-xs font-bold text-[#8B4513]">
                                {cartItem.quantity}
                              </span>
                              <button
                                onClick={() => updateCartQty(srv.id, 1)}
                                className="px-2.5 py-1 text-sterling hover:bg-white/10 transition-colors border-l border-[#8B4513]/30"
                              >
                                +
                              </button>
                            </div>
                          )}

                          <div className="w-[60px] h-[60px] rounded-full bg-[#2C2C2C] text-[#8B4513] flex items-center justify-center mb-4 mt-2">
                            <svg
                              width="24"
                              height="24"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                            >
                              <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                              <polyline points="14 2 14 8 20 8" />
                            </svg>
                          </div>
                          <h4 className="text-sm font-semibold text-sterling mb-1">{srv.name}</h4>
                          <p className="text-lg text-[#D89A66] font-bold">${srv.price}</p>
                          <span className="text-[10px] text-[#888] mt-2">
                            {srv.durationMinutes} min
                          </span>
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
                  <svg
                    className={`w-5 h-5 transition-transform ${isProductsOpen ? "rotate-180" : ""}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M19 9l-7 7-7-7"
                    ></path>
                  </svg>
                </button>

                {isProductsOpen && (
                  <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 lg:gap-5">
                    {filteredProducts.map((prd) => {
                      const isOutOfStock = parseFloat(prd.currentStock) <= 0;
                      const cartItem = cart.find((i) => i.id === prd.id);

                      return (
                        <div
                          key={prd.id}
                          className={`relative bg-[#141414] border rounded-xl p-5 transition-all flex flex-col items-center text-center select-none ${
                            isOutOfStock
                              ? "opacity-50 border-white/10 cursor-not-allowed grayscale"
                              : cartItem
                                ? "border-blue-500/50 shadow-[0_0_15px_rgba(59,130,246,0.15)]"
                                : "border-white/10 hover:-translate-y-1 hover:border-blue-500/50 hover:shadow-lg cursor-pointer"
                          }`}
                          onClick={() => !isOutOfStock && !cartItem && addToCart(prd, "PRODUCT")}
                        >
                          {/* Controles de Tarjeta */}
                          {cartItem && (
                            <div
                              className="absolute top-2 right-2 flex bg-pitch border border-blue-500/30 rounded-lg overflow-hidden items-center shadow-lg z-10"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <button
                                onClick={() => removeFromCart(prd.id)}
                                className="px-2 py-1.5 text-red-400 hover:bg-white/10 transition-colors border-r border-blue-500/30"
                              >
                                <svg
                                  width="14"
                                  height="14"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                >
                                  <polyline points="3 6 5 6 21 6"></polyline>
                                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                </svg>
                              </button>
                              <button
                                onClick={() => updateCartQty(prd.id, -1)}
                                className="px-2.5 py-1 text-sterling hover:bg-white/10 transition-colors"
                              >
                                -
                              </button>
                              <span className="w-6 text-center text-xs font-bold text-blue-400">
                                {cartItem.quantity}
                              </span>
                              <button
                                onClick={() => updateCartQty(prd.id, 1)}
                                className={`px-2.5 py-1 text-sterling transition-colors border-l border-blue-500/30 ${cartItem.quantity >= parseFloat(prd.currentStock) ? "opacity-30 cursor-not-allowed" : "hover:bg-white/10"}`}
                                disabled={cartItem.quantity >= parseFloat(prd.currentStock)}
                              >
                                +
                              </button>
                            </div>
                          )}

                          <div className="w-[60px] h-[60px] rounded-full bg-[#2C2C2C] text-blue-400 flex items-center justify-center mb-4 mt-2">
                            <svg
                              width="24"
                              height="24"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                            >
                              <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
                              <line x1="3" y1="6" x2="21" y2="6" />
                              <path d="M16 10a4 4 0 0 1-8 0" />
                            </svg>
                          </div>
                          <h4 className="text-sm font-semibold text-sterling mb-1">{prd.name}</h4>
                          <p className="text-lg text-blue-400 font-bold">${prd.salePrice}</p>
                          <span
                            className={`text-[10px] font-bold mt-2 ${isOutOfStock ? "text-red-500" : "text-[#888]"}`}
                          >
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

          {/* CUENTAS POR COBRAR AGRUPADAS POR CLIENTE */}
          {activeTab === "RECEIVABLES" && (
            <div className="bg-[#141414] border border-white/10 rounded-xl overflow-hidden max-w-5xl">
              <div className="p-5 border-b border-white/10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <h3 className="font-serif text-lg text-sterling">Cuentas por cobrar</h3>
                  <p className="text-xs text-charcoal mt-1">
                    Cada cliente tiene una sola cuenta, aunque tenga varias ventas pendientes.
                  </p>
                </div>
                <div className="text-left sm:text-right">
                  <p className="text-[10px] uppercase tracking-wider text-charcoal">
                    Saldo total pendiente
                  </p>
                  <p className="text-xl font-bold text-orange-400">
                    $
                    {receivables
                      .reduce((total, account) => total + Number(account.totalDebt), 0)
                      .toFixed(2)}
                  </p>
                </div>
              </div>

              {receivables.length === 0 ? (
                <div className="py-14 px-5 text-center">
                  <p className="text-sm text-sterling">No hay cuentas pendientes por cobrar.</p>
                  <p className="text-xs text-charcoal mt-1">
                    Las nuevas ventas fiadas aparecerán aquí agrupadas por cliente.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-white/5">
                  {receivables.map((receivable) => (
                    <div
                      key={receivable.clientId}
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedReceivable(receivable)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ")
                          setSelectedReceivable(receivable);
                      }}
                      className="p-5 flex flex-col lg:flex-row lg:items-center gap-4 hover:bg-white/5 cursor-pointer transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <h4 className="text-sm font-bold text-sterling truncate">
                          {receivable.clientName}
                        </h4>
                        <p className="text-xs text-charcoal mt-1">
                          {getReceivableConcepts(receivable).length}{" "}
                          {getReceivableConcepts(receivable).length === 1
                            ? "concepto pendiente"
                            : "conceptos pendientes"}{" "}
                          · Ver detalle
                        </p>
                      </div>
                      <div className="lg:text-right lg:min-w-[130px]">
                        <p className="text-[10px] uppercase tracking-wider text-charcoal">
                          Deuda acumulada
                        </p>
                        <p className="text-lg font-bold text-orange-400">${receivable.totalDebt}</p>
                      </div>
                      <div
                        className="flex flex-wrap gap-2 lg:min-w-[170px] lg:justify-end"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={() => openReceivablePayment(receivable)}
                          className="bg-orange-500 hover:bg-orange-400 text-white px-3 py-2 rounded-lg text-xs font-bold transition-colors"
                        >
                          Pagar toda la deuda
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* HISTORIAL */}
          {activeTab === "HISTORY" && (
            <div className="bg-[#141414] border border-white/10 rounded-xl overflow-hidden max-w-5xl">
              <div className="p-5 border-b border-white/10 flex flex-col xl:flex-row xl:justify-between xl:items-center gap-4">
                <div>
                  <h3 className="font-serif text-lg text-sterling">Historial de Caja</h3>
                  <p className="text-xs text-charcoal mt-1">
                    El período seleccionado filtra la lista y también se usa al exportar.
                  </p>
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  <select
                    value={exportRangeType}
                    onChange={(e) => {
                      const range = e.target.value as HistoryRange;
                      setExportRangeType(range);
                      if (range !== "CUSTOM") applyHistoryFilter(range);
                    }}
                    className="bg-pitch border border-white/10 text-sterling px-3 py-1.5 rounded-lg text-xs focus:outline-none focus:border-[#8B4513]"
                  >
                    <option value="DAY">Hoy</option>
                    <option value="WEEK">Esta Semana</option>
                    <option value="MONTH">Este Mes</option>
                    <option value="YEAR">Este Año</option>
                    <option value="CUSTOM">Personalizado</option>
                    <option value="HISTORIC">Histórico</option>
                  </select>

                  {exportRangeType === "CUSTOM" && (
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        type="date"
                        value={customStartDate}
                        onChange={(e) => setCustomStartDate(e.target.value)}
                        className="bg-pitch border border-white/10 text-sterling px-2 py-1 rounded text-xs focus:outline-none"
                      />
                      <span className="text-[#888] text-xs">al</span>
                      <input
                        type="date"
                        value={customEndDate}
                        onChange={(e) => setCustomEndDate(e.target.value)}
                        className="bg-pitch border border-white/10 text-sterling px-2 py-1 rounded text-xs focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => applyHistoryFilter("CUSTOM")}
                        className="bg-[#8B4513]/20 border border-[#8B4513]/50 hover:bg-[#8B4513]/30 text-[#c98a64] px-3 py-1.5 rounded text-xs font-bold transition-colors"
                      >
                        Aplicar
                      </button>
                    </div>
                  )}

                  <button
                    onClick={handleExport}
                    disabled={isExporting}
                    className="bg-[#1a1a1a] border border-white/10 hover:bg-white/5 text-[#888] hover:text-white px-4 py-2 rounded-lg text-xs font-bold transition-colors disabled:opacity-50 flex items-center gap-2"
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                      <polyline points="7 10 12 15 17 10"></polyline>
                      <line x1="12" y1="15" x2="12" y2="3"></line>
                    </svg>
                    {isExporting ? "Exportando..." : "Exportar CSV"}
                  </button>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] table-fixed text-left border-collapse whitespace-nowrap">
                  <colgroup>
                    <col className="w-[15%]" />
                    <col className="w-[10%]" />
                    <col className="w-[24%]" />
                    <col className="w-[14%]" />
                    <col className="w-[13%]" />
                    <col className="w-[11%]" />
                    <col className="w-[13%]" />
                  </colgroup>
                  <thead>
                    <tr>
                      <th className="py-3 px-5 text-xs text-[#888] font-medium border-b border-white/10">
                        Fecha / Hora
                      </th>
                      <th className="py-3 px-5 text-xs text-[#888] font-medium border-b border-white/10">
                        Tipo
                      </th>
                      <th className="py-3 px-5 text-xs text-[#888] font-medium border-b border-white/10">
                        Descripción
                      </th>
                      <th className="py-3 px-5 text-xs text-[#888] font-medium border-b border-white/10">
                        Cliente
                      </th>
                      <th className="py-3 px-5 text-xs text-[#888] font-medium border-b border-white/10">
                        Estado
                      </th>
                      <th className="py-3 px-5 text-xs text-[#888] font-medium border-b border-white/10 text-right">
                        Monto
                      </th>
                      <th className="py-3 px-5 text-xs text-[#888] font-medium border-b border-white/10 text-center">
                        Acciones
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((tx) => {
                      const isPending = tx.status === "PENDING";
                      const remaining = isPending
                        ? (parseFloat(tx.totalAmount) - parseFloat(tx.paidAmount || "0")).toFixed(2)
                        : "0.00";
                      return (
                        <tr
                          key={tx.id}
                          onClick={() => setSelectedTransaction(tx)}
                          className={`group cursor-pointer hover:bg-white/5 border-b border-white/5 transition-colors ${isPending ? "bg-[#8B4513]/10" : ""}`}
                        >
                          <td className="py-3 px-5 text-sm text-sterling">
                            {new Date(tx.createdAt).toLocaleDateString()}{" "}
                            {new Date(tx.createdAt).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </td>
                          <td className="py-3 px-5">
                            <span
                              className={`px-2 py-1 rounded text-[10px] uppercase font-bold tracking-wider ${
                                tx.type === "INCOME"
                                  ? "bg-green-900/30 text-green-500"
                                  : "bg-red-900/30 text-red-500"
                              }`}
                            >
                              {tx.movementKind === "PAYMENT"
                                ? "ABONO"
                                : tx.movementKind === "PENDING"
                                  ? "POR COBRAR"
                                  : tx.type === "INCOME"
                                    ? "VENTA"
                                    : "GASTO"}
                            </span>
                          </td>
                          <td className="py-3 px-5 text-sm text-sterling overflow-hidden">
                            <div className="flex min-w-0 items-center gap-2">
                              <span
                                className="block min-w-0 flex-1 truncate"
                                title={tx.description}
                              >
                                {tx.description}
                              </span>
                              {tx.canEdit ? (
                                <button
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    setEditingTransaction(tx);
                                  }}
                                  className="shrink-0 p-1.5 text-charcoal hover:text-white transition-colors bg-white/5 hover:bg-white/10 rounded"
                                  title="Editar movimiento"
                                  aria-label="Editar movimiento"
                                >
                                  <svg
                                    width="14"
                                    height="14"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  >
                                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                                  </svg>
                                </button>
                              ) : (
                                <span className="w-[26px] shrink-0" aria-hidden="true" />
                              )}
                            </div>
                          </td>
                          <td
                            className="py-3 px-5 text-sm text-[#888] truncate"
                            title={tx.clientName}
                          >
                            {tx.clientName}
                          </td>
                          <td className="py-3 px-5">
                            {isPending ? (
                              <div className="flex flex-col">
                                <span className="text-orange-400 font-bold text-xs uppercase tracking-wider">
                                  Pendiente
                                </span>
                                <span className="text-[10px] text-orange-400/70">
                                  Debe: ${remaining}
                                </span>
                              </div>
                            ) : (
                              <span className="text-green-500 font-bold text-xs uppercase tracking-wider">
                                Completado
                              </span>
                            )}
                          </td>
                          <td
                            className={`py-3 px-5 text-sm font-bold text-right ${tx.type === "INCOME" ? "text-green-500" : "text-red-500"}`}
                          >
                            {tx.type === "INCOME" ? "+" : "-"}${tx.totalAmount}
                          </td>
                          <td className="py-3 px-3 min-w-[140px]">
                            <div className="grid grid-cols-[36px_1fr] items-center gap-2">
                              <div className="flex justify-center">
                                {tx.type === "INCOME" && (
                                  <button
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      window.open(
                                        `/pos/receipt/${tx.transactionId || tx.id}`,
                                        "_blank",
                                      );
                                    }}
                                    className="bg-white/5 hover:bg-white/10 text-sterling p-2 rounded transition-colors"
                                    title="Imprimir factura"
                                    aria-label="Imprimir factura"
                                  >
                                    <svg
                                      width="14"
                                      height="14"
                                      viewBox="0 0 24 24"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="2"
                                    >
                                      <polyline points="6 9 6 2 18 2 18 9"></polyline>
                                      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path>
                                      <rect x="6" y="14" width="12" height="8"></rect>
                                    </svg>
                                  </button>
                                )}
                              </div>
                              <div className="flex justify-start">
                                {isPending && (
                                  <button
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      openHistoryMovementPayment(tx, false);
                                    }}
                                    className="bg-orange-500/20 hover:bg-orange-500/40 border border-orange-500/50 text-orange-400 px-3 py-1.5 rounded text-xs transition-colors font-bold"
                                    title="Abonar"
                                  >
                                    Abonar
                                  </button>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {history.length === 0 && (
                      <tr>
                        <td colSpan={7} className="py-10 text-center text-[#888] text-sm">
                          No hay transacciones en el período seleccionado.
                        </td>
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
                <p className="text-sm text-[#888] mb-6">
                  Salida de dinero de la caja para insumos, recibos o emergencias.
                </p>

                <form onSubmit={handleExpenseSubmit} className="flex flex-col gap-5">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs text-charcoal uppercase tracking-wider">
                      Descripción del Gasto *
                    </label>
                    <input
                      type="text"
                      name="description"
                      required
                      placeholder="Ej. Pago de Luz"
                      className="bg-pitch border border-white/10 text-sterling px-4 py-3 rounded-lg text-sm focus:outline-none focus:border-red-500"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs text-charcoal uppercase tracking-wider">
                      Monto Total ($) *
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      name="amount"
                      required
                      placeholder="0.00"
                      className="bg-pitch border border-white/10 text-sterling px-4 py-3 rounded-lg text-sm focus:outline-none focus:border-red-500"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs text-charcoal uppercase tracking-wider">
                      Método de Pago
                    </label>
                    <select
                      name="paymentMethod"
                      className="bg-pitch border border-white/10 text-sterling px-4 py-3 rounded-lg text-sm focus:outline-none focus:border-red-500"
                    >
                      <option value="CASH">Efectivo (Caja)</option>
                      <option value="TRANSFER">Transferencia (Banco)</option>
                      <option value="CARD">Tarjeta</option>
                    </select>
                  </div>
                  <button
                    type="submit"
                    disabled={isPending}
                    className="bg-red-900/80 hover:bg-red-800 text-white w-full py-3 rounded-lg text-sm font-bold transition-colors mt-2"
                  >
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
        <div
          className={`w-full lg:w-[420px] bg-[#101010] border-l border-white/10 flex-col h-full z-20 animate-in slide-in-from-right duration-300 absolute lg:relative right-0 shadow-[-10px_0_20px_rgba(0,0,0,0.5)] lg:shadow-none ${isCartOpenMobile ? "flex" : "hidden lg:flex"}`}
        >
          <div className="p-5 border-b border-white/10 bg-[#141414] flex justify-between items-center shrink-0">
            <div>
              <h2 className="text-xl font-serif text-sterling">Ticket de Venta</h2>
              <p className="text-[10px] text-charcoal uppercase tracking-wider mt-1">
                {cartCount} {cartCount === 1 ? "ítem" : "ítems"}
              </p>
            </div>
            {/* Botón solo visible en móviles para ocultar el carrito si se desea seguir agregando */}
            <button
              onClick={() => setIsCartOpenMobile(false)}
              className="lg:hidden text-charcoal hover:text-white"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-5">
            <div className="flex flex-col gap-2 relative">
              <label
                htmlFor="checkout-client"
                className="text-xs text-charcoal uppercase tracking-wider"
              >
                Cliente (Opcional)
              </label>
              <div className="relative">
                <input
                  id="checkout-client"
                  type="text"
                  role="combobox"
                  aria-expanded={isClientPickerOpen}
                  aria-controls="checkout-client-options"
                  aria-autocomplete="list"
                  value={clientSearch}
                  placeholder="Cliente General o buscar cliente..."
                  onFocus={() => setIsClientPickerOpen(true)}
                  onBlur={() => setTimeout(() => setIsClientPickerOpen(false), 150)}
                  onChange={(event) => {
                    setClientSearch(event.target.value);
                    setSelectedClientId("");
                    setCurrentAppointmentId("");
                    setIsClientPickerOpen(true);
                  }}
                  className="bg-pitch border border-white/10 text-sterling px-3 py-2.5 pr-9 rounded-lg text-sm focus:outline-none focus:border-[#8B4513] w-full"
                />
                <button
                  type="button"
                  aria-label="Mostrar clientes"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => setIsClientPickerOpen((open) => !open)}
                  className="absolute inset-y-0 right-0 px-3 text-charcoal hover:text-sterling"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>
              </div>
              {isClientPickerOpen && (
                <div
                  id="checkout-client-options"
                  role="listbox"
                  className="absolute z-40 top-full left-0 right-0 mt-1 max-h-56 overflow-y-auto rounded-lg border border-white/10 bg-[#181818] shadow-2xl"
                >
                  <button
                    type="button"
                    role="option"
                    aria-selected={!selectedClientId}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => {
                      setSelectedClientId("");
                      setClientSearch("");
                      setCurrentAppointmentId("");
                      setIsClientPickerOpen(false);
                    }}
                    className="block w-full px-3 py-2.5 text-left text-sm text-sterling hover:bg-white/10"
                  >
                    Cliente General
                  </button>
                  {filteredClients.map((client) => {
                    const name = `${client.firstName} ${client.lastName || ""}`.trim();
                    return (
                      <button
                        key={client.id}
                        type="button"
                        role="option"
                        aria-selected={selectedClientId === client.id}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => {
                          setSelectedClientId(client.id);
                          setClientSearch(name);
                          setCurrentAppointmentId("");
                          setIsClientPickerOpen(false);
                        }}
                        className="block w-full px-3 py-2.5 text-left text-sm text-sterling hover:bg-white/10"
                      >
                        {name}
                      </button>
                    );
                  })}
                  {filteredClients.length === 0 && (
                    <p className="px-3 py-3 text-sm text-charcoal">No se encontraron clientes.</p>
                  )}
                </div>
              )}
            </div>

            <div className="border-t border-white/5 pt-4 flex-1">
              <h3 className="text-xs text-charcoal uppercase tracking-wider mb-3">Detalle</h3>
              <div className="flex flex-col gap-3">
                {cart.map((item) => (
                  <div key={item.id} className="flex flex-col bg-white/5 rounded-lg p-3">
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex-1 pr-2">
                        <h4 className="text-sm font-bold text-sterling leading-tight">
                          {item.name}
                        </h4>
                        <span className="text-[10px] text-[#888]">
                          ${item.price.toFixed(2)} c/u
                        </span>
                      </div>
                      <span className="text-sm font-bold text-sterling">
                        ${(item.price * item.quantity).toFixed(2)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between mt-1">
                      {item.type === "SERVICE" ? (
                        <select
                          value={item.staffId}
                          onChange={(e) => updateCartStaff(item.id, e.target.value)}
                          className="bg-pitch border border-white/10 text-[#888] px-2 py-1 rounded text-[10px] focus:outline-none w-[120px]"
                        >
                          {staff.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <div className="w-[120px]"></div>
                      )}

                      <div className="flex items-center bg-pitch border border-white/10 rounded-md">
                        <button
                          onClick={() => removeFromCart(item.id)}
                          className="px-2 py-1 text-red-400 hover:text-red-300 border-r border-white/10"
                        >
                          <svg
                            width="12"
                            height="12"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                          </svg>
                        </button>
                        <button
                          onClick={() => updateCartQty(item.id, -1)}
                          className="px-2 py-1 text-[#888] hover:text-white"
                        >
                          -
                        </button>
                        <span className="text-xs font-bold text-sterling w-5 text-center">
                          {item.quantity}
                        </span>
                        <button
                          onClick={() => updateCartQty(item.id, 1)}
                          className="px-2 py-1 text-[#888] hover:text-white"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="border-t border-white/5 pt-4">
              <h3 className="text-xs text-charcoal uppercase tracking-wider mb-2">
                Método de Pago
              </h3>
              <div className="grid grid-cols-4 gap-2">
                {(["CASH", "CARD", "TRANSFER", "CREDIT"] as const).map((method) => (
                  <button
                    key={method}
                    onClick={() => setPaymentMethod(method)}
                    className={`py-2 text-[10px] font-medium rounded-lg border transition-all ${
                      paymentMethod === method
                        ? "bg-[#8B4513]/20 border-[#8B4513] text-white"
                        : "bg-pitch border-white/10 text-[#888] hover:border-white/30"
                    }`}
                  >
                    {method === "CASH"
                      ? "Efectivo"
                      : method === "CARD"
                        ? "Tarjeta"
                        : method === "TRANSFER"
                          ? "Transferencia"
                          : "Fiado"}
                  </button>
                ))}
              </div>

              {paymentMethod === "CREDIT" && (
                <div className="mt-4 p-3 bg-white/5 rounded-lg border border-orange-500/30 animate-in fade-in slide-in-from-top-2">
                  <p className="text-xs text-orange-400 font-bold mb-1">
                    Pago y fiado por concepto
                  </p>
                  <p className="text-[10px] text-charcoal mb-3">
                    Marca Pago si recibe el valor completo o Abono para escribir cuánto recibe. La
                    parte restante quedará por cobrar; sin seleccionar una opción, el concepto se
                    fiará completo.
                  </p>
                  <div className="space-y-3">
                    {cart.map((item) => {
                      const key = `${item.type}:${item.id}`;
                      const subtotal = item.price * item.quantity;
                      const mode = creditPaymentModes[key];
                      const isPaid = mode === "PAID";
                      const isPartial = mode === "PARTIAL";
                      const paidNow = isPaid
                        ? subtotal
                        : isPartial
                          ? Math.min(subtotal, Math.max(0, Number(creditPaidAmounts[key]) || 0))
                          : 0;
                      return (
                        <div
                          key={key}
                          className={`rounded-lg border p-3 transition-colors ${
                            isPaid
                              ? "border-emerald-500/30 bg-emerald-500/[0.06]"
                              : "border-white/10 bg-pitch"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className={`min-w-0 ${isPaid ? "opacity-60" : ""}`}>
                              <p className="truncate text-xs font-semibold text-sterling">
                                {item.name}
                              </p>
                              <p className="text-[10px] text-charcoal">
                                Total: ${subtotal.toFixed(2)}
                              </p>
                            </div>
                            <p
                              className={`shrink-0 text-[10px] font-bold ${
                                isPaid ? "text-emerald-400" : "text-orange-400"
                              }`}
                            >
                              {isPaid
                                ? "Pago completo"
                                : `Debe $${(subtotal - paidNow).toFixed(2)}`}
                            </p>
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              aria-pressed={isPaid}
                              onClick={() =>
                                setCreditPaymentModes((current) => ({ ...current, [key]: "PAID" }))
                              }
                              className={`rounded-lg border px-3 py-2 text-[10px] font-bold transition-colors ${
                                isPaid
                                  ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-400"
                                  : "border-white/10 text-[#aaa] hover:bg-white/5"
                              }`}
                            >
                              Pago
                            </button>
                            <button
                              type="button"
                              aria-pressed={isPartial}
                              onClick={() =>
                                setCreditPaymentModes((current) => ({
                                  ...current,
                                  [key]: "PARTIAL",
                                }))
                              }
                              className={`rounded-lg border px-3 py-2 text-[10px] font-bold transition-colors ${
                                isPartial
                                  ? "border-orange-500/50 bg-orange-500/10 text-orange-400"
                                  : "border-white/10 text-[#aaa] hover:bg-white/5"
                              }`}
                            >
                              Abono
                            </button>
                            {isPartial && (
                              <input
                                aria-label={`Abono inicial de ${item.name}`}
                                type="number"
                                min="0"
                                max={subtotal.toFixed(2)}
                                step="0.01"
                                value={creditPaidAmounts[key] ?? ""}
                                placeholder="Monto abonado"
                                onChange={(event) =>
                                  setCreditPaidAmounts((current) => ({
                                    ...current,
                                    [key]: event.target.value,
                                  }))
                                }
                                className="min-w-[130px] flex-1 rounded-lg border border-white/10 bg-[#111] px-3 py-2 text-xs text-sterling focus:border-orange-500 focus:outline-none"
                              />
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-3 border-t border-white/10 pt-3">
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-charcoal">
                        Recibido ahora
                      </p>
                      <p className="text-sm font-bold text-emerald-400">
                        $
                        {cart
                          .reduce((sum, item) => {
                            if (creditPaymentModes[`${item.type}:${item.id}`] === "PAID") {
                              return sum + item.price * item.quantity;
                            }
                            if (creditPaymentModes[`${item.type}:${item.id}`] !== "PARTIAL") {
                              return sum;
                            }
                            const value = Number(creditPaidAmounts[`${item.type}:${item.id}`]);
                            return (
                              sum +
                              Math.min(
                                item.price * item.quantity,
                                Number.isFinite(value) ? Math.max(0, value) : 0,
                              )
                            );
                          }, 0)
                          .toFixed(2)}
                      </p>
                    </div>
                    <select
                      aria-label="Método del pago inicial"
                      value={initialPaymentMethod}
                      onChange={(event) => setInitialPaymentMethod(event.target.value)}
                      className="w-[125px] rounded-lg border border-white/10 bg-pitch px-2 py-2 text-xs text-[#aaa] focus:outline-none"
                    >
                      <option value="CASH">Efectivo</option>
                      <option value="CARD">Tarjeta</option>
                      <option value="TRANSFER">Transferencia</option>
                    </select>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="p-5 border-t border-white/10 bg-[#141414] shrink-0">
            <div className="flex justify-between items-end mb-4">
              <span className="text-sm text-[#888]">Total</span>
              <span className="text-3xl font-serif font-bold text-[#8B4513]">
                ${cartTotal.toFixed(2)}
              </span>
            </div>
            <button
              onClick={handleCheckout}
              disabled={isPending}
              className="w-full bg-[#8B4513] hover:brightness-110 text-white py-3.5 rounded-xl font-bold text-sm transition-transform hover:scale-[1.02] disabled:opacity-50 flex justify-center items-center gap-2 shadow-[0_0_15px_rgba(139,69,19,0.3)]"
            >
              {isPending && (
                <svg
                  className="animate-spin h-4 w-4 text-white"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
              )}
              {isPending ? "Procesando Venta..." : "Cobrar"}
            </button>
          </div>
        </div>
      )}

      {/* MODAL DE CUENTA POR COBRAR DEL CLIENTE */}
      {selectedReceivable && (
        <Dialog
          label={`Cuenta por cobrar de ${selectedReceivable.clientName}`}
          onClose={() => setSelectedReceivable(null)}
          overlayClassName="z-[100]"
          className="bg-[#141414] border border-white/10 rounded-xl w-full max-w-2xl max-h-[90vh] shadow-2xl animate-in zoom-in-95 overflow-hidden flex flex-col"
        >
          <div className="p-6 border-b border-white/10 flex items-start justify-between gap-4">
            <div>
              <span className="inline-flex px-2 py-1 rounded text-[10px] uppercase font-bold tracking-wider bg-orange-500/15 text-orange-400">
                Cuenta por cobrar
              </span>
              <h3 className="text-xl font-serif text-sterling mt-3">
                {selectedReceivable.clientName}
              </h3>
              <p className="text-xs text-charcoal mt-1">
                {selectedReceivableConcepts.length}{" "}
                {selectedReceivableConcepts.length === 1
                  ? "concepto pendiente"
                  : "conceptos pendientes"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSelectedReceivable(null)}
              className="text-charcoal hover:text-white p-1"
              aria-label="Cerrar"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>

          <div className="p-6 overflow-y-auto space-y-3">
            {selectedReceivableConcepts.map((concept) => (
              <div key={concept.key} className="border border-white/10 rounded-lg p-4 bg-pitch/50">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-sterling">{concept.name}</p>
                    <p className="text-[11px] text-charcoal mt-1">
                      {concept.itemType === "SERVICE"
                        ? "Servicio"
                        : concept.itemType === "PRODUCT"
                          ? "Producto"
                          : "Saldo histórico"}{" "}
                      · Cantidad: {Number(concept.quantity)} · Total: $
                      {Number(concept.subtotal).toFixed(2)}
                    </p>
                  </div>
                  <div className="sm:text-right shrink-0">
                    <p className="text-[10px] uppercase tracking-wider text-charcoal">
                      Saldo del concepto
                    </p>
                    <p className="text-sm font-bold text-orange-400">
                      ${concept.remaining.toFixed(2)}
                    </p>
                    {Number(concept.paidAmount) > 0 && (
                      <p className="text-[10px] text-emerald-400 mt-0.5">
                        Abonado: ${Number(concept.paidAmount).toFixed(2)}
                      </p>
                    )}
                  </div>
                </div>
                {concept.allocationStatus === "LEGACY_ESTIMATED" && (
                  <p className="mt-3 rounded-md bg-amber-500/10 px-3 py-2 text-[10px] text-amber-300">
                    Los abonos anteriores a esta mejora no identificaban el concepto pagado. El
                    saldo total se conserva sin modificar.
                  </p>
                )}
                <div className="mt-3 flex flex-wrap justify-end gap-2 border-t border-white/5 pt-3">
                  <button
                    type="button"
                    onClick={() => openConceptPayment(concept, false)}
                    className="rounded-lg border border-orange-500/40 bg-orange-500/15 px-3 py-2 text-xs font-bold text-orange-400 transition-colors hover:bg-orange-500/30"
                  >
                    Abonar
                  </button>
                  <button
                    type="button"
                    onClick={() => openConceptPayment(concept, true)}
                    className="rounded-lg bg-orange-500 px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-orange-400"
                  >
                    Pagar completo
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="p-5 border-t border-white/10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-charcoal">
                Deuda total del cliente
              </p>
              <p className="text-2xl font-bold text-orange-400">${selectedReceivable.totalDebt}</p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => openReceivablePayment(selectedReceivable)}
                className="bg-orange-500 hover:bg-orange-400 text-white px-4 py-2.5 rounded-lg text-sm font-bold transition-colors"
              >
                Pagar toda la deuda
              </button>
            </div>
          </div>
        </Dialog>
      )}

      {/* MODAL PARA PAGAR TODA LA CUENTA ACUMULADA */}
      {receivableToPay && (
        <Dialog
          label={`Pagar toda la deuda de ${receivableToPay.clientName}`}
          onClose={() => setReceivableToPay(null)}
          overlayClassName="z-[110]"
          className="bg-[#141414] border border-white/10 p-6 rounded-xl w-full max-w-sm shadow-2xl animate-in zoom-in-95"
        >
          <h3 className="text-lg font-serif text-sterling mb-1">
            Pagar toda la deuda de {receivableToPay.clientName}
          </h3>
          <p className="text-xs text-[#888] mb-5">
            Se cancelará el saldo acumulado de{" "}
            <span className="text-orange-400 font-bold">${receivableToPay.totalDebt}</span>. El pago
            se aplicará a todos los saldos pendientes del cliente.
          </p>
          <form onSubmit={handleReceivablePayment} className="flex flex-col gap-4">
            <div>
              <label
                htmlFor="receivable-payment-amount"
                className="text-xs text-charcoal uppercase tracking-wider block mb-1"
              >
                Monto ($)
              </label>
              <input
                id="receivable-payment-amount"
                data-autofocus
                type="number"
                step="0.01"
                min="0.01"
                max={receivableToPay.totalDebt}
                required
                autoFocus
                value={receivablePaymentAmount}
                readOnly
                className="bg-pitch border border-white/10 text-sterling px-4 py-3 rounded-lg text-sm focus:outline-none focus:border-orange-500 w-full"
              />
            </div>
            <div>
              <label
                htmlFor="receivable-payment-method"
                className="text-xs text-charcoal uppercase tracking-wider block mb-1"
              >
                Método de pago
              </label>
              <select
                id="receivable-payment-method"
                value={receivablePaymentMethod}
                onChange={(event) => setReceivablePaymentMethod(event.target.value)}
                className="bg-pitch border border-white/10 text-sterling px-4 py-3 rounded-lg text-sm focus:outline-none focus:border-orange-500 w-full"
              >
                <option value="CASH">Efectivo</option>
                <option value="CARD">Tarjeta</option>
                <option value="TRANSFER">Transferencia</option>
              </select>
            </div>
            <div className="flex gap-3 mt-2">
              <button
                type="button"
                onClick={() => setReceivableToPay(null)}
                className="flex-1 bg-white/5 hover:bg-white/10 text-sterling py-2.5 rounded-lg text-sm font-bold transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isPending}
                className="flex-1 bg-orange-500 hover:bg-orange-400 text-white py-2.5 rounded-lg text-sm font-bold transition-colors disabled:opacity-50"
              >
                {isPending ? "Procesando..." : "Confirmar pago total"}
              </button>
            </div>
          </form>
        </Dialog>
      )}

      {/* MODAL PARA ABONAR */}
      {isPaymentModalOpen && (
        <Dialog
          label={`Abonar a ${paymentTargetName || "la deuda"}`}
          onClose={closePaymentModal}
          overlayClassName="z-[120]"
          className="bg-[#141414] border border-white/10 p-6 rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl animate-in zoom-in-95"
        >
          <h3 className="text-lg font-serif text-sterling mb-1">
            {paymentTargetName ? `Pago de ${paymentTargetName}` : "Registrar abono"}
          </h3>
          <p className="text-xs text-[#888] mb-4">
            {paymentMovement
              ? "Indique cuánto se paga de cada concepto de este movimiento."
              : "Ingrese el monto que recibirá para este concepto."}
          </p>
          <form onSubmit={handlePayment} className="flex flex-col gap-4">
            {paymentMovement && paymentMovement.itemDetails.some((item) => item.remaining > 0) ? (
              <div className="space-y-3">
                {paymentMovement.itemDetails
                  .filter((item) => item.remaining > 0)
                  .map((item) => (
                    <label
                      key={item.id}
                      className="block rounded-lg border border-white/10 bg-pitch p-3"
                    >
                      <span className="flex items-center justify-between gap-3 text-xs">
                        <span className="font-semibold text-sterling">{item.name}</span>
                        <span className="text-orange-400">Debe ${item.remaining.toFixed(2)}</span>
                      </span>
                      <input
                        aria-label={`Abono para ${item.name}`}
                        type="number"
                        step="0.01"
                        min="0"
                        max={item.remaining.toFixed(2)}
                        value={paymentItemAmounts[item.id] ?? ""}
                        onChange={(event) =>
                          setPaymentItemAmounts((current) => ({
                            ...current,
                            [item.id]: event.target.value,
                          }))
                        }
                        placeholder="0.00"
                        className="mt-2 w-full rounded-lg border border-white/10 bg-[#111] px-3 py-2 text-sm text-sterling focus:border-orange-500 focus:outline-none"
                      />
                    </label>
                  ))}
                <div className="flex items-center justify-between rounded-lg bg-orange-500/10 px-3 py-2">
                  <span className="text-xs text-orange-200">Total a recibir</span>
                  <span className="text-sm font-bold text-orange-400">
                    $
                    {Object.values(paymentItemAmounts)
                      .reduce((sum, value) => {
                        const amount = Number(value);
                        return sum + (Number.isFinite(amount) && amount > 0 ? amount : 0);
                      }, 0)
                      .toFixed(2)}
                  </span>
                </div>
              </div>
            ) : (
              <div>
                <label
                  htmlFor="movement-payment-amount"
                  className="text-xs text-charcoal uppercase tracking-wider block mb-1"
                >
                  Monto ($)
                </label>
                <input
                  id="movement-payment-amount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  max={paymentRemaining || undefined}
                  required
                  autoFocus
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  className="bg-pitch border border-white/10 text-sterling px-4 py-3 rounded-lg text-sm focus:outline-none focus:border-orange-500 w-full"
                />
                <button
                  type="button"
                  onClick={() => setPaymentAmount(paymentRemaining)}
                  className="mt-2 text-xs font-bold text-orange-400 hover:text-orange-300 transition-colors"
                >
                  Pagar saldo completo (${paymentRemaining || "0.00"})
                </button>
              </div>
            )}
            <div>
              <label
                htmlFor="movement-payment-method"
                className="mb-1 block text-xs uppercase tracking-wider text-charcoal"
              >
                Método de pago
              </label>
              <select
                id="movement-payment-method"
                value={paymentMethodForMovement}
                onChange={(event) => setPaymentMethodForMovement(event.target.value)}
                className="w-full rounded-lg border border-white/10 bg-pitch px-4 py-3 text-sm text-sterling focus:border-orange-500 focus:outline-none"
              >
                <option value="CASH">Efectivo</option>
                <option value="CARD">Tarjeta</option>
                <option value="TRANSFER">Transferencia</option>
              </select>
            </div>
            <div className="flex gap-3 mt-2">
              <button
                type="button"
                onClick={closePaymentModal}
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
        </Dialog>
      )}

      {/* MODAL DE DETALLE DEL MOVIMIENTO */}
      {selectedTransaction && (
        <Dialog
          label="Detalle del movimiento"
          onClose={() => setSelectedTransaction(null)}
          className="bg-[#141414] border border-white/10 rounded-xl w-full max-w-lg shadow-2xl animate-in zoom-in-95 overflow-hidden"
        >
          <div className="p-6 border-b border-white/10 flex items-start justify-between gap-4">
            <div>
              <span
                className={`inline-flex px-2 py-1 rounded text-[10px] uppercase font-bold tracking-wider ${
                  selectedTransaction.type === "INCOME"
                    ? "bg-green-900/30 text-green-500"
                    : "bg-red-900/30 text-red-500"
                }`}
              >
                {selectedTransaction.movementKind === "PAYMENT"
                  ? "Abono recibido"
                  : selectedTransaction.movementKind === "PENDING"
                    ? "Cuenta por cobrar"
                    : selectedTransaction.type === "INCOME"
                      ? "Venta"
                      : "Gasto"}
              </span>
              <h3 className="text-xl font-serif text-sterling mt-3">Detalle del movimiento</h3>
              <p className="text-xs text-[#888] mt-1">
                {new Date(selectedTransaction.createdAt).toLocaleDateString()} ·{" "}
                {new Date(selectedTransaction.createdAt).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            </div>
            <button
              type="button"
              data-autofocus
              onClick={() => setSelectedTransaction(null)}
              className="text-charcoal hover:text-white p-1"
              aria-label="Cerrar"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
          <div className="p-6 space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-pitch/70 rounded-lg p-3">
                <p className="text-[10px] uppercase tracking-wider text-charcoal">
                  {selectedTransaction.movementKind === "PAYMENT"
                    ? "Monto recibido"
                    : "Monto total"}
                </p>
                <p
                  className={`text-lg font-bold mt-1 ${selectedTransaction.type === "INCOME" ? "text-green-500" : "text-red-500"}`}
                >
                  {selectedTransaction.type === "INCOME" ? "+" : "-"}$
                  {selectedTransaction.totalAmount}
                </p>
              </div>
              <div className="bg-pitch/70 rounded-lg p-3">
                <p className="text-[10px] uppercase tracking-wider text-charcoal">Estado</p>
                <p
                  className={`text-sm font-bold mt-1 ${selectedTransaction.status === "PENDING" ? "text-orange-400" : "text-green-500"}`}
                >
                  {selectedTransaction.status === "PENDING" ? "Pendiente" : "Completado"}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-charcoal">Método de pago</p>
                <p className="text-sm text-sterling mt-1">
                  {selectedTransaction.paymentMethod === "CASH"
                    ? "Efectivo"
                    : selectedTransaction.paymentMethod === "CARD"
                      ? "Tarjeta"
                      : selectedTransaction.paymentMethod === "TRANSFER"
                        ? "Transferencia"
                        : "Fiado"}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-charcoal">Cliente</p>
                <p className="text-sm text-sterling mt-1">{selectedTransaction.clientName}</p>
              </div>
            </div>

            {selectedTransaction.status === "PENDING" && (
              <div className="bg-orange-500/10 border border-orange-500/30 rounded-lg p-3 flex justify-between items-center">
                <span className="text-sm text-orange-300">Saldo pendiente</span>
                <span className="text-sm font-bold text-orange-400">
                  $
                  {(
                    parseFloat(selectedTransaction.totalAmount) -
                    parseFloat(selectedTransaction.paidAmount || "0")
                  ).toFixed(2)}
                </span>
              </div>
            )}

            {selectedTransaction.itemDetails?.length > 0 ? (
              <div>
                <p className="text-[10px] uppercase tracking-wider text-charcoal mb-2">
                  Detalle de la venta
                </p>
                <div className="rounded-lg border border-white/10 divide-y divide-white/5 overflow-hidden">
                  {selectedTransaction.itemDetails.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm"
                    >
                      <div>
                        <p className="text-sterling">{item.name}</p>
                        <p className="text-xs text-charcoal">
                          {item.quantity} × ${item.unitPrice}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-medium text-sterling">${item.subtotal}</p>
                        <p
                          className={`text-[10px] font-bold ${item.remaining > 0 ? "text-orange-400" : "text-emerald-400"}`}
                        >
                          {item.remaining > 0 ? `Debe $${item.remaining.toFixed(2)}` : "Pagado"}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
                {selectedTransaction.allocationStatus === "LEGACY_ESTIMATED" && (
                  <p className="mt-2 text-[10px] text-amber-300">
                    Los abonos históricos conservaron su total, pero no registraban el concepto
                    específico al que se aplicaron.
                  </p>
                )}
              </div>
            ) : (
              <div>
                <p className="text-[10px] uppercase tracking-wider text-charcoal mb-2">
                  Descripción
                </p>
                <p className="text-sm text-sterling bg-pitch/70 rounded-lg p-3">
                  {selectedTransaction.notes || selectedTransaction.description}
                </p>
              </div>
            )}

            {selectedTransaction.itemDetails?.length > 0 && selectedTransaction.notes && (
              <div>
                <p className="text-[10px] uppercase tracking-wider text-charcoal mb-2">
                  Información adicional
                </p>
                <p className="text-sm text-sterling bg-pitch/70 rounded-lg p-3">
                  {selectedTransaction.notes}
                </p>
              </div>
            )}
          </div>
          <div className="p-5 border-t border-white/10 flex flex-wrap justify-end gap-3">
            {selectedTransaction.status === "PENDING" && (
              <button
                type="button"
                onClick={() => {
                  openHistoryMovementPayment(selectedTransaction, false);
                  setSelectedTransaction(null);
                }}
                className="bg-orange-500/20 hover:bg-orange-500/40 border border-orange-500/50 text-orange-400 px-4 py-2.5 rounded-lg text-sm font-bold transition-colors"
              >
                Abonar
              </button>
            )}
            {selectedTransaction.canEdit && (
              <button
                type="button"
                onClick={() => {
                  setEditingTransaction(selectedTransaction);
                  setSelectedTransaction(null);
                }}
                className="bg-cognac hover:brightness-110 text-white px-4 py-2.5 rounded-lg text-sm font-bold transition-colors"
              >
                Editar
              </button>
            )}
          </div>
        </Dialog>
      )}

      {/* MODAL PARA EDITAR MOVIMIENTO */}
      {editingTransaction && (
        <Dialog
          label="Editar movimiento"
          onClose={() => setEditingTransaction(null)}
          className="bg-[#141414] border border-white/10 p-6 rounded-xl w-full max-w-md shadow-2xl animate-in zoom-in-95"
        >
          <div className="flex items-start justify-between gap-4 mb-5">
            <div>
              <h3 className="text-lg font-serif text-sterling">Editar movimiento</h3>
              <p className="text-xs text-[#888] mt-1">
                {editingTransaction.type === "INCOME"
                  ? "Puedes corregir el monto, cliente o método de pago."
                  : "Puedes corregir los datos del gasto."}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setEditingTransaction(null)}
              className="text-charcoal hover:text-white p-1"
              aria-label="Cerrar"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
          <form onSubmit={handleUpdateTransaction} className="flex flex-col gap-4">
            {editingTransaction.type === "EXPENSE" ? (
              <div>
                <label
                  htmlFor="movement-description"
                  className="text-xs text-charcoal uppercase tracking-wider block mb-1"
                >
                  Descripción *
                </label>
                <input
                  id="movement-description"
                  data-autofocus
                  name="description"
                  type="text"
                  required
                  defaultValue={editingTransaction.description}
                  className="bg-pitch border border-white/10 text-sterling px-4 py-3 rounded-lg text-sm focus:outline-none focus:border-red-500 w-full"
                />
              </div>
            ) : (
              <div>
                <label
                  htmlFor="movement-client"
                  className="text-xs text-charcoal uppercase tracking-wider block mb-1"
                >
                  Cliente
                </label>
                <select
                  id="movement-client"
                  data-autofocus
                  name="clientId"
                  defaultValue={editingTransaction.clientId || ""}
                  className="bg-pitch border border-white/10 text-sterling px-4 py-3 rounded-lg text-sm focus:outline-none focus:border-cognac w-full"
                >
                  <option value="">Cliente general</option>
                  {clients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.firstName} {client.lastName || ""}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label
                htmlFor="movement-total"
                className="text-xs text-charcoal uppercase tracking-wider block mb-1"
              >
                Monto total ($) *
              </label>
              <input
                id="movement-total"
                name="totalAmount"
                type="number"
                min="0.01"
                step="0.01"
                required
                defaultValue={editingTransaction.totalAmount}
                className="bg-pitch border border-white/10 text-sterling px-4 py-3 rounded-lg text-sm focus:outline-none focus:border-cognac w-full"
              />
            </div>
            <div>
              <label
                htmlFor="movement-payment-method"
                className="text-xs text-charcoal uppercase tracking-wider block mb-1"
              >
                Método de pago
              </label>
              <select
                id="movement-payment-method"
                name="paymentMethod"
                defaultValue={editingTransaction.paymentMethod || "CASH"}
                className="bg-pitch border border-white/10 text-sterling px-4 py-3 rounded-lg text-sm focus:outline-none focus:border-cognac w-full"
              >
                <option value="CASH">Efectivo</option>
                <option value="CARD">Tarjeta</option>
                <option value="TRANSFER">Transferencia</option>
                {editingTransaction.type === "INCOME" && <option value="CREDIT">Fiado</option>}
              </select>
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-white/10 pt-5 mt-1">
              <button
                type="button"
                onClick={handleDeleteTransaction}
                disabled={isPending}
                className="text-red-400 hover:text-red-300 text-sm font-medium disabled:opacity-50"
              >
                Eliminar
              </button>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setEditingTransaction(null)}
                  className="bg-white/5 hover:bg-white/10 text-sterling px-4 py-2.5 rounded-lg text-sm font-bold transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="bg-cognac hover:brightness-110 text-white px-4 py-2.5 rounded-lg text-sm font-bold transition-colors disabled:opacity-50"
                >
                  {isPending ? "Guardando..." : "Guardar cambios"}
                </button>
              </div>
            </div>
          </form>
        </Dialog>
      )}

      {/* MODAL DE VENTA EXITOSA */}
      {successTxId && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#141414] border border-white/10 p-8 rounded-xl w-full max-w-sm shadow-2xl animate-in zoom-in-95 flex flex-col items-center text-center">
            <div className="w-16 h-16 bg-green-500/20 text-green-500 rounded-full flex items-center justify-center mb-4">
              <svg
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
              >
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
            </div>
            <h3 className="text-2xl font-serif text-sterling mb-2">¡Venta Exitosa!</h3>
            <p className="text-sm text-[#888] mb-6">
              La transacción se ha registrado correctamente.
            </p>
            <div className="flex flex-col gap-3 w-full">
              <button
                onClick={() => window.open(`/pos/receipt/${successTxId}`, "_blank")}
                className="w-full bg-[#8B4513] hover:bg-[#A0522D] text-white py-3 rounded-lg text-sm font-bold transition-colors flex items-center justify-center gap-2 shadow-lg"
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <polyline points="6 9 6 2 18 2 18 9"></polyline>
                  <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path>
                  <rect x="6" y="14" width="12" height="8"></rect>
                </svg>
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
