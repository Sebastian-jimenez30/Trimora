import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { asc, eq, inArray, sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import * as schema from "@/core/database/schema";

vi.mock("server-only", () => ({}));

const enabled = process.env.RUN_DATABASE_INTEGRATION === "1" && Boolean(process.env.DATABASE_URL);

function createTestDatabase(connectionString: string) {
  const client = postgres(connectionString, { max: 5, prepare: false });
  return { client, database: drizzle(client, { schema }) };
}

type TestDatabase = ReturnType<typeof createTestDatabase>["database"];
type Seed = Awaited<ReturnType<typeof seedCatalog>>;

let client: ReturnType<typeof postgres>;
let database: TestDatabase;
let currentSeed: Seed | null = null;
let ledger: typeof import("../server/ledger");
let cashFlow: typeof import("../cash-flow");
let serviceCatalog: typeof import("@/modules/services/server/catalog");

async function seedCatalog() {
  const organizationId = crypto.randomUUID();
  const firstClientId = crypto.randomUUID();
  const secondClientId = crypto.randomUUID();
  const saleProductId = crypto.randomUUID();
  const consumableId = crypto.randomUUID();
  const serviceId = crypto.randomUUID();

  await database
    .insert(schema.organizations)
    .values({ id: organizationId, name: "Prueba dominio" });
  await database.insert(schema.clients).values([
    { id: firstClientId, organizationId, firstName: "Cliente uno" },
    { id: secondClientId, organizationId, firstName: "Cliente dos" },
  ]);
  await database.insert(schema.products).values([
    {
      id: saleProductId,
      organizationId,
      name: "Cera",
      category: "VENTA",
      currentStock: "5.0000",
      minimumStock: "0.0000",
      salePrice: "10.00",
    },
    {
      id: consumableId,
      organizationId,
      name: "Shampoo",
      category: "CONSUMO",
      currentStock: "2.0000",
      minimumStock: "0.0000",
      salePrice: "0.00",
    },
  ]);
  await database.insert(schema.services).values({
    id: serviceId,
    organizationId,
    name: "Corte",
    durationMinutes: 45,
    price: "20.00",
  });
  await database.insert(schema.serviceMaterials).values({
    serviceId,
    productId: consumableId,
    quantityUsed: "0.2500",
  });

  return {
    organizationId,
    firstClientId,
    secondClientId,
    saleProductId,
    consumableId,
    serviceId,
    userId: null as string | null,
  };
}

async function addStaff(seed: Seed) {
  const userId = crypto.randomUUID();
  const staffId = crypto.randomUUID();
  await database.execute(sql`
    insert into auth.users (id, email, aud, role)
    values (${userId}, ${`${userId}@trimora.test`}, 'authenticated', 'authenticated')
  `);
  await database.insert(schema.organizationMembers).values({
    id: staffId,
    organizationId: seed.organizationId,
    userId,
    role: "ADMIN",
  });
  seed.userId = userId;
  return staffId;
}

async function cleanup(seed: Seed | null) {
  if (!seed) return;
  const transactionRows = await database
    .select({ id: schema.transactions.id })
    .from(schema.transactions)
    .where(eq(schema.transactions.organizationId, seed.organizationId));
  const transactionIds = transactionRows.map((row) => row.id);
  if (transactionIds.length > 0) {
    await database
      .delete(schema.transactionItems)
      .where(inArray(schema.transactionItems.transactionId, transactionIds));
  }
  await database
    .delete(schema.auditLogs)
    .where(eq(schema.auditLogs.organizationId, seed.organizationId));
  await database
    .delete(schema.inventoryMovements)
    .where(eq(schema.inventoryMovements.organizationId, seed.organizationId));
  await database
    .delete(schema.transactions)
    .where(eq(schema.transactions.organizationId, seed.organizationId));
  await database
    .delete(schema.appointments)
    .where(eq(schema.appointments.organizationId, seed.organizationId));
  await database
    .delete(schema.serviceMaterials)
    .where(eq(schema.serviceMaterials.serviceId, seed.serviceId));
  await database
    .delete(schema.services)
    .where(eq(schema.services.organizationId, seed.organizationId));
  await database
    .delete(schema.products)
    .where(eq(schema.products.organizationId, seed.organizationId));
  await database
    .delete(schema.clients)
    .where(eq(schema.clients.organizationId, seed.organizationId));
  await database
    .delete(schema.organizationMembers)
    .where(eq(schema.organizationMembers.organizationId, seed.organizationId));
  await database
    .delete(schema.organizations)
    .where(eq(schema.organizations.id, seed.organizationId));
  if (seed.userId) await database.execute(sql`delete from auth.users where id = ${seed.userId}`);
}

describe.skipIf(!enabled)("dominio critico sobre PostgreSQL real", () => {
  beforeAll(async () => {
    const testDatabase = createTestDatabase(process.env.DATABASE_URL!);
    client = testDatabase.client;
    database = testDatabase.database;
    ledger = await import("../server/ledger");
    cashFlow = await import("../cash-flow");
    serviceCatalog = await import("@/modules/services/server/catalog");
  });

  afterEach(async () => {
    await cleanup(currentSeed);
    currentSeed = null;
  });

  afterAll(async () => {
    await client?.end();
  });

  it("persiste ventas simples y multiples con descuento exacto de producto y consumible", async () => {
    const seed = (currentSeed = await seedCatalog());
    const receivedAt = new Date("2026-08-11T16:17:18.000Z");

    const sale = await ledger.createSale(
      {
        organizationId: seed.organizationId,
        clientId: seed.firstClientId,
        paymentMethod: "CASH",
        receivedAt,
        cart: [
          { id: seed.saleProductId, type: "PRODUCT", quantity: 2 },
          { id: seed.serviceId, type: "SERVICE", quantity: 2 },
        ],
      },
      { database },
    );

    const [items, stocks, movements, clientRows, transactionRows] = await Promise.all([
      database
        .select()
        .from(schema.transactionItems)
        .where(eq(schema.transactionItems.transactionId, sale.transactionId)),
      database
        .select({ id: schema.products.id, stock: schema.products.currentStock })
        .from(schema.products)
        .where(eq(schema.products.organizationId, seed.organizationId)),
      database
        .select()
        .from(schema.inventoryMovements)
        .where(eq(schema.inventoryMovements.transactionId, sale.transactionId)),
      database
        .select({ totalSpent: schema.clients.totalSpent })
        .from(schema.clients)
        .where(eq(schema.clients.id, seed.firstClientId)),
      database
        .select()
        .from(schema.transactions)
        .where(eq(schema.transactions.id, sale.transactionId)),
    ]);

    expect(items).toHaveLength(2);
    expect(items.map((item) => item.itemType).sort()).toEqual(["PRODUCT", "SERVICE"]);
    expect(new Map(stocks.map((row) => [row.id, row.stock]))).toEqual(
      new Map([
        [seed.saleProductId, "3.0000"],
        [seed.consumableId, "1.5000"],
      ]),
    );
    expect(movements).toHaveLength(2);
    expect(movements.every((movement) => movement.transactionId === sale.transactionId)).toBe(true);
    expect(clientRows[0]?.totalSpent).toBe("60.00");
    expect(transactionRows[0]?.createdAt.toISOString()).toBe(receivedAt.toISOString());

    await database
      .update(schema.clients)
      .set({ totalSpent: "999.00" })
      .where(eq(schema.clients.id, seed.firstClientId));
    await ledger.rebuildClientTotals(seed.organizationId, database);
    const [reconciledClient] = await database
      .select({ totalSpent: schema.clients.totalSpent })
      .from(schema.clients)
      .where(eq(schema.clients.id, seed.firstClientId));
    expect(reconciledClient?.totalSpent).toBe("60.00");

    const simpleSale = await ledger.createSale(
      {
        organizationId: seed.organizationId,
        clientId: seed.secondClientId,
        paymentMethod: "CARD",
        cart: [{ id: seed.saleProductId, type: "PRODUCT", quantity: 1 }],
      },
      { database },
    );
    const simpleItems = await database
      .select()
      .from(schema.transactionItems)
      .where(eq(schema.transactionItems.transactionId, simpleSale.transactionId));
    expect(simpleItems).toHaveLength(1);
  });

  it("revierte venta, items, total del cliente e inventario ante un fallo intermedio", async () => {
    const seed = (currentSeed = await seedCatalog());

    await expect(
      ledger.createSale(
        {
          organizationId: seed.organizationId,
          clientId: seed.firstClientId,
          paymentMethod: "CASH",
          cart: [{ id: seed.saleProductId, type: "PRODUCT", quantity: 1 }],
        },
        {
          database,
          hooks: { afterInventoryUpdated: () => Promise.reject(new Error("fallo inyectado")) },
        },
      ),
    ).rejects.toThrow("fallo inyectado");

    const [transactionRows, movementRows, productRows, clientRows] = await Promise.all([
      database
        .select()
        .from(schema.transactions)
        .where(eq(schema.transactions.organizationId, seed.organizationId)),
      database
        .select()
        .from(schema.inventoryMovements)
        .where(eq(schema.inventoryMovements.organizationId, seed.organizationId)),
      database
        .select({ stock: schema.products.currentStock })
        .from(schema.products)
        .where(eq(schema.products.id, seed.saleProductId)),
      database
        .select({ totalSpent: schema.clients.totalSpent })
        .from(schema.clients)
        .where(eq(schema.clients.id, seed.firstClientId)),
    ]);
    expect(transactionRows).toHaveLength(0);
    expect(movementRows).toHaveLength(0);
    expect(productRows[0]?.stock).toBe("5.0000");
    expect(clientRows[0]?.totalSpent).toBe("0.00");
  });

  it("distribuye abonos FIFO y registra la fecha real de entrada del dinero", async () => {
    const seed = (currentSeed = await seedCatalog());
    await expect(
      ledger.createSale(
        {
          organizationId: seed.organizationId,
          clientId: null,
          paymentMethod: "CREDIT",
          initialPaidAmount: 0,
          cart: [{ id: seed.serviceId, type: "SERVICE", quantity: 1 }],
        },
        { database },
      ),
    ).rejects.toThrow("cliente");
    const first = await ledger.createSale(
      {
        organizationId: seed.organizationId,
        clientId: seed.firstClientId,
        paymentMethod: "CREDIT",
        initialPaidAmount: 0,
        receivedAt: new Date("2026-08-01T14:00:00.000Z"),
        cart: [{ id: seed.serviceId, type: "SERVICE", quantity: 1 }],
      },
      { database },
    );
    const second = await ledger.createSale(
      {
        organizationId: seed.organizationId,
        clientId: seed.firstClientId,
        paymentMethod: "CREDIT",
        initialPaidAmount: 0,
        receivedAt: new Date("2026-08-02T14:00:00.000Z"),
        cart: [{ id: seed.serviceId, type: "SERVICE", quantity: 2 }],
      },
      { database },
    );
    const paidAt = new Date("2026-08-11T18:43:21.000Z");

    const result = await ledger.recordClientPayment({
      organizationId: seed.organizationId,
      clientId: seed.firstClientId,
      amount: 30,
      paymentMethod: "TRANSFER",
      receivedAt: paidAt,
      database,
    });
    const transactionRows = await database
      .select({
        id: schema.transactions.id,
        paid: schema.transactions.paidAmount,
        status: schema.transactions.status,
      })
      .from(schema.transactions)
      .where(eq(schema.transactions.organizationId, seed.organizationId))
      .orderBy(asc(schema.transactions.createdAt));
    const paymentRows = await database
      .select()
      .from(schema.transactionPayments)
      .orderBy(asc(schema.transactionPayments.createdAt), asc(schema.transactionPayments.id));

    expect(result.allocationCount).toBe(2);
    expect(transactionRows).toEqual([
      { id: first.transactionId, paid: "20.00", status: "COMPLETED" },
      { id: second.transactionId, paid: "10.00", status: "PENDING" },
    ]);
    expect(paymentRows.map((payment) => payment.amount)).toEqual(["20.00", "10.00"]);
    expect(paymentRows.every((payment) => payment.createdAt.getTime() === paidAt.getTime())).toBe(
      true,
    );
    await expect(
      ledger.recordClientPayment({
        organizationId: seed.organizationId,
        clientId: seed.firstClientId,
        amount: 31,
        paymentMethod: "CASH",
        database,
      }),
    ).rejects.toThrow("supera la deuda total");
    await expect(
      ledger.recordClientPayment({
        organizationId: seed.organizationId,
        clientId: seed.firstClientId,
        amount: -1,
        paymentMethod: "CASH",
        database,
      }),
    ).rejects.toThrow("mayor a cero");

    await ledger.recordTransactionPayment({
      organizationId: seed.organizationId,
      transactionId: second.transactionId,
      amount: 30,
      paymentMethod: "CARD",
      database,
    });
    const [settledTransaction] = await database
      .select({ paid: schema.transactions.paidAmount, status: schema.transactions.status })
      .from(schema.transactions)
      .where(eq(schema.transactions.id, second.transactionId));
    expect(settledTransaction).toEqual({ paid: "40.00", status: "COMPLETED" });
  });

  it("serializa abonos simultaneos y nunca cobra por encima de la deuda", async () => {
    const seed = (currentSeed = await seedCatalog());
    const sale = await ledger.createSale(
      {
        organizationId: seed.organizationId,
        clientId: seed.firstClientId,
        paymentMethod: "CREDIT",
        initialPaidAmount: 0,
        cart: [{ id: seed.serviceId, type: "SERVICE", quantity: 2 }],
      },
      { database },
    );
    const paymentInput = {
      organizationId: seed.organizationId,
      transactionId: sale.transactionId,
      amount: 30,
      paymentMethod: "CASH" as const,
      database,
    };

    const results = await Promise.allSettled([
      ledger.recordTransactionPayment(paymentInput),
      ledger.recordTransactionPayment(paymentInput),
    ]);
    const [transactionRow] = await database
      .select({ paid: schema.transactions.paidAmount, status: schema.transactions.status })
      .from(schema.transactions)
      .where(eq(schema.transactions.id, sale.transactionId));
    const paymentRows = await database
      .select()
      .from(schema.transactionPayments)
      .where(eq(schema.transactionPayments.transactionId, sale.transactionId));

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(transactionRow).toEqual({ paid: "30.00", status: "PENDING" });
    expect(paymentRows).toHaveLength(1);
  });

  it("restaura inventario y total gastado al eliminar una venta", async () => {
    const seed = (currentSeed = await seedCatalog());
    const sale = await ledger.createSale(
      {
        organizationId: seed.organizationId,
        clientId: seed.firstClientId,
        paymentMethod: "CASH",
        cart: [{ id: seed.saleProductId, type: "PRODUCT", quantity: 2 }],
      },
      { database },
    );

    await ledger.removeTransaction({
      organizationId: seed.organizationId,
      transactionId: sale.transactionId,
      database,
    });
    const [productRows, clientRows, transactionRows] = await Promise.all([
      database
        .select({ stock: schema.products.currentStock })
        .from(schema.products)
        .where(eq(schema.products.id, seed.saleProductId)),
      database
        .select({ totalSpent: schema.clients.totalSpent })
        .from(schema.clients)
        .where(eq(schema.clients.id, seed.firstClientId)),
      database
        .select()
        .from(schema.transactions)
        .where(eq(schema.transactions.id, sale.transactionId)),
    ]);
    expect(productRows[0]?.stock).toBe("5.0000");
    expect(clientRows[0]?.totalSpent).toBe("0.00");
    expect(transactionRows).toHaveLength(0);
  });

  it("actualiza la duracion persistida de citas futuras del servicio", async () => {
    const seed = (currentSeed = await seedCatalog());
    const staffId = await addStaff(seed);
    const startTime = new Date("2026-09-01T14:00:00.000Z");
    const appointmentId = crypto.randomUUID();
    await database.insert(schema.appointments).values({
      id: appointmentId,
      organizationId: seed.organizationId,
      clientId: seed.firstClientId,
      staffId,
      serviceId: seed.serviceId,
      startTime,
      endTime: new Date(startTime.getTime() + 45 * 60_000),
      status: "CONFIRMED",
    });

    await serviceCatalog.updateServiceCatalogEntry({
      organizationId: seed.organizationId,
      serviceId: seed.serviceId,
      values: {
        name: "Corte",
        description: "",
        durationMinutes: 40,
        price: 20,
        isActive: true,
      },
      materials: [{ productId: seed.consumableId, quantityUsed: 0.25 }],
      effectiveAt: new Date("2026-08-11T00:00:00.000Z"),
      database,
    });
    const [appointment] = await database
      .select({ endTime: schema.appointments.endTime })
      .from(schema.appointments)
      .where(eq(schema.appointments.id, appointmentId));

    expect(appointment?.endTime.toISOString()).toBe("2026-09-01T14:40:00.000Z");
  });

  it("pagina el flujo de caja sin duplicados ni omisiones", async () => {
    const seed = (currentSeed = await seedCatalog());
    const base = new Date("2026-08-11T12:00:00.000Z");
    await database.insert(schema.transactions).values(
      Array.from({ length: 27 }, (_, index) => ({
        organizationId: seed.organizationId,
        type: "EXPENSE",
        totalAmount: "1.00",
        paidAmount: "0.00",
        paymentMethod: "CASH",
        status: "COMPLETED",
        createdAt: new Date(base.getTime() + index * 1_000),
      })),
    );

    const ids: string[] = [];
    let cursor: { createdAt: Date; id: string } | undefined;
    do {
      const page = await cashFlow.getCashEntriesPage(
        seed.organizationId,
        base,
        new Date(base.getTime() + 60_000),
        cursor,
        10,
      );
      ids.push(...page.map((entry) => entry.id));
      const last = page.at(-1);
      cursor = page.length === 10 && last ? { createdAt: last.createdAt, id: last.id } : undefined;
      if (page.length < 10) break;
    } while (cursor);

    expect(ids).toHaveLength(27);
    expect(new Set(ids).size).toBe(27);
  });
});
