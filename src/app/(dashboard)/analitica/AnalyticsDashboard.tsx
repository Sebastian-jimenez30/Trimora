"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Dialog from "@/components/shared/Dialog";
import type {
  AnalyticsData,
  AnalyticsMovement,
  AnalyticsPeriodType,
  RankingItem,
  TrendPoint,
} from "@/modules/analytics/types";

const currency = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});
const compact = new Intl.NumberFormat("es-CO", { notation: "compact", maximumFractionDigits: 1 });
const DAY_NAMES = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const MONTHS = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

function paymentLabel(value: string | null) {
  return value === "CASH"
    ? "Efectivo"
    : value === "CARD"
      ? "Tarjeta"
      : value === "TRANSFER"
        ? "Transferencia"
        : value === "CREDIT"
          ? "Fiado"
          : "Sin definir";
}

function periodSegments(type: AnalyticsPeriodType) {
  if (type === "month") return MONTHS.map((label, index) => ({ value: index + 1, label }));
  if (type === "quarter")
    return Array.from({ length: 4 }, (_, index) => ({
      value: index + 1,
      label: `Trimestre ${index + 1}`,
    }));
  if (type === "semester")
    return [
      { value: 1, label: "Semestre 1" },
      { value: 2, label: "Semestre 2" },
    ];
  return [{ value: 1, label: "Año completo" }];
}

function ChangeBadge({ value, inverse = false }: { value: number | null; inverse?: boolean }) {
  if (value === null) return <span className="text-[10px] text-charcoal">Sin base anterior</span>;
  const positive = inverse ? value <= 0 : value >= 0;
  return (
    <span className={`text-[10px] font-semibold ${positive ? "text-emerald-400" : "text-red-400"}`}>
      {value >= 0 ? "+" : ""}
      {value.toFixed(1)}% vs. período anterior
    </span>
  );
}

function MetricCard({
  title,
  value,
  detail,
  change,
  tone = "neutral",
  inverse,
}: {
  title: string;
  value: string;
  detail: string;
  change?: number | null;
  tone?: "green" | "red" | "orange" | "neutral";
  inverse?: boolean;
}) {
  const tones = {
    green: "from-emerald-500/15",
    red: "from-red-500/15",
    orange: "from-orange-500/15",
    neutral: "from-cognac/15",
  };
  return (
    <div
      className={`rounded-xl border border-white/10 bg-gradient-to-br ${tones[tone]} to-[#141414] p-4 min-w-0`}
    >
      <p className="text-[10px] uppercase tracking-[0.16em] text-charcoal">{title}</p>
      <p className="text-xl font-semibold text-sterling mt-2 truncate" title={value}>
        {value}
      </p>
      <div className="mt-2 min-h-7">
        <p className="text-[10px] text-[#777]">{detail}</p>
        {change !== undefined && <ChangeBadge value={change} inverse={inverse} />}
      </div>
    </div>
  );
}

function EmptyChart({ text }: { text: string }) {
  return (
    <div className="h-48 flex items-center justify-center text-sm text-charcoal border border-dashed border-white/10 rounded-lg">
      {text}
    </div>
  );
}

function TrendChart({ points }: { points: TrendPoint[] }) {
  if (points.length === 0) return <EmptyChart text="No hay movimientos en este período" />;
  const width = 820;
  const height = 250;
  const padding = { left: 46, right: 18, top: 20, bottom: 38 };
  const maxValue = Math.max(1, ...points.flatMap((point) => [point.income, point.expenses]));
  const x = (index: number) =>
    padding.left +
    (index * (width - padding.left - padding.right)) / Math.max(1, points.length - 1);
  const y = (value: number) =>
    padding.top + (1 - value / maxValue) * (height - padding.top - padding.bottom);
  const path = (key: "income" | "expenses") =>
    points
      .map((point, index) => `${index === 0 ? "M" : "L"}${x(index)},${y(point[key])}`)
      .join(" ");
  const labelEvery = Math.max(1, Math.ceil(points.length / 6));

  return (
    <div className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full min-w-[620px] h-[250px]"
        role="img"
        aria-label="Tendencia de ingresos y egresos"
      >
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
          const gridY = y(maxValue * ratio);
          return (
            <g key={ratio}>
              <line
                x1={padding.left}
                x2={width - padding.right}
                y1={gridY}
                y2={gridY}
                stroke="rgba(255,255,255,.08)"
              />
              <text x={padding.left - 8} y={gridY + 4} textAnchor="end" fill="#777" fontSize="10">
                {compact.format(maxValue * ratio)}
              </text>
            </g>
          );
        })}
        <path
          d={`${path("income")} L${x(points.length - 1)},${height - padding.bottom} L${x(0)},${height - padding.bottom} Z`}
          fill="rgba(16,185,129,.08)"
        />
        <path
          d={path("income")}
          fill="none"
          stroke="#34d399"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d={path("expenses")}
          fill="none"
          stroke="#f87171"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {points.map((point, index) =>
          index % labelEvery === 0 || index === points.length - 1 ? (
            <text
              key={point.label}
              x={x(index)}
              y={height - 14}
              textAnchor="middle"
              fill="#777"
              fontSize="10"
            >
              {point.label.slice(5)}
            </text>
          ) : null,
        )}
      </svg>
    </div>
  );
}

