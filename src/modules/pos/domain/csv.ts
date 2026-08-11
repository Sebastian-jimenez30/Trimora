import { formatInTimeZone } from "date-fns-tz";

const TIMEZONE = "America/Bogota";
const CSV_HEADER =
  "ID_Transaccion,Fecha,Hora,Tipo,MetodoPago,Estado,Total_Tx,Abonado_Tx,Item_Nombre,Cantidad,Precio_Unitario,Subtotal";

type ReportEntry = {
  entry: {
    transactionId: string;
    amount: string;
    paymentMethod: string | null;
    createdAt: Date;
  };
  transaction: {
    id: string;
    type: string;
    totalAmount: string;
    status: string;
    notes: string | null;
  };
  description: string | null;
  items: Array<{
    name: string;
    quantity: string;
    unitPrice: string;
    subtotal: string;
  }>;
};

function csvCell(value: string | number) {
  const stringValue = String(value);
  const protectedValue = /^[=+\-@]/u.test(stringValue) ? `'${stringValue}` : stringValue;
  return `"${protectedValue.replaceAll('"', '""')}"`;
}

export function buildFinancialReportCsv(entries: ReportEntry[]) {
  const rows = [CSV_HEADER];

  for (const { entry, transaction, description, items } of entries) {
    const common = [
      csvCell(transaction.id),
      formatInTimeZone(entry.createdAt, TIMEZONE, "yyyy-MM-dd"),
      formatInTimeZone(entry.createdAt, TIMEZONE, "hh:mm a"),
      transaction.type === "INCOME" ? "VENTA" : "GASTO",
      csvCell(entry.paymentMethod ?? ""),
      csvCell(transaction.status),
      transaction.totalAmount,
      entry.amount,
    ];

    if (items.length === 0) {
      const itemName =
        transaction.type === "EXPENSE"
          ? description || transaction.notes || "Gasto sin descripcion"
          : description || transaction.notes || "Venta sin detalle registrado";
      rows.push(
        [...common, csvCell(itemName), "1", transaction.totalAmount, transaction.totalAmount].join(
          ",",
        ),
      );
      continue;
    }

    for (const item of items) {
      const itemRow = [...common, csvCell(item.name), item.quantity, item.unitPrice, item.subtotal];
      rows.push(itemRow.join(","));
    }
  }

  return `${rows.join("\n")}\n`;
}
