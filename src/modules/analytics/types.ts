export type AnalyticsPeriodType = "month" | "quarter" | "semester" | "year";

export type AnalyticsPeriod = {
  type: AnalyticsPeriodType;
  year: number;
  segment: number;
  label: string;
  startIso: string;
  endIso: string;
  granularity: "day" | "month";
};

export type AnalyticsMetrics = {
  income: number;
  expenses: number;
  net: number;
  transactions: number;
  averageTicket: number;
  outstanding: number;
  incomeChange: number | null;
  expenseChange: number | null;
  netChange: number | null;
};

export type TrendPoint = {
  label: string;
  income: number;
  expenses: number;
  net: number;
};

export type RankingItem = {
  id: string;
  label: string;
  value: number;
  secondary: number;
};

export type DemandPoint = {
  day: number;
  hour: number;
  value: number;
};

export type MovementItem = {
  name: string;
  type: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
};

export type MovementPayment = {
  amount: number;
  method: string;
  createdAt: string;
};

export type AnalyticsMovement = {
  id: string;
  type: string;
  amount: number;
  paidAmount: number;
  status: string;
  paymentMethod: string | null;
  clientName: string;
  description: string;
  createdAt: string;
  items: MovementItem[];
  payments: MovementPayment[];
};

export type AnalyticsData = {
  period: AnalyticsPeriod;
  availableYears: number[];
  metrics: AnalyticsMetrics;
  trend: TrendPoint[];
  topServices: RankingItem[];
  topProducts: RankingItem[];
  topClients: RankingItem[];
  topExpenses: RankingItem[];
  demand: DemandPoint[];
  movements: AnalyticsMovement[];
  nextCursor: string | null;
};
