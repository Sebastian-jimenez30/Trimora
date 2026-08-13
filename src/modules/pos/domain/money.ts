const MONEY_SCALE = 100;
const QUANTITY_SCALE = 10_000;

function toScaledInteger(value: number | string, scale: number, label: string) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`${label} no es un numero valido`);

  const scaled = Math.round(parsed * scale);
  if (!Number.isSafeInteger(scaled)) throw new Error(`${label} excede el rango permitido`);
  return scaled;
}

export function toMoneyCents(value: number | string) {
  return toScaledInteger(value, MONEY_SCALE, "El monto");
}

export function fromMoneyCents(cents: number) {
  if (!Number.isSafeInteger(cents)) throw new Error("El monto interno no es valido");
  return (cents / MONEY_SCALE).toFixed(2);
}

export function toQuantityUnits(value: number | string) {
  return toScaledInteger(value, QUANTITY_SCALE, "La cantidad");
}

export function fromQuantityUnits(units: number) {
  if (!Number.isSafeInteger(units)) throw new Error("La cantidad interna no es valida");
  return (units / QUANTITY_SCALE).toFixed(4);
}

export function addMoney(...values: Array<number | string>) {
  return values.reduce<number>((total, value) => total + toMoneyCents(value), 0);
}
