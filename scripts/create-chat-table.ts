import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

const sql = postgres(process.env.DATABASE_URL!);

async function main() {
  try {
    console.log("Creating chat_messages table...");
    await sql`
      CREATE TABLE IF NOT EXISTS chat_messages (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL REFERENCES organizations(id),
        telegram_user_id text NOT NULL,
        role text NOT NULL,
        content text NOT NULL,
        created_at timestamp with time zone NOT NULL DEFAULT now()
      );
    `;
    console.log("Table created successfully!");
  } catch (error) {
    console.error("Error:", error);
  } finally {
    await sql.end();
  }
}

main();
