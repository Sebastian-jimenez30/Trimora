import {
  pgTable,
  uuid,
  text,
  timestamp,
  numeric,
  integer,
  boolean,
  varchar,
  index,
  uniqueIndex,
  foreignKey,
} from "drizzle-orm/pg-core";

// ----------------------------------------------------------------------
// 1. NÚCLEO SAAS
// ----------------------------------------------------------------------
export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const organizationPublicProfiles = pgTable(
  "organization_public_profiles",
  {
    organizationId: uuid("organization_id")
      .primaryKey()
      .references(() => organizations.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    displayName: text("display_name").notNull(),
    timeZone: text("time_zone").notNull().default("America/Bogota"),
    publicProfileEnabled: boolean("public_profile_enabled").notNull().default(false),
    publicCatalogEnabled: boolean("public_catalog_enabled").notNull().default(false),
    publicBookingEnabled: boolean("public_booking_enabled").notNull().default(false),
    publicSelfServiceEnabled: boolean("public_self_service_enabled").notNull().default(false),
    publicChatEnabled: boolean("public_chat_enabled").notNull().default(false),
    remindersEnabled: boolean("reminders_enabled").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("organization_public_profiles_slug_uidx").on(table.slug)],
);

export const publicBookingSettings = pgTable("public_booking_settings", {
  organizationId: uuid("organization_id")
    .primaryKey()
    .references(() => organizations.id, { onDelete: "cascade" }),
  minimumNoticeMinutes: integer("minimum_notice_minutes").notNull().default(60),
  maximumAdvanceDays: integer("maximum_advance_days").notNull().default(60),
  slotIntervalMinutes: integer("slot_interval_minutes").notNull().default(15),
  bufferMinutes: integer("buffer_minutes").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const organizationMembers = pgTable(
  "organization_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .references(() => organizations.id)
      .notNull(),
    userId: uuid("user_id").notNull(), // ref to auth.users en Supabase
    role: text("role").notNull().default("BARBER"), // ADMIN, BARBER, RECEPTIONIST
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("organization_members_org_user_uidx").on(table.organizationId, table.userId),
    index("organization_members_user_org_idx").on(table.userId, table.organizationId),
    index("organization_members_org_role_idx").on(table.organizationId, table.role),
  ],
);

export const platformAdmins = pgTable("platform_admins", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().unique(),
  grantedBy: uuid("granted_by"),
  reason: text("reason").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
});

export const invitations = pgTable(
  "invitations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .references(() => organizations.id)
      .notNull(),
    email: text("email").notNull(),
    role: text("role").notNull().default("BARBER"),
    token: uuid("token").defaultRandom().notNull(),
    status: text("status").notNull().default("PENDING"), // PENDING, ACCEPTED
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("invitations_token_uidx").on(table.token),
    index("invitations_org_status_idx").on(table.organizationId, table.status),
  ],
);

// ----------------------------------------------------------------------
// 2. CATÁLOGO E INTELIGENCIA DE INVENTARIO
// ----------------------------------------------------------------------
export const services = pgTable(
  "services",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .references(() => organizations.id)
      .notNull(),
    name: text("name").notNull(),
    description: text("description"),
    durationMinutes: integer("duration_minutes").notNull().default(30),
    price: numeric("price", { precision: 10, scale: 2 }).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
  },
  (table) => [index("services_org_idx").on(table.organizationId)],
);

export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .references(() => organizations.id)
      .notNull(),
    name: text("name").notNull(),
    description: text("description"),
    category: text("category").notNull(), // VENTA, CONSUMO
    currentStock: numeric("current_stock", { precision: 12, scale: 4 }).notNull().default("0"),
    minimumStock: numeric("minimum_stock", { precision: 12, scale: 4 }).notNull().default("0"),
    salePrice: numeric("sale_price", { precision: 10, scale: 2 }),
    costPrice: numeric("cost_price", { precision: 10, scale: 2 }),
    isActive: boolean("is_active").default(true).notNull(),
  },
  (table) => [index("products_org_idx").on(table.organizationId)],
);

export const serviceMaterials = pgTable(
  "service_materials",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    serviceId: uuid("service_id")
      .references(() => services.id)
      .notNull(),
    productId: uuid("product_id")
      .references(() => products.id)
      .notNull(),
    quantityUsed: numeric("quantity_used", { precision: 10, scale: 4 }).notNull(),
  },
  (table) => [
    uniqueIndex("service_materials_service_product_uidx").on(table.serviceId, table.productId),
    index("service_materials_product_idx").on(table.productId),
  ],
);

export const staffServices = pgTable(
  "staff_services",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .references(() => organizations.id, { onDelete: "cascade" })
      .notNull(),
    staffId: uuid("staff_id")
      .references(() => organizationMembers.id, { onDelete: "cascade" })
      .notNull(),
    serviceId: uuid("service_id")
      .references(() => services.id, { onDelete: "cascade" })
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("staff_services_org_staff_service_uidx").on(
      table.organizationId,
      table.staffId,
      table.serviceId,
    ),
    index("staff_services_org_service_staff_idx").on(
      table.organizationId,
      table.serviceId,
      table.staffId,
    ),
    foreignKey({
      columns: [table.organizationId, table.staffId],
      foreignColumns: [organizationMembers.organizationId, organizationMembers.id],
      name: "staff_services_org_staff_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.organizationId, table.serviceId],
      foreignColumns: [services.organizationId, services.id],
      name: "staff_services_org_service_fk",
    }).onDelete("cascade"),
  ],
);

