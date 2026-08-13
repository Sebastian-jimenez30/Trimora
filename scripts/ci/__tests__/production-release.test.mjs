import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  evaluatePostflight,
  evaluatePreflight,
  RELEASE_INDEXES,
  RELEASE_MIGRATIONS,
  RELEASE_TABLES,
} from "../../release/production-schema-state.mjs";

const legacyTables = [
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

describe("release coordinado de produccion", () => {
  it("incluye la fundacion publica en el contrato de despliegue", () => {
    expect(RELEASE_MIGRATIONS).toContain("20260813183434");
    expect(RELEASE_TABLES).toContain("organization_public_profiles");
    expect(RELEASE_INDEXES).toContain("organization_public_profiles_slug_uidx");
  });

  it("bloquea una base sin linea base cuando no existe autorizacion", () => {
    const result = evaluatePreflight({
      tables: legacyTables,
      migrationVersions: [],
      duplicateGroups: {},
      inventoryTransactionColumn: false,
      allowBaselineRepair: false,
    });

    expect(result.errors).toContain(
      "La linea base 0000 no esta registrada; se requiere autorizacion explicita",
    );
  });

  it("permite preparar la reparacion explicita de una base historica compatible", () => {
    const result = evaluatePreflight({
      tables: legacyTables,
      migrationVersions: [],
      duplicateGroups: {},
      inventoryTransactionColumn: false,
      allowBaselineRepair: true,
    });

    expect(result.errors).toEqual([]);
    expect(result.baselineRecorded).toBe(false);
    expect(result.warnings).toHaveLength(1);
  });

  it("bloquea deduplicaciones implicitas antes de modificar datos", () => {
    const result = evaluatePreflight({
      tables: legacyTables,
      migrationVersions: ["0000"],
      duplicateGroups: { memberships: 2, materials: 1 },
      inventoryTransactionColumn: false,
      allowBaselineRepair: false,
    });

    expect(result.errors[0]).toContain("memberships=2");
    expect(result.errors[0]).toContain("materials=1");
  });

  it("exige que el esquema final tenga migraciones, trazabilidad, indices y RLS", () => {
    const result = evaluatePostflight({
      tables: legacyTables,
      migrationVersions: ["0000", "0001"],
      indexes: [],
      inventoryTransactionColumn: false,
      protectedTables: [],
    });

    expect(result.errors).toHaveLength(5);
  });

  it("impide el despliegue automatico de main", () => {
    const config = JSON.parse(readFileSync(path.join(process.cwd(), "vercel.json"), "utf8"));

    expect(config.git.deploymentEnabled.main).toBe(false);
  });

  it("construye antes de migrar y migra antes de desplegar", () => {
    const workflow = readFileSync(
      path.join(process.cwd(), ".github/workflows/release-production.yml"),
      "utf8",
    );
    const buildPosition = workflow.indexOf("vercel build --prod");
    const migrationPosition = workflow.indexOf("supabase db push --include-all\n");
    const deploymentPosition = workflow.indexOf("vercel deploy --prebuilt --prod");

    expect(workflow).not.toContain("supabase db reset");
    expect(workflow.match(/set -o pipefail/gu)).toHaveLength(2);
    expect(workflow).toContain("Session Pooler 5432");
    expect(workflow).toContain('":6543/"');
    expect(workflow).toContain("migration repair 0000 --status applied");
    expect(workflow).toContain('grep -q "0000_unusual_garia"');
    expect(buildPosition).toBeGreaterThan(-1);
    expect(migrationPosition).toBeGreaterThan(buildPosition);
    expect(deploymentPosition).toBeGreaterThan(migrationPosition);
  });

  it("genera la salida standalone que utiliza el servidor E2E", () => {
    const workflow = readFileSync(path.join(process.cwd(), ".github/workflows/ci.yml"), "utf8");
    const e2eSection = workflow.slice(workflow.indexOf("  e2e:"), workflow.indexOf("  build:"));

    expect(e2eSection).toContain("TRIMORA_BUILD_TARGET: standalone");
    expect(e2eSection.indexOf("TRIMORA_BUILD_TARGET: standalone")).toBeGreaterThan(
      e2eSection.indexOf("Compilar la aplicación para producción"),
    );
  });
});
