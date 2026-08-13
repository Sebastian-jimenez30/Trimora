import "server-only";

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { resolveDatabasePoolConfig } from "./pool-config";

const connectionString = process.env.DATABASE_URL;
const poolConfig = resolveDatabasePoolConfig();
const globalForDatabase = globalThis as typeof globalThis & {
  trimoraPostgresClient?: ReturnType<typeof postgres>;
};

// Reutilizar el cliente evita abrir un pool nuevo con cada recarga o instancia del módulo.
const client =
  globalForDatabase.trimoraPostgresClient ??
  postgres(connectionString as string, {
    prepare: false,
    max: poolConfig.max,
    idle_timeout: poolConfig.idleTimeout,
    connect_timeout: poolConfig.connectTimeout,
  });

globalForDatabase.trimoraPostgresClient = client;
export const db = drizzle(client, { schema });
