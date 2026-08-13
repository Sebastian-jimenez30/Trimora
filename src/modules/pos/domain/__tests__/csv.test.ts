import { describe, expect, it } from "vitest";
import { buildFinancialReportCsv } from "../csv";

describe("exportacion financiera por movimiento", () => {
  it("conserva el total original y separa el efectivo de un abono parcial", () => {
    const csv = buildFinancialReportCsv([
      {
        entry: {
          transactionId: "tx-1",
          amount: "25.00",
          paymentMethod: "TRANSFER",
          createdAt: new Date("2026-08-11T15:30:00.000Z"),
        },
        transaction: {
          id: "tx-1",
          type: "INCOME",
          totalAmount: "100.00",
          status: "PENDING",
          notes: null,
        },
        description: null,
        items: [
          {
            name: "Corte",
            quantity: "1.00",
            unitPrice: "100.00",
            subtotal: "100.00",
          },
        ],
      },
    ]);

    expect(csv).toContain('"PENDING",100.00,25.00,"Corte",1.00,100.00,100.00');
    expect(csv).toContain("2026-08-11,10:30 AM");
  });

  it("neutraliza formulas en valores de texto", () => {
    const csv = buildFinancialReportCsv([
      {
        entry: {
          transactionId: "tx-2",
          amount: "10.00",
          paymentMethod: "CASH",
          createdAt: new Date("2026-08-11T05:00:00.000Z"),
        },
        transaction: {
          id: "tx-2",
          type: "EXPENSE",
          totalAmount: "10.00",
          status: "COMPLETED",
          notes: null,
        },
        description: '=HYPERLINK("https://invalid")',
        items: [],
      },
    ]);

    expect(csv).toContain('"\'=HYPERLINK(""https://invalid"")"');
  });
});