export const availabilityWindows = pgTable(
  "availability_windows",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .references(() => organizations.id, { onDelete: "cascade" })
      .notNull(),
    staffId: uuid("staff_id").references(() => organizationMembers.id, {
      onDelete: "cascade",
    }),
    dayOfWeek: integer("day_of_week").notNull(),
    startMinute: integer("start_minute").notNull(),
    endMinute: integer("end_minute").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("availability_windows_org_staff_day_idx").on(
      table.organizationId,
      table.staffId,
      table.dayOfWeek,
    ),
    foreignKey({
      columns: [table.organizationId, table.staffId],
      foreignColumns: [organizationMembers.organizationId, organizationMembers.id],
      name: "availability_windows_org_staff_fk",
    }).onDelete("cascade"),
  ],
);

export const availabilityBlocks = pgTable(
  "availability_blocks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .references(() => organizations.id, { onDelete: "cascade" })
      .notNull(),
    staffId: uuid("staff_id").references(() => organizationMembers.id, {
      onDelete: "cascade",
    }),
    kind: text("kind").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("availability_blocks_org_starts_ends_idx").on(
      table.organizationId,
      table.startsAt,
      table.endsAt,
    ),
    index("availability_blocks_org_staff_starts_idx").on(
      table.organizationId,
      table.staffId,
      table.startsAt,
    ),
    foreignKey({
      columns: [table.organizationId, table.staffId],
      foreignColumns: [organizationMembers.organizationId, organizationMembers.id],
      name: "availability_blocks_org_staff_fk",
    }).onDelete("cascade"),
  ],
);

// ----------------------------------------------------------------------
// 3. OPERACIÓN DIARIA
// ----------------------------------------------------------------------
export const clients = pgTable(
  "clients",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .references(() => organizations.id)
      .notNull(),
    firstName: text("first_name").notNull(),
    lastName: text("last_name"),
    phone: text("phone"),
    email: text("email"),
    notes: text("notes"),
    totalSpent: numeric("total_spent", { precision: 10, scale: 2 }).default("0"),
    lastVisit: timestamp("last_visit", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("clients_org_idx").on(table.organizationId)],
);

export const appointments = pgTable(
  "appointments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .references(() => organizations.id)
      .notNull(),
    clientId: uuid("client_id")
      .references(() => clients.id)
      .notNull(),
    staffId: uuid("staff_id")
      .references(() => organizationMembers.id)
      .notNull(),
    serviceId: uuid("service_id")
      .references(() => services.id)
      .notNull(),
    startTime: timestamp("start_time", { withTimezone: true }).notNull(),
    endTime: timestamp("end_time", { withTimezone: true }).notNull(),
    status: text("status").default("PENDING").notNull(), // PENDING, CONFIRMED, COMPLETED, CANCELLED
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("appointments_org_start_idx").on(table.organizationId, table.startTime),
    index("appointments_client_idx").on(table.clientId),
    index("appointments_staff_idx").on(table.staffId),
    index("appointments_service_idx").on(table.serviceId),
  ],
);

// ----------------------------------------------------------------------
// 4. POS Y FINANZAS
// ----------------------------------------------------------------------
export const transactions = pgTable(
  "transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .references(() => organizations.id)
      .notNull(),
    clientId: uuid("client_id").references(() => clients.id),
    staffId: uuid("staff_id").references(() => organizationMembers.id), // Quién cobró/atendió
    type: text("type").default("INCOME").notNull(), // INCOME, EXPENSE
    totalAmount: numeric("total_amount", { precision: 10, scale: 2 }).notNull(),
    paymentMethod: text("payment_method"), // CASH, CARD, TRANSFER, CREDIT
    status: text("status").default("COMPLETED").notNull(), // PENDING, COMPLETED, REFUNDED
    paidAmount: numeric("paid_amount", { precision: 10, scale: 2 }).default("0").notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("transactions_org_id_uidx").on(table.organizationId, table.id),
    index("transactions_org_created_idx").on(table.organizationId, table.createdAt),
    index("transactions_client_idx").on(table.clientId),
    index("transactions_staff_idx").on(table.staffId),
    index("transactions_org_status_created_idx").on(
      table.organizationId,
      table.status,
      table.createdAt,
    ),
    index("transactions_org_client_type_status_created_id_idx").on(
      table.organizationId,
      table.clientId,
      table.type,
      table.status,
      table.createdAt,
      table.id,
    ),
  ],
);

