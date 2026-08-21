import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";
import { E2E_IDS, E2E_PASSWORD, E2E_USERS } from "./constants";

function requiredEnvironment(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`La variable ${name} es obligatoria para preparar los E2E`);
  return value;
}

function bogotaDate(offsetDays = 0) {
  const date = new Date(Date.now() + offsetDays * 86_400_000);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

export default async function globalSetup() {
  const supabaseUrl = requiredEnvironment("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = requiredEnvironment("SUPABASE_SECRET_KEY");
  const databaseUrl = requiredEnvironment("DATABASE_URL");
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: existingUsers, error: listError } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (listError) throw listError;

  const seedEmails = new Set<string>(Object.values(E2E_USERS).map((user) => user.email));
  for (const user of existingUsers.users) {
    if (user.email && seedEmails.has(user.email)) {
      const { error } = await admin.auth.admin.deleteUser(user.id);
      if (error) throw error;
    }
  }

  const userIds = new Map<string, string>();
  for (const user of Object.values(E2E_USERS)) {
    const { data, error } = await admin.auth.admin.createUser({
      email: user.email,
      password: E2E_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: user.name },
    });
    if (error) throw error;
    userIds.set(user.email, data.user.id);
  }

  const sql = postgres(databaseUrl, { max: 1, prepare: false });
  const now = new Date();
  const appointmentStart = new Date(`${bogotaDate(1)}T10:00:00-05:00`);
  const appointmentEnd = new Date(`${bogotaDate(1)}T10:40:00-05:00`);

  try {
    await sql.begin(async (transaction) => {
      await transaction`INSERT INTO organizations (id, name) VALUES
        (${E2E_IDS.organization}, 'Trimora E2E'),
        (${E2E_IDS.otherOrganization}, 'Tenant privado E2E')`;
      await transaction`INSERT INTO organization_members (id, organization_id, user_id, role) VALUES
        (${E2E_IDS.adminMembership}, ${E2E_IDS.organization}, ${userIds.get(E2E_USERS.admin.email)!}, 'ADMIN'),
        (${E2E_IDS.barberMembership}, ${E2E_IDS.organization}, ${userIds.get(E2E_USERS.barber.email)!}, 'BARBER'),
        (${E2E_IDS.outsiderMembership}, ${E2E_IDS.otherOrganization}, ${userIds.get(E2E_USERS.outsider.email)!}, 'ADMIN')`;
      await transaction`INSERT INTO services (id, organization_id, name, description, duration_minutes, price) VALUES
        (${E2E_IDS.service}, ${E2E_IDS.organization}, 'Corte E2E', 'Servicio determinista', 40, 25000)`;
      await transaction`INSERT INTO products
        (id, organization_id, name, description, category, current_stock, minimum_stock, sale_price, cost_price)
        VALUES
        (${E2E_IDS.product}, ${E2E_IDS.organization}, 'Cera E2E', 'Producto de venta', 'VENTA', 9, 1, 15000, 8000),
        (${E2E_IDS.consumable}, ${E2E_IDS.organization}, 'Gel E2E', 'Consumible de servicio', 'CONSUMO', 50, 5, NULL, 1000)`;
      await transaction`INSERT INTO service_materials (service_id, product_id, quantity_used)
        VALUES (${E2E_IDS.service}, ${E2E_IDS.consumable}, 1)`;
      await transaction`INSERT INTO clients
        (id, organization_id, first_name, last_name, phone, email, notes) VALUES
        (${E2E_IDS.client}, ${E2E_IDS.organization}, 'Ana', 'E2E', '3000000001', 'ana.e2e@trimora.test', 'Cliente base'),
        (${E2E_IDS.debtor}, ${E2E_IDS.organization}, 'Deudor', 'E2E', '3000000002', 'deudor.e2e@trimora.test', 'Cuenta por cobrar'),
        (${E2E_IDS.otherClient}, ${E2E_IDS.otherOrganization}, 'Cliente Secreto', 'Otro Tenant', NULL, NULL, NULL)`;
      await transaction`INSERT INTO appointments
        (id, organization_id, client_id, staff_id, service_id, start_time, end_time, status, notes)
        VALUES (${E2E_IDS.appointment}, ${E2E_IDS.organization}, ${E2E_IDS.client},
          ${E2E_IDS.adminMembership}, ${E2E_IDS.service}, ${appointmentStart}, ${appointmentEnd},
          'CONFIRMED', 'Cita base E2E')`;
      await transaction`INSERT INTO transactions
        (id, organization_id, client_id, staff_id, type, total_amount, payment_method, status, paid_amount, notes, created_at)
        VALUES
        (${E2E_IDS.completedTransaction}, ${E2E_IDS.organization}, ${E2E_IDS.client}, ${E2E_IDS.adminMembership},
          'INCOME', 40000, 'CASH', 'COMPLETED', 40000, 'Corte E2E, Cera E2E', ${now}),
        (${E2E_IDS.debtTransaction}, ${E2E_IDS.organization}, ${E2E_IDS.debtor}, ${E2E_IDS.adminMembership},
          'INCOME', 25000, 'CREDIT', 'PENDING', 5000, 'Corte E2E', ${now})`;
      await transaction`INSERT INTO transaction_items
        (id, transaction_id, item_type, item_id, quantity, unit_price, subtotal) VALUES
        (${E2E_IDS.completedItemService}, ${E2E_IDS.completedTransaction}, 'SERVICE', ${E2E_IDS.service}, 1, 25000, 25000),
        (${E2E_IDS.completedItemProduct}, ${E2E_IDS.completedTransaction}, 'PRODUCT', ${E2E_IDS.product}, 1, 15000, 15000),
        (${E2E_IDS.debtItem}, ${E2E_IDS.debtTransaction}, 'SERVICE', ${E2E_IDS.service}, 1, 25000, 25000)`;
      await transaction`INSERT INTO transaction_payments
        (id, transaction_id, amount, payment_method, created_at) VALUES
        (${E2E_IDS.completedPayment}, ${E2E_IDS.completedTransaction}, 40000, 'CASH', ${now}),
        (${E2E_IDS.debtPayment}, ${E2E_IDS.debtTransaction}, 5000, 'CASH', ${now})`;
      await transaction`INSERT INTO transaction_payment_allocations
        (id, organization_id, transaction_id, payment_id, transaction_item_id, amount, created_at)
        VALUES (${E2E_IDS.debtPaymentAllocation}, ${E2E_IDS.organization},
          ${E2E_IDS.debtTransaction}, ${E2E_IDS.debtPayment}, ${E2E_IDS.debtItem}, 5000, ${now})`;
      await transaction`INSERT INTO inventory_movements
        (id, organization_id, product_id, transaction_id, type, quantity, previous_stock, new_stock, notes)
        VALUES (${E2E_IDS.inventoryMovement}, ${E2E_IDS.organization}, ${E2E_IDS.product},
          ${E2E_IDS.completedTransaction}, 'OUT', 1, 10, 9, 'Venta base E2E')`;
    });
  } finally {
    await sql.end();
  }
}
