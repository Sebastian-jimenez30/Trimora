import postgres from 'postgres';
import * as dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config({ path: '.env' });

async function run() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL is missing');
    process.exit(1);
  }

  const sql = postgres(connectionString);

  try {
    const migrationPath = path.join(process.cwd(), 'supabase', 'migrations', '0000_yellow_amphibian.sql');
    const migrationContent = fs.readFileSync(migrationPath, 'utf8');

    console.log('Running migration...');
    // Execute multiple statements
    await sql.unsafe(migrationContent);
    console.log('Migration successful!');
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    await sql.end();
  }
}

run();
