export type HistoryRange = "MONTH" | "WEEK" | "DAY" | "YEAR" | "CUSTOM" | "HISTORIC";
export type POSActiveTab = "VENTA" | "RECEIVABLES" | "HISTORY" | "COMPRA";

export type POSService = {
  id: string;
  name: string;
  price: string;
  durationMinutes: number;
};

export type POSProduct = {
  id: string;
  name: string;
  salePrice: string | null;
  currentStock: string;
  category: string;
};

export type POSClient = {
  id: string;
  firstName: string;
  lastName: string | null;
};

export type POSStaff = { id: string; name: string };

export type POSAppointment = {
  id: string;
  clientId: string;
  staffId: string;
  serviceId: string;
  clientName: string | null;
  clientLastName: string | null;
  serviceName: string | null;
};

export type POSItemDetail = {
  id: string;
  itemType: "SERVICE" | "PRODUCT";
  name: string;
  quantity: string;
  unitPrice: string;
  subtotal: string;
  paidAmount: string;
  remaining: number;
};

export type POSHistoryEntry = {
  id: string;
  transactionId: string;
  movementKind: "PAYMENT" | "TRANSACTION" | "PENDING";
  canEdit: boolean;
  type: string;
  totalAmount: string;
  originalTotalAmount: string;
  paidAmount: string;
  status: string;
  transactionStatus: string;
  paymentMethod: string | null;
  clientId: string | null;
  createdAt: string;
  description: string;
  notes: string | null;
  clientName: string;
  itemDetails: POSItemDetail[];
  allocationStatus: "EXACT" | "LEGACY_ESTIMATED";
};

export type POSReceivableMovement = {
  transactionId: string;
  createdAt: string;
  description: string;
  totalAmount: string;
  paidAmount: string;
  remaining: number;
  itemDetails: POSItemDetail[];
  allocationStatus: "EXACT" | "LEGACY_ESTIMATED";
};

export type POSReceivable = {
  clientId: string;
  clientName: string;
  totalDebt: string;
  movements: POSReceivableMovement[];
};

export type POSManagerProps = {
  services: POSService[];
  products: POSProduct[];
  clients: POSClient[];
  staff: POSStaff[];
  history: POSHistoryEntry[];
  receivables: POSReceivable[];
  historyRange: HistoryRange;
  historyStart: string;
  historyEnd: string;
  pendingAppointments?: POSAppointment[];
};
