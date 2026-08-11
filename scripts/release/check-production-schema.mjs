import { appendFile } from "node:fs/promises";
import postgres from "postgres";
import {
  evaluatePostflight,
  evaluatePreflight,
  LEGACY_TABLES,
  RELEASE_INDEXES,
  RELEASE_TABLES,
} from "./production-schema-state.mjs";

const mode = process.argv[2];
if (!new Set(["preflight", "postflight"]).has(mode)) {
  throw new Error("Uso: node scripts/release/check-production-schema.mjs <preflight|postflight>");
}

const databaseUrl = process.env.PRODUCTION_DATABASE_URL;
if (!databaseUrl) throw new Error("Falta PRODUCTION_DATABASE_URL");

const sql = postgres(databaseUrl, {
  max: 1,
  connect_timeout: 10,
  idle_timeout: 5,
  prepare: false,
});

async function tableNames(expectedTables) {
  const rows = await sql`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = ANY(${expectedTables})
  `;
  return rows.map((row) => row.table_name);
}

async function migrationVersions() {
  const [{ historyTable }] = await sql`
    SELECT to_regclass('supabase_migrations.schema_migrations')::text AS "historyTable"
  `;
  if (!historyTable) return [];

  const rows = await sql`
    SELECT version::text AS version
    FROM supabase_migrations.schema_migrations
    ORDER BY version
  `;
  return rows.map((row) => row.version);
}

async function hasInventoryTransactionColumn() {
  const [row] = await sql`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'inventory_movements'
        AND column_name = 'transaction_id'
    ) AS present
  `;
  return row.present;
}

async function duplicateGroups() {
  const [row] = await sql`
    SELECT
      (
        SELECT count(*)::int
        FROM (
          SELECT 1
          FROM public.organization_members
          GROUP BY organization_id, user_id
          HAVING count(*) > 1
        ) AS duplicates
      ) AS memberships,
      (
        SELECT count(*)::int
        FROM (
          SELECT 1
          FROM public.service_materials
          GROUP BY service_id, product_id
          HAVING count(*) > 1
        ) AS duplicates
      ) AS materials,
      (
        SELECT count(*)::int
        FROM (
          SELECT 1
          FROM public.daily_summaries
          GROUP BY organization_id, date
          HAVING count(*) > 1
        ) AS duplicates
      ) AS summaries
  `;

  const [{ invitationsTable }] = await sql`
    SELECT to_regclass('public.invitations')::text AS "invitationsTable"
  `;
  let invitations = 0;
  if (invitationsTable) {
    const [invitationRow] = await sql`
      SELECT count(*)::int AS count
      FROM (
        SELECT 1
        FROM public.invitations
        WHERE status = 'PENDING'
        GROUP BY organization_id, lower(email)
        HAVING count(*) > 1
      ) AS duplicates
    `;
    invitations = invitationRow.count;
  }

  return { ...row, invitations };
}

async function indexNames() {
  const rows = await sql`
    SELECT indexname
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = ANY(${RELEASE_INDEXES})
  `;
  return rows.map((row) => row.indexname);
}

async function protectedTableNames() {
  const rows = await sql`
    SELECT relname
    FROM pg_class
    WHERE relnamespace = 'public'::regnamespace
      AND relkind = 'r'
      AND relrowsecurity
      AND relforcerowsecurity
  `;
  return rows.map((row) => row.relname);
}

function printMessages(result) {
  for (const warning of result.warnings ?? []) console.warn(`ADVERTENCIA: ${warning}`);
  for (const error of result.errors) console.error(`ERROR: ${error}`);
}

async function exposeOutput(name, value) {
  if (!process.env.GITHUB_OUTPUT) return;
  await appendFile(process.env.GITHUB_OUTPUT, `${name}=${value}\n`, "utf8");
}

try {
  const versions = await migrationVersions();
  const inventoryTransactionColumn = await hasInventoryTransactionColumn();

  if (mode === "preflight") {
    const tables = await tableNames(LEGACY_TABLES);
    const hasCompleteBaseline = LEGACY_TABLES.every((table) => tables.includes(table));
    const result = evaluatePreflight({
      tables,
      migrationVersions: versions,
      duplicateGroups: hasCompleteBaseline ? await duplicateGroups() : {},
      inventoryTransactionColumn,
      allowBaselineRepair: process.env.ALLOW_BASELINE_REPAIR === "true",
    });
    printMessages(result);
    await exposeOutput("baseline_recorded", String(result.baselineRecorded));
    if (result.errors.length > 0) process.exitCode = 1;
  } else {
    const result = evaluatePostflight({
      tables: await tableNames(RELEASE_TABLES),
      migrationVersions: versions,
      indexes: await indexNames(),
      inventoryTransactionColumn,
      protectedTables: await protectedTableNames(),
    });
    printMessages(result);
    if (result.errors.length > 0) process.exitCode = 1;
  }
} finally {
  await sql.end({ timeout: 5 });
}
