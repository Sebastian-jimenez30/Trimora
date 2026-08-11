import type { AnalyticsData, AnalyticsMovement } from "@/modules/analytics/types";
import type { POSHistoryEntry, POSManagerProps, POSReceivable } from "@/modules/pos/ui/types";

export function buildAnalyticsMovement(
  overrides: Partial<AnalyticsMovement> = {},
): AnalyticsMovement {
  return {
    id: "transaction:movement-1",
    type: "INCOME",
    amount: 25000,
    paidAmount: 25000,
    status: "COMPLETED",
    paymentMethod: "CASH",
    clientName: "Ana Lopez",
    description: "Corte clásico",
    createdAt: "2026-08-11T14:30:00.000Z",
    items: [],
    payments: [],
    ...overrides,
  };
}

export function buildAnalyticsData(overrides: Partial<AnalyticsData> = {}): AnalyticsData {
  return {
    period: {
      type: "month",
      year: 2026,
      segment: 8,
      label: "Agosto de 2026",
      startIso: "2026-08-01T05:00:00.000Z",
      endIso: "2026-09-01T05:00:00.000Z",
      granularity: "day",
    },
    availableYears: [2026],
    metrics: {
      income: 0,
      expenses: 0,
      net: 0,
      transactions: 0,
      averageTicket: 0,
      outstanding: 0,
      incomeChange: null,
      expenseChange: null,
      netChange: null,
    },
    trend: [],
    topServices: [],
    topProducts: [],
    topClients: [],
    topExpenses: [],
    demand: [],
    movements: [],
    nextCursor: null,
    ...overrides,
  };
}

export function buildPOSHistoryEntry(overrides: Partial<POSHistoryEntry> = {}): POSHistoryEntry {
  return {
    id: "transaction-1",
    transactionId: "transaction-1",
    movementKind: "TRANSACTION",
    canEdit: true,
    type: "INCOME",
    totalAmount: "25000.00",
    originalTotalAmount: "25000.00",
    paidAmount: "25000.00",
    status: "COMPLETED",
    transactionStatus: "COMPLETED",
    paymentMethod: "CASH",
    clientId: "client-1",
    createdAt: "2026-08-11T14:30:00.000Z",
    description: "Corte clásico",
    notes: null,
    clientName: "Ana Lopez",
    itemDetails: [],
    ...overrides,
  };
}

export function buildPOSReceivable(overrides: Partial<POSReceivable> = {}): POSReceivable {
  return {
    clientId: "client-1",
    clientName: "Ana Lopez",
    totalDebt: "35000.00",
    movements: [],
    ...overrides,
  };
}

export function buildPOSManagerProps(overrides: Partial<POSManagerProps> = {}): POSManagerProps {
  return {
    services: [],
    products: [],
    clients: [],
    staff: [],
    history: [],
    receivables: [],
    historyRange: "MONTH",
    historyStart: "",
    historyEnd: "",
    pendingAppointments: [],
    ...overrides,
  };
}
