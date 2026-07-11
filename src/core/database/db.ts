import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const connectionString = process.env.DATABASE_URL;

// En entornos Serverless con Supabase, se recomienda { prepare: false }
const client = postgres(connectionString as string, { prepare: false });
export const db = drizzle(client, { schema });
