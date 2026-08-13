export const BASELINE_VERSION = "0000";
export const RELEASE_MIGRATIONS = [
  "0000",
  "0001",
  "0002",
  "0003",
  "0004",
  "0005",
  "0006",
  "0007",
  "20260813183434",
];

export const LEGACY_TABLES = [
  "appointments",
  "audit_logs",
  "clients",
  "daily_summaries",
  "inventory_movements",
  "organization_members",
  "organizations",
  "products",
  "service_materials",
  "services",
  "transaction_items",
  "transactions",
];

export const RELEASE_TABLES = [
  ...LEGACY_TABLES,
  "chat_messages",
  "invitations",
  "organization_public_profiles",
  "platform_admins",
  "transaction_payments",
  "webhook_events",
  "webhook_rate_limits",
];

export const RELEASE_INDEXES = [
  "appointments_org_start_idx",
  "inventory_movements_org_transaction_idx",
  "organization_public_profiles_slug_uidx",
  "transaction_payments_created_transaction_idx",
  "transactions_org_created_idx",
];

function missingValues(actualValues, expectedValues) {
  const actual = new Set(actualValues);
  return expectedValues.filter((value) => !actual.has(value));
}

export function evaluatePreflight({
  tables,
  migrationVersions,
  duplicateGroups,
  inventoryTransactionColumn,
  allowBaselineRepair,
}) {
  const errors = [];
  const warnings = [];
  const missingLegacyTables = missingValues(tables, LEGACY_TABLES);
  const unknownMigrations = migrationVersions.filter(
    (version) => !RELEASE_MIGRATIONS.includes(version),
  );
  const baselineRecorded = migrationVersions.includes(BASELINE_VERSION);

  if (missingLegacyTables.length > 0) {
    errors.push(`Faltan tablas de la linea base: ${missingLegacyTables.join(", ")}`);
  }

  if (unknownMigrations.length > 0) {
    errors.push(
      `El historial remoto contiene migraciones desconocidas: ${unknownMigrations.join(", ")}`,
    );
  }

  if (!baselineRecorded) {
    if (migrationVersions.length > 0) {
      errors.push("El historial remoto tiene migraciones pero no contiene la linea base 0000");
    } else if (!allowBaselineRepair) {
      errors.push("La linea base 0000 no esta registrada; se requiere autorizacion explicita");
    } else {
      warnings.push("La linea base 0000 sera registrada sin ejecutar su SQL destructivo");
    }
  }

  const duplicateSummary = Object.entries(duplicateGroups)
    .filter(([, count]) => count > 0)
    .map(([name, count]) => `${name}=${count}`);
  if (duplicateSummary.length > 0) {
    errors.push(`Hay duplicados que requieren revision manual: ${duplicateSummary.join(", ")}`);
  }

  if (migrationVersions.includes("0006") && !inventoryTransactionColumn) {
    errors.push("0006 figura aplicada, pero falta inventory_movements.transaction_id");
  }

  return { baselineRecorded, errors, warnings };
}

export function evaluatePostflight({
  tables,
  migrationVersions,
  indexes,
  inventoryTransactionColumn,
  protectedTables,
}) {
  const errors = [];
  const missingTables = missingValues(tables, RELEASE_TABLES);
  const missingMigrations = missingValues(migrationVersions, RELEASE_MIGRATIONS);
  const missingIndexes = missingValues(indexes, RELEASE_INDEXES);
  const missingProtection = missingValues(protectedTables, [
    "inventory_movements",
    "organization_public_profiles",
    "transactions",
    "transaction_items",
    "transaction_payments",
  ]);

  if (missingTables.length > 0) errors.push(`Faltan tablas: ${missingTables.join(", ")}`);
  if (missingMigrations.length > 0) {
    errors.push(`Faltan migraciones registradas: ${missingMigrations.join(", ")}`);
  }
  if (missingIndexes.length > 0) errors.push(`Faltan indices: ${missingIndexes.join(", ")}`);
  if (!inventoryTransactionColumn) {
    errors.push("Falta inventory_movements.transaction_id");
  }
  if (missingProtection.length > 0) {
    errors.push(`Falta RLS forzada en: ${missingProtection.join(", ")}`);
  }

  return { errors };
}
