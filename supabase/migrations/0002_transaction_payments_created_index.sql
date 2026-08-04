CREATE INDEX IF NOT EXISTS "transaction_payments_created_transaction_idx"
  ON "transaction_payments" ("created_at", "transaction_id");
