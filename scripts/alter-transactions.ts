import postgres from 'postgres';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const sql = postgres(process.env.DATABASE_URL!);

async function alterTable() {
  try {
    await sql`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'INCOME';`;
    console.log("Column 'type' added successfully.");
  } catch (error) {
    console.error("Error altering table:", error);
  } finally {
    process.exit(0);
  }
}

alterTable();
