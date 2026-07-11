import { pgTable, uuid, text, timestamp, numeric, integer, boolean } from 'drizzle-orm/pg-core';

// ----------------------------------------------------------------------
// 1. NÚCLEO SAAS
// ----------------------------------------------------------------------
export const organizations = pgTable('organizations', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const organizationMembers = pgTable('organization_members', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').references(() => organizations.id).notNull(),
  userId: uuid('user_id').notNull(), // ref to auth.users en Supabase
  role: text('role').notNull().default('BARBER'), // ADMIN, BARBER, RECEPTIONIST
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ----------------------------------------------------------------------
// 2. CATÁLOGO E INTELIGENCIA DE INVENTARIO
// ----------------------------------------------------------------------
export const services = pgTable('services', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').references(() => organizations.id).notNull(),
  name: text('name').notNull(),
  description: text('description'),
  durationMinutes: integer('duration_minutes').notNull().default(30),
  price: numeric('price', { precision: 10, scale: 2 }).notNull(),
  isActive: boolean('is_active').default(true).notNull(),
});

export const products = pgTable('products', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').references(() => organizations.id).notNull(),
  name: text('name').notNull(),
  description: text('description'),
  category: text('category').notNull(), // VENTA, CONSUMO
  currentStock: numeric('current_stock', { precision: 10, scale: 2 }).notNull().default('0'),
  minimumStock: numeric('minimum_stock', { precision: 10, scale: 2 }).notNull().default('0'),
  salePrice: numeric('sale_price', { precision: 10, scale: 2 }),
  costPrice: numeric('cost_price', { precision: 10, scale: 2 }),
  isActive: boolean('is_active').default(true).notNull(),
});

export const serviceMaterials = pgTable('service_materials', {
  id: uuid('id').primaryKey().defaultRandom(),
  serviceId: uuid('service_id').references(() => services.id).notNull(),
  productId: uuid('product_id').references(() => products.id).notNull(),
  quantityUsed: numeric('quantity_used', { precision: 10, scale: 4 }).notNull(),
});

// ----------------------------------------------------------------------
// 3. OPERACIÓN DIARIA
// ----------------------------------------------------------------------
export const clients = pgTable('clients', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').references(() => organizations.id).notNull(),
  firstName: text('first_name').notNull(),
  lastName: text('last_name'),
  phone: text('phone'),
  email: text('email'),
  notes: text('notes'),
  totalSpent: numeric('total_spent', { precision: 10, scale: 2 }).default('0'),
  lastVisit: timestamp('last_visit', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const appointments = pgTable('appointments', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').references(() => organizations.id).notNull(),
  clientId: uuid('client_id').references(() => clients.id).notNull(),
  staffId: uuid('staff_id').references(() => organizationMembers.id).notNull(),
  serviceId: uuid('service_id').references(() => services.id).notNull(),
  startTime: timestamp('start_time', { withTimezone: true }).notNull(),
  endTime: timestamp('end_time', { withTimezone: true }).notNull(),
  status: text('status').default('PENDING').notNull(), // PENDING, CONFIRMED, COMPLETED, CANCELLED
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ----------------------------------------------------------------------
// 4. POS Y FINANZAS
// ----------------------------------------------------------------------
export const transactions = pgTable('transactions', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').references(() => organizations.id).notNull(),
  clientId: uuid('client_id').references(() => clients.id),
  staffId: uuid('staff_id').references(() => organizationMembers.id), // Quién cobró/atendió
  totalAmount: numeric('total_amount', { precision: 10, scale: 2 }).notNull(),
  paymentMethod: text('payment_method'), // CASH, CARD, TRANSFER
  status: text('status').default('COMPLETED').notNull(), // PENDING, COMPLETED, REFUNDED
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const transactionItems = pgTable('transaction_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  transactionId: uuid('transaction_id').references(() => transactions.id).notNull(),
  itemType: text('item_type').notNull(), // SERVICE, PRODUCT
  itemId: uuid('item_id').notNull(), // ID of service or product
  quantity: numeric('quantity', { precision: 10, scale: 2 }).notNull().default('1'),
  unitPrice: numeric('unit_price', { precision: 10, scale: 2 }).notNull(),
  subtotal: numeric('subtotal', { precision: 10, scale: 2 }).notNull(),
});

export const inventoryMovements = pgTable('inventory_movements', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').references(() => organizations.id).notNull(),
  productId: uuid('product_id').references(() => products.id).notNull(),
  quantityChange: numeric('quantity_change', { precision: 10, scale: 2 }).notNull(),
  movementType: text('movement_type').notNull(), // SALE, USAGE, PURCHASE, ADJUSTMENT
  transactionId: uuid('transaction_id').references(() => transactions.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ----------------------------------------------------------------------
// 5. ANALÍTICA E HISTÓRICOS
// ----------------------------------------------------------------------
export const dailySummaries = pgTable('daily_summaries', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').references(() => organizations.id).notNull(),
  date: timestamp('date', { withTimezone: false }).notNull(),
  totalRevenue: numeric('total_revenue', { precision: 10, scale: 2 }).default('0'),
  appointmentsCount: integer('appointments_count').default(0),
  newClientsCount: integer('new_clients_count').default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').references(() => organizations.id).notNull(),
  userId: uuid('user_id').notNull(),
  action: text('action').notNull(),
  entityType: text('entity_type').notNull(),
  entityId: uuid('entity_id'),
  details: text('details'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
