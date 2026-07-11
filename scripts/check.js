import postgres from 'postgres';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });

async function check() {
  const connectionString = process.env.DATABASE_URL;
  const sql = postgres(connectionString);

  try {
    const tables = await sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `;
    console.log('Tables in public schema:', tables.map(t => t.table_name));
  } catch (error) {
    console.error(error);
  } finally {
    await sql.end();
  }
}
check();
