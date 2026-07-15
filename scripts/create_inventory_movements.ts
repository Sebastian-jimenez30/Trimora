import { sql } from 'drizzle-orm';
import { db } from '../src/core/database/db';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env', override: false });
process.env.DATABASE_URL = process.env.DATABASE_URL + '?ipv4=true';

async function main() {
  console.log("Creating inventory_movements table...");
  
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "inventory_movements" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
        "product_id" uuid NOT NULL REFERENCES "products"("id") ON DELETE CASCADE,
        "type" varchar(20) NOT NULL,
        "quantity" integer NOT NULL,
        "previous_stock" integer NOT NULL,
        "new_stock" integer NOT NULL,
        "notes" text,
        "created_at" timestamp DEFAULT now() NOT NULL
      );
    `);
    
    console.log("Table created successfully!");
  } catch (err) {
    console.error("Error creating table:", err);
  }
  
  process.exit(0);
}

main();