function RankingCard({
  title,
  subtitle,
  items,
  mode = "money",
  accent = "bg-cognac",
}: {
  title: string;
  subtitle: string;
  items: RankingItem[];
  mode?: "money" | "count";
  accent?: string;
}) {
  const max = Math.max(1, ...items.map((item) => item.value));
  return (
    <section className="rounded-xl bg-[#141414] border border-white/10 p-5 min-w-0">
      <h3 className="font-serif text-lg text-sterling">{title}</h3>
      <p className="text-xs text-charcoal mt-1 mb-5">{subtitle}</p>
      {items.length === 0 ? (
        <EmptyChart text="Sin datos para clasificar" />
      ) : (
        <div className="space-y-4">
          {items.map((item, index) => (
            <div key={item.id}>
              <div className="flex items-center justify-between gap-3 text-xs mb-1.5">
                <span className="text-sterling truncate">
                  <span className="text-charcoal mr-2">{index + 1}.</span>
                  {item.label}
                </span>
                <span className="font-semibold text-white shrink-0">
                  {mode === "money"
                    ? currency.format(item.value)
                    : `${item.value.toLocaleString("es-CO")} uds.`}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                <div
                  className={`h-full rounded-full ${accent}`}
                  style={{ width: `${Math.max(4, (item.value / max) * 100)}%` }}
                />
              </div>
              <p className="text-[10px] text-charcoal mt-1">
                {mode === "money"
                  ? `${item.secondary.toLocaleString("es-CO")} movimientos`
                  : currency.format(item.secondary)}
              </p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function DemandHeatmap({ data }: { data: AnalyticsData["demand"] }) {
  const hours = Array.from({ length: 18 }, (_, index) => index + 5);
  const valueMap = new Map(data.map((point) => [`${point.day}-${point.hour}`, point.value]));
  const max = Math.max(1, ...data.map((point) => point.value));
  const dailyTotals = DAY_NAMES.map((label, index) => ({
    label,
    value: data
      .filter((point) => point.day === index + 1)
      .reduce((sum, point) => sum + point.value, 0),
  }));
  const hourTotals = hours.map((hour) => ({
    hour,
    value: data.filter((point) => point.hour === hour).reduce((sum, point) => sum + point.value, 0),
  }));
  const bestDay = [...dailyTotals].sort((a, b) => b.value - a.value)[0];
  const worstDay = dailyTotals.some((day) => day.value > 0)
    ? [...dailyTotals].sort((a, b) => a.value - b.value)[0]
    : undefined;
  const bestHour = [...hourTotals].sort((a, b) => b.value - a.value)[0];

  return (
    <section className="rounded-xl bg-[#141414] border border-white/10 p-5 xl:col-span-2">
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-5">
        <div>
          <h3 className="font-serif text-lg text-sterling">Mapa de demanda</h3>
          <p className="text-xs text-charcoal mt-1">Citas por día y hora, excluyendo canceladas</p>
        </div>
        <div className="flex flex-wrap gap-2 text-[10px]">
          <span className="bg-white/5 px-2.5 py-1.5 rounded">
            Mejor día: <b className="text-white">{bestDay?.value ? bestDay.label : "—"}</b>
          </span>
          <span className="bg-white/5 px-2.5 py-1.5 rounded">
            Menor demanda: <b className="text-white">{worstDay?.label || "—"}</b>
          </span>
          <span className="bg-white/5 px-2.5 py-1.5 rounded">
            Hora pico: <b className="text-white">{bestHour?.value ? `${bestHour.hour}:00` : "—"}</b>
          </span>
        </div>
      </div>
      {data.length === 0 ? (
        <EmptyChart text="No hay citas en este período" />
      ) : (
        <div className="overflow-x-auto">
          <div
            className="min-w-[680px] grid gap-1"
            style={{ gridTemplateColumns: "42px repeat(7, minmax(70px, 1fr))" }}
          >
            <div />
            {DAY_NAMES.map((day) => (
              <div key={day} className="text-center text-[10px] uppercase text-charcoal pb-1">
                {day}
              </div>
            ))}
            {hours.flatMap((hour) => [
              <div key={`hour-${hour}`} className="text-[10px] text-charcoal flex items-center">
                {String(hour).padStart(2, "0")}:00
              </div>,
              ...DAY_NAMES.map((_, dayIndex) => {
                const value = valueMap.get(`${dayIndex + 1}-${hour}`) || 0;
                const opacity = value ? 0.15 + (value / max) * 0.75 : 0.03;
                return (
                  <div
                    key={`${dayIndex}-${hour}`}
                    className="h-7 rounded flex items-center justify-center text-[10px] text-white/80"
                    title={`${value} citas`}
                    style={{ backgroundColor: `rgba(139,69,19,${opacity})` }}
                  >
                    {value || ""}
                  </div>
                );
              }),
            ])}
          </div>
        </div>
      )}
    </section>
  );
}

function MovementDetail({
  movement,
  onClose,
}: {
  movement: AnalyticsMovement;
  onClose: () => void;
}) {
  const remaining = Math.max(0, movement.amount - movement.paidAmount);
  return (
    <Dialog
      label="Trazabilidad del movimiento"
      onClose={onClose}
      overlayClassName="z-[120] bg-black/70"
      className="bg-[#141414] border border-white/10 rounded-xl w-full max-w-xl max-h-[90vh] overflow-y-auto shadow-2xl"
    >
      <div className="p-6 border-b border-white/10 flex items-start justify-between gap-4 sticky top-0 bg-[#141414] z-10">
        <div>
          <span
            className={`text-[10px] uppercase font-bold px-2 py-1 rounded ${movement.type === "INCOME" ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"}`}
          >
            {movement.type === "INCOME" ? "Ingreso" : "Egreso"}
          </span>
          <h3 className="font-serif text-xl text-white mt-3">Trazabilidad del movimiento</h3>
          <p className="text-xs text-charcoal mt-1">
            {new Date(movement.createdAt).toLocaleString("es-CO")}
          </p>
        </div>
        <button
          type="button"
          data-autofocus
          onClick={onClose}
          className="p-2 rounded-full bg-white/5 text-charcoal hover:text-white"
          aria-label="Cerrar"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div className="p-6 space-y-5">
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-pitch rounded-lg p-3">
            <p className="text-[10px] text-charcoal uppercase">Monto</p>
            <p className="text-lg text-white font-semibold mt-1">
              {currency.format(movement.amount)}
            </p>
          </div>
          <div className="bg-pitch rounded-lg p-3">
            <p className="text-[10px] text-charcoal uppercase">Estado</p>
            <p
              className={`text-sm font-semibold mt-1 ${movement.status === "PENDING" ? "text-orange-400" : "text-emerald-400"}`}
            >
              {movement.status === "PENDING" ? "Pendiente" : "Completado"}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-charcoal uppercase">Cliente</p>
            <p className="text-sm text-sterling mt-1">{movement.clientName}</p>
          </div>
          <div>
            <p className="text-[10px] text-charcoal uppercase">Método</p>
            <p className="text-sm text-sterling mt-1">{paymentLabel(movement.paymentMethod)}</p>
          </div>
        </div>
        {remaining > 0 && (
          <div className="flex justify-between bg-orange-500/10 border border-orange-500/30 rounded-lg p-3 text-sm">
            <span className="text-orange-300">Saldo pendiente</span>
            <b className="text-orange-400">{currency.format(remaining)}</b>
          </div>
        )}
        <div>
          <p className="text-[10px] text-charcoal uppercase mb-2">Descripción</p>
          <p className="text-sm bg-pitch rounded-lg p-3 text-sterling">{movement.description}</p>
        </div>
        {movement.items.length > 0 && (
          <div>
            <p className="text-[10px] text-charcoal uppercase mb-2">Conceptos</p>
            <div className="border border-white/10 rounded-lg divide-y divide-white/5">
              {movement.items.map((item, index) => (
                <div
                  key={`${item.name}-${index}`}
                  className="p-3 flex justify-between gap-4 text-sm"
                >
                  <div>
                    <p className="text-sterling">{item.name}</p>
                    <p className="text-xs text-charcoal">
                      {item.quantity} × {currency.format(item.unitPrice)}
                    </p>
                  </div>
                  <b className="text-white">{currency.format(item.subtotal)}</b>
                </div>
              ))}
            </div>
          </div>
        )}
        {movement.payments.length > 0 && (
          <div>
            <p className="text-[10px] text-charcoal uppercase mb-2">Abonos registrados</p>
            <div className="border border-white/10 rounded-lg divide-y divide-white/5">
              {movement.payments.map((payment, index) => (
                <div
                  key={`${payment.createdAt}-${index}`}
                  className="p-3 flex justify-between gap-4 text-xs"
                >
                  <span className="text-charcoal">
                    {new Date(payment.createdAt).toLocaleString("es-CO")} ·{" "}
                    {paymentLabel(payment.method)}
                  </span>
                  <b className="text-sterling">{currency.format(payment.amount)}</b>
                </div>
              ))}
            </div>
          </div>
        )}
        <p className="text-[10px] text-charcoal break-all">ID: {movement.id}</p>
      </div>
    </Dialog>
  );
}

export default function AnalyticsDashboard({ data }: { data: AnalyticsData }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isNavigating, startTransition] = useTransition();
  const [selectedMovement, setSelectedMovement] = useState<AnalyticsMovement | null>(null);
  const segments = periodSegments(data.period.type);
  const totalFlow = data.metrics.income + data.metrics.expenses;
  const incomeShare = totalFlow > 0 ? (data.metrics.income / totalFlow) * 100 : 0;
  const demandByDay = useMemo(
    () =>
      DAY_NAMES.map((label, index) => ({
        label,
        value: data.demand
          .filter((point) => point.day === index + 1)
          .reduce((sum, point) => sum + point.value, 0),
      })),
    [data.demand],
  );

  const navigate = (changes: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(changes).forEach(([key, value]) =>
      value === null ? params.delete(key) : params.set(key, value),
    );
    if (!("cursor" in changes)) params.delete("cursor");
    startTransition(() => router.push(`/analitica?${params.toString()}`));
  };

  const changePeriod = (type: AnalyticsPeriodType) =>
    navigate({ period: type, segment: "1", cursor: null });

  return (
    <div
      className={`h-full overflow-y-auto bg-[#0f0f0f] p-4 md:p-7 ${isNavigating ? "opacity-70 pointer-events-none" : ""}`}
    >
      <div className="max-w-[1600px] mx-auto">
        <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-5 mb-7">
          <div>
            <p className="text-[10px] uppercase tracking-[0.22em] text-cognac font-bold">
              Inteligencia del negocio
            </p>
            <h1 className="font-serif text-3xl text-white mt-1">Analítica integral</h1>
            <p className="text-sm text-charcoal mt-2">
              Finanzas, clientes, demanda y rendimiento comercial en una sola vista.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex bg-[#141414] border border-white/10 rounded-lg p-1 overflow-x-auto">
              {(["month", "quarter", "semester", "year"] as const).map((type) => (
                <button
                  key={type}
                  onClick={() => changePeriod(type)}
                  className={`px-3 py-2 rounded-md text-xs whitespace-nowrap transition-colors ${data.period.type === type ? "bg-cognac text-white" : "text-charcoal hover:text-white"}`}
                >
                  {type === "month"
                    ? "Mes"
                    : type === "quarter"
                      ? "Trimestre"
                      : type === "semester"
                        ? "Semestre"
                        : "Año"}
                </button>
              ))}
            </div>
            <select
              aria-label="Segmento del período"
              value={data.period.segment}
              onChange={(event) => navigate({ segment: event.target.value })}
              className="bg-[#141414] border border-white/10 text-sterling rounded-lg px-3 py-2.5 text-xs focus:outline-none focus:border-cognac"
            >
              {segments.map((segment) => (
                <option key={segment.value} value={segment.value}>
                  {segment.label}
                </option>
              ))}
            </select>
            <select
              aria-label="Año del período"
              value={data.period.year}
              onChange={(event) => navigate({ year: event.target.value })}
              className="bg-[#141414] border border-white/10 text-sterling rounded-lg px-3 py-2.5 text-xs focus:outline-none focus:border-cognac"
            >
              {data.availableYears.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center gap-2 mb-4">
          <span className="w-2 h-2 rounded-full bg-cognac" />
          <p className="text-xs text-charcoal">
            Período analizado:{" "}
            <span className="text-sterling font-medium">{data.period.label}</span>
          </p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mb-6">
          <MetricCard
            title="Ingresos"
            value={currency.format(data.metrics.income)}
            detail="Ventas registradas"
            change={data.metrics.incomeChange}
            tone="green"
          />
          <MetricCard
            title="Egresos"
            value={currency.format(data.metrics.expenses)}
            detail="Gastos registrados"
            change={data.metrics.expenseChange}
            tone="red"
            inverse
          />
          <MetricCard
            title="Resultado neto"
            value={currency.format(data.metrics.net)}
            detail="Ingresos menos egresos"
            change={data.metrics.netChange}
            tone={data.metrics.net >= 0 ? "green" : "red"}
          />
          <MetricCard
            title="Movimientos"
            value={data.metrics.transactions.toLocaleString("es-CO")}
            detail="Ingresos y egresos"
          />
          <MetricCard
            title="Ticket promedio"
            value={currency.format(data.metrics.averageTicket)}
            detail="Promedio por venta"
          />
          <MetricCard
            title="Por cobrar"
            value={currency.format(data.metrics.outstanding)}
            detail="Saldo de ventas pendientes"
            tone="orange"
          />
        </div>

        <div className="grid xl:grid-cols-3 gap-5 mb-5">
          <section className="xl:col-span-2 rounded-xl bg-[#141414] border border-white/10 p-5 min-w-0">
            <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
              <div>
                <h2 className="font-serif text-lg text-sterling">Flujo financiero</h2>
                <p className="text-xs text-charcoal mt-1">Evolución de ingresos y egresos</p>
              </div>
              <div className="flex gap-4 text-[10px]">
                <span className="flex items-center gap-1.5 text-charcoal">
                  <i className="w-2 h-2 rounded-full bg-emerald-400" />
                  Ingresos
                </span>
                <span className="flex items-center gap-1.5 text-charcoal">
                  <i className="w-2 h-2 rounded-full bg-red-400" />
                  Egresos
                </span>
              </div>
            </div>
            <TrendChart points={data.trend} />
          </section>
          <section className="rounded-xl bg-[#141414] border border-white/10 p-5">
            <h2 className="font-serif text-lg text-sterling">Composición financiera</h2>
            <p className="text-xs text-charcoal mt-1">Peso de entradas y salidas</p>
            <div className="h-52 flex items-center justify-center">
              <div
                className="w-40 h-40 rounded-full flex items-center justify-center"
                style={{
                  background:
                    totalFlow > 0
                      ? `conic-gradient(#34d399 0 ${incomeShare}%, #f87171 ${incomeShare}% 100%)`
                      : "#242424",
                }}
              >
                <div className="w-28 h-28 rounded-full bg-[#141414] flex flex-col items-center justify-center">
                  <span className="text-2xl font-semibold text-white">
                    {incomeShare.toFixed(0)}%
                  </span>
                  <span className="text-[10px] text-charcoal">ingresos</span>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="bg-emerald-500/10 rounded-lg p-3">
                <p className="text-emerald-400">Entradas</p>
                <b className="text-white block mt-1">{currency.format(data.metrics.income)}</b>
              </div>
              <div className="bg-red-500/10 rounded-lg p-3">
                <p className="text-red-400">Salidas</p>
                <b className="text-white block mt-1">{currency.format(data.metrics.expenses)}</b>
              </div>
            </div>
          </section>
        </div>

        <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-5 mb-5">
          <RankingCard
            title="Servicios más solicitados"
            subtitle="Cantidad vendida e ingresos generados"
            items={data.topServices}
            mode="count"
            accent="bg-emerald-500"
          />
          <RankingCard
            title="Productos más vendidos"
            subtitle="Unidades vendidas e ingresos generados"
            items={data.topProducts}
            mode="count"
            accent="bg-blue-500"
          />
          <RankingCard
            title="Clientes de mayor valor"
            subtitle="Compras acumuladas y frecuencia"
            items={data.topClients}
            accent="bg-violet-500"
          />
          <RankingCard
            title="Principales gastos"
            subtitle="Rubros con mayor salida de dinero"
            items={data.topExpenses}
            accent="bg-red-500"
          />
        </div>

        <div className="grid xl:grid-cols-3 gap-5 mb-5">
          <DemandHeatmap data={data.demand} />
          <section className="rounded-xl bg-[#141414] border border-white/10 p-5">
            <h3 className="font-serif text-lg text-sterling">Demanda por día</h3>
            <p className="text-xs text-charcoal mt-1 mb-5">Comparación semanal de citas</p>
            <div className="space-y-4">
              {demandByDay.map((day) => {
                const max = Math.max(1, ...demandByDay.map((item) => item.value));
                return (
                  <div key={day.label}>
                    <div className="flex justify-between text-xs mb-1.5">
                      <span className="text-sterling">{day.label}</span>
                      <b className="text-white">{day.value}</b>
                    </div>
                    <div className="h-2 bg-white/5 rounded-full">
                      <div
                        className="h-full bg-cognac rounded-full"
                        style={{ width: `${(day.value / max) * 100}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>

        <section className="rounded-xl bg-[#141414] border border-white/10 overflow-hidden mb-8">
          <div className="p-5 border-b border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h2 className="font-serif text-lg text-sterling">Trazabilidad de movimientos</h2>
              <p className="text-xs text-charcoal mt-1">
                Registro financiero del período, ordenado del más reciente al más antiguo
              </p>
            </div>
            <span className="text-[10px] uppercase tracking-wider text-charcoal">
              25 por página
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left min-w-[860px]">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-charcoal">
                  <th className="px-5 py-3 font-medium">Fecha</th>
                  <th className="px-5 py-3 font-medium">Tipo</th>
                  <th className="px-5 py-3 font-medium">Descripción</th>
                  <th className="px-5 py-3 font-medium">Cliente</th>
                  <th className="px-5 py-3 font-medium">Estado</th>
                  <th className="px-5 py-3 font-medium text-right">Monto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {data.movements.map((movement) => (
                  <tr
                    key={movement.id}
                    tabIndex={0}
                    aria-label={`Ver detalle de ${movement.description}`}
                    onClick={() => setSelectedMovement(movement)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setSelectedMovement(movement);
                      }
                    }}
                    className="hover:bg-white/5 focus-visible:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cognac cursor-pointer transition-colors"
                  >
                    <td className="px-5 py-3 text-xs text-sterling whitespace-nowrap">
                      {new Date(movement.createdAt).toLocaleDateString("es-CO")}
                      <span className="block text-[10px] text-charcoal mt-0.5">
                        {new Date(movement.createdAt).toLocaleTimeString("es-CO", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={`text-[10px] uppercase font-bold px-2 py-1 rounded ${movement.type === "INCOME" ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"}`}
                      >
                        {movement.type === "INCOME" ? "Ingreso" : "Egreso"}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-sm text-sterling max-w-[260px] truncate">
                      {movement.description}
                    </td>
                    <td className="px-5 py-3 text-xs text-charcoal">{movement.clientName}</td>
                    <td className="px-5 py-3 text-xs">
                      <span
                        className={
                          movement.status === "PENDING" ? "text-orange-400" : "text-emerald-400"
                        }
                      >
                        {movement.status === "PENDING" ? "Pendiente" : "Completado"}
                      </span>
                    </td>
                    <td
                      className={`px-5 py-3 text-sm font-bold text-right ${movement.type === "INCOME" ? "text-emerald-400" : "text-red-400"}`}
                    >
                      {movement.type === "INCOME" ? "+" : "-"}
                      {currency.format(movement.amount)}
                    </td>
                  </tr>
                ))}
                {data.movements.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-5 py-12 text-center text-sm text-charcoal">
                      No existen movimientos para el período seleccionado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="p-4 border-t border-white/10 flex justify-between items-center">
            <button
              onClick={() => navigate({ cursor: null })}
              disabled={!searchParams.get("cursor")}
              className="text-xs text-charcoal hover:text-white disabled:opacity-30 disabled:pointer-events-none"
            >
              Volver al inicio
            </button>
            <button
              onClick={() => data.nextCursor && navigate({ cursor: data.nextCursor })}
              disabled={!data.nextCursor}
              className="bg-white/5 hover:bg-white/10 text-sterling px-4 py-2 rounded-lg text-xs font-semibold disabled:opacity-30 disabled:pointer-events-none"
            >
              Siguientes movimientos
            </button>
          </div>
        </section>
      </div>
      {selectedMovement && (
        <MovementDetail movement={selectedMovement} onClose={() => setSelectedMovement(null)} />
      )}
    </div>
  );
}