export const transactionItems = pgTable(
  "transaction_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    transactionId: uuid("transaction_id")
      .references(() => transactions.id)
      .notNull(),
    itemType: text("item_type").notNull(), // SERVICE, PRODUCT
    itemId: uuid("item_id").notNull(), // ID of service or product
    quantity: numeric("quantity", { precision: 10, scale: 2 }).notNull().default("1"),
    unitPrice: numeric("unit_price", { precision: 10, scale: 2 }).notNull(),
    subtotal: numeric("subtotal", { precision: 10, scale: 2 }).notNull(),
  },
  (table) => [
    index("transaction_items_transaction_idx").on(table.transactionId),
    index("transaction_items_type_item_idx").on(table.itemType, table.itemId),
  ],
);

export const transactionPayments = pgTable(
  "transaction_payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    transactionId: uuid("transaction_id")
      .references(() => transactions.id, { onDelete: "cascade" })
      .notNull(),
    amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
    paymentMethod: text("payment_method").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("transaction_payments_transaction_idx").on(table.transactionId),
    index("transaction_payments_created_transaction_idx").on(table.createdAt, table.transactionId),
  ],
);

export const inventoryMovements = pgTable(
  "inventory_movements",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .references(() => organizations.id, { onDelete: "cascade" })
      .notNull(),
    productId: uuid("product_id")
      .references(() => products.id, { onDelete: "cascade" })
      .notNull(),
    transactionId: uuid("transaction_id"),
    type: varchar("type", { length: 20 }).notNull(), // IN, OUT
    quantity: numeric("quantity", { precision: 12, scale: 4, mode: "number" }).notNull(),
    previousStock: numeric("previous_stock", { precision: 12, scale: 4, mode: "number" }).notNull(),
    newStock: numeric("new_stock", { precision: 12, scale: 4, mode: "number" }).notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("inventory_movements_org_product_created_idx").on(
      table.organizationId,
      table.productId,
      table.createdAt,
    ),
    index("inventory_movements_transaction_idx").on(table.transactionId),
    index("inventory_movements_org_transaction_idx").on(table.organizationId, table.transactionId),
    foreignKey({
      columns: [table.organizationId, table.transactionId],
      foreignColumns: [transactions.organizationId, transactions.id],
      name: "inventory_movements_org_transaction_fk",
    }).onDelete("cascade"),
  ],
);

// ----------------------------------------------------------------------
// 5. ANALÍTICA E HISTÓRICOS
// ----------------------------------------------------------------------
export const dailySummaries = pgTable(
  "daily_summaries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .references(() => organizations.id)
      .notNull(),
    date: timestamp("date", { withTimezone: false }).notNull(),
    totalRevenue: numeric("total_revenue", { precision: 10, scale: 2 }).default("0"),
    appointmentsCount: integer("appointments_count").default(0),
    newClientsCount: integer("new_clients_count").default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("daily_summaries_org_date_uidx").on(table.organizationId, table.date)],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .references(() => organizations.id)
      .notNull(),
    userId: uuid("user_id").notNull(),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id"),
    details: text("details"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("audit_logs_entity_idx").on(table.organizationId, table.entityType, table.entityId),
    index("audit_logs_org_created_idx").on(table.organizationId, table.createdAt),
  ],
);

// ----------------------------------------------------------------------
// 6. CHAT Y MEMORIA DE IA
// ----------------------------------------------------------------------
export const chatMessages = pgTable(
  "chat_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .references(() => organizations.id)
      .notNull(),
    telegramUserId: text("telegram_user_id").notNull(),
    role: text("role").notNull(), // 'user' o 'assistant'
    content: text("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("chat_messages_org_user_created_idx").on(
      table.organizationId,
      table.telegramUserId,
      table.createdAt,
    ),
  ],
);

// ----------------------------------------------------------------------
// 7. INTEGRACIONES EXTERNAS
// ----------------------------------------------------------------------
export const webhookEvents = pgTable(
  "webhook_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .references(() => organizations.id, { onDelete: "cascade" })
      .notNull(),
    provider: varchar("provider", { length: 20 }).notNull(), // TELEGRAM, KAPSO
    externalEventId: varchar("external_event_id", { length: 255 }).notNull(),
    payloadHash: varchar("payload_hash", { length: 64 }).notNull(),
    status: varchar("status", { length: 20 }).notNull().default("PROCESSING"),
    failureCode: varchar("failure_code", { length: 64 }),
    receivedAt: timestamp("received_at", { withTimezone: true }).defaultNow().notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("webhook_events_provider_external_uidx").on(table.provider, table.externalEventId),
    index("webhook_events_org_received_idx").on(table.organizationId, table.receivedAt),
    index("webhook_events_status_received_idx").on(table.status, table.receivedAt),
  ],
);

export const webhookRateLimits = pgTable(
  "webhook_rate_limits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .references(() => organizations.id, { onDelete: "cascade" })
      .notNull(),
    provider: varchar("provider", { length: 20 }).notNull(),
    bucketStart: timestamp("bucket_start", { withTimezone: true }).notNull(),
    requestCount: integer("request_count").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("webhook_rate_limits_org_provider_bucket_uidx").on(
      table.organizationId,
      table.provider,
      table.bucketStart,
    ),
    index("webhook_rate_limits_bucket_idx").on(table.bucketStart),
  ],
);
