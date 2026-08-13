import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { count, eq, inArray, sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import * as schema from "@/core/database/schema";

vi.mock("server-only", () => ({}));

const enabled = process.env.RUN_DATABASE_RESILIENCE === "1" && Boolean(process.env.DATABASE_URL);

function createTestDatabase(connectionString: string) {
  const client = postgres(connectionString, { max: 8, prepare: false, idle_timeout: 5 });
  return { client, database: drizzle(client, { schema }) };
}

function percentile(values: number[], ratio: number) {
  const sorted = [...values].sort((first, second) => first - second);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)] ?? 0;
}

describe.skipIf(!enabled)("resiliencia financiera sobre PostgreSQL real", () => {
  const organizationIds: string[] = [];
  let client: ReturnType<typeof postgres>;
  let database: ReturnType<typeof createTestDatabase>["database"];
  let ledger: typeof import("../server/ledger");
  let cashFlow: typeof import("../cash-flow");

  beforeAll(async () => {
    const testDatabase = createTestDatabase(process.env.DATABASE_URL!);
    client = testDatabase.client;
    database = testDatabase.database;
    ledger = await import("../server/ledger");
    cashFlow = await import("../cash-flow");
  });

  afterEach(async () => {
    for (const organizationId of organizationIds.splice(0)) {
      const transactionRows = await database
        .select({ id: schema.transactions.id })
        .from(schema.transactions)
        .where(eq(schema.transactions.organizationId, organizationId));
      const transactionIds = transactionRows.map((row) => row.id);
      if (transactionIds.length > 0) {
        await database
          .delete(schema.transactionItems)
          .where(inArray(schema.transactionItems.transactionId, transactionIds));
      }
      await database
        .delete(schema.inventoryMovements)
        .where(eq(schema.inventoryMovements.organizationId, organizationId));
      await database
        .delete(schema.transactions)
        .where(eq(schema.transactions.organizationId, organizationId));
      await database
        .delete(schema.products)
        .where(eq(schema.products.organizationId, organizationId));
      await database
        .delete(schema.organizations)
        .where(eq(schema.organizations.id, organizationId));
    }
  });

  afterAll(async () => {
    await client?.end();
  });

  async function seedProduct(stock: string) {
    const organizationId = crypto.randomUUID();
    const productId = crypto.randomUUID();
    organizationIds.push(organizationId);
    await database.insert(schema.organizations).values({
      id: organizationId,
      name: "Carga controlada",
    });
    await database.insert(schema.products).values({
      id: productId,
      organizationId,
      name: "Producto concurrente",
      category: "VENTA",
      currentStock: stock,
      minimumStock: "0.0000",
      salePrice: "10.00",
    });
    return { organizationId, productId };
  }

  it("serializa ventas simultaneas sin vender stock inexistente", async () => {
    const seed = await seedProduct("10.0000");
    const attempts = await Promise.allSettled(
      Array.from({ length: 16 }, () =>
        ledger.createSale(
          {
            organizationId: seed.organizationId,
            clientId: null,
            paymentMethod: "CASH",
            cart: [{ id: seed.productId, type: "PRODUCT", quantity: 1 }],
          },
          { database },
        ),
      ),
    );

    const completed = attempts.filter((attempt) => attempt.status === "fulfilled");
    const rejected = attempts.filter((attempt) => attempt.status === "rejected");
    const [product] = await database
      .select({ stock: schema.products.currentStock })
      .from(schema.products)
      .where(eq(schema.products.id, seed.productId));
    const [sales] = await database
      .select({ value: count() })
      .from(schema.transactions)
      .where(eq(schema.transactions.organizationId, seed.organizationId));

    expect(completed).toHaveLength(10);
    expect(rejected).toHaveLength(6);
    expect(product?.stock).toBe("0.0000");
    expect(sales?.value).toBe(10);
  });

  it("mantiene el presupuesto p95 y no agota conexiones bajo lecturas concurrentes", async () => {
    const seed = await seedProduct("1.0000");
    const base = new Date("2026-01-01T00:00:00.000Z");
    await database.insert(schema.transactions).values(
      Array.from({ length: 1_200 }, (_, index) => ({
        organizationId: seed.organizationId,
        type: "EXPENSE",
        totalAmount: "1.00",
        paidAmount: "0.00",
        paymentMethod: "CASH",
        status: "COMPLETED",
        createdAt: new Date(base.getTime() + index * 60_000),
      })),
    );

    const [connectionsBefore] = await database.execute<{ count: number }>(sql`
      select count(*)::int as count from pg_stat_activity where datname = current_database()
    `);
    const timings = await Promise.all(
      Array.from({ length: 24 }, async () => {
        const startedAt = performance.now();
        const page = await cashFlow.getCashEntriesPage(
          seed.organizationId,
          base,
          new Date(base.getTime() + 2_000 * 60_000),
          undefined,
          50,
        );
        expect(page).toHaveLength(50);
        expect(new Set(page.map((entry) => entry.id)).size).toBe(50);
        return performance.now() - startedAt;
      }),
    );
    const [connectionsAfter] = await database.execute<{ count: number }>(sql`
      select count(*)::int as count from pg_stat_activity where datname = current_database()
    `);
    const budget = Number(process.env.RESILIENCE_QUERY_P95_MS ?? 2_500);

    expect(percentile(timings, 0.95)).toBeLessThanOrEqual(budget);
    expect(connectionsAfter.count - connectionsBefore.count).toBeLessThanOrEqual(8);
  });
});
