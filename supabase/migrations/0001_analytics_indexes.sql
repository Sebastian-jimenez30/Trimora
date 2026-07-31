CREATE INDEX IF NOT EXISTS "transactions_org_created_idx"
  ON "transactions" ("organization_id", "created_at");

CREATE INDEX IF NOT EXISTS "appointments_org_start_idx"
  ON "appointments" ("organization_id", "start_time");

CREATE INDEX IF NOT EXISTS "transaction_items_transaction_idx"
  ON "transaction_items" ("transaction_id");

CREATE INDEX IF NOT EXISTS "transaction_items_type_item_idx"
  ON "transaction_items" ("item_type", "item_id");

CREATE INDEX IF NOT EXISTS "transaction_payments_transaction_idx"
  ON "transaction_payments" ("transaction_id");

CREATE INDEX IF NOT EXISTS "audit_logs_entity_idx"
  ON "audit_logs" ("organization_id", "entity_type", "entity_id");
