CREATE INDEX IF NOT EXISTS "transactions_org_created_idx"
  ON "transactions" ("organization_id", "created_at");

CREATE INDEX IF NOT EXISTS "appointments_org_start_idx"
  ON "appointments" ("organization_id", "start_time");

CREATE INDEX IF NOT EXISTS "transaction_items_transaction_idx"
  ON "transaction_items" ("transaction_id");

CREATE INDEX IF NOT EXISTS "transaction_items_type_item_idx"
  ON "transaction_items" ("item_type", "item_id");

-- La tabla existía en producción antes de quedar versionada. Se declara aquí para que
-- una reconstrucción desde cero no falle antes de alcanzar la migración de reconciliación.
CREATE TABLE IF NOT EXISTS "transaction_payments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "transaction_id" uuid NOT NULL REFERENCES "transactions" ("id") ON DELETE CASCADE,
  "amount" numeric(10, 2) NOT NULL,
  "payment_method" text NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "transaction_payments_transaction_idx"
  ON "transaction_payments" ("transaction_id");

CREATE INDEX IF NOT EXISTS "audit_logs_entity_idx"
  ON "audit_logs" ("organization_id", "entity_type", "entity_id");
