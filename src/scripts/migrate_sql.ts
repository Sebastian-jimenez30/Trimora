import 'dotenv/config';
import { db } from '../core/database/db';
import { sql } from 'drizzle-orm';

async function main() {
  console.log("Migrando base de datos...");
  try {
    await db.execute(sql`
      ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "paid_amount" numeric(10, 2) DEFAULT '0' NOT NULL;

      CREATE TABLE IF NOT EXISTS "transaction_payments" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "transaction_id" uuid NOT NULL,
        "amount" numeric(10, 2) NOT NULL,
        "payment_method" text NOT NULL,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL
      );

      DO $$ BEGIN
      ALTER TABLE "transaction_payments" ADD CONSTRAINT "transaction_payments_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE no action;
      EXCEPTION
      WHEN duplicate_object THEN null;
      END $$;

      CREATE INDEX IF NOT EXISTS "transaction_payments_transaction_id_idx" ON "transaction_payments"("transaction_id");
    `);
    console.log("Migración completada con éxito.");
    process.exit(0);
  } catch (e) {
    console.error("Error migrando:", e);
    process.exit(1);
  }
}

main();
