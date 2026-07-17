import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env' });
const connectionString = process.env.DATABASE_URL!;
const client = postgres(connectionString, { prepare: false });
const db = drizzle(client);

async function main() {
  try {
    await client`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS notes TEXT;`;
    console.log('Column "notes" added to "transactions" table successfully.');
  } catch (err) {
    console.error('Error adding column:', err);
  } finally {
    await client.end();
  }
}
main();
