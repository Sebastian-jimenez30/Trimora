import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const connectionString = process.env.DATABASE_URL;
const globalForDatabase = globalThis as typeof globalThis & {
  trimoraPostgresClient?: ReturnType<typeof postgres>;
};

// Reutilizar el cliente evita abrir un pool nuevo con cada recarga o instancia del módulo.
const client = globalForDatabase.trimoraPostgresClient ?? postgres(connectionString as string, {
  prepare: false,
  max: 1,
  idle_timeout: 20,
  connect_timeout: 10,
});

globalForDatabase.trimoraPostgresClient = client;
export const db = drizzle(client, { schema });
