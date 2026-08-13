import { describe, expect, it } from "vitest";
import { analyzeImpact } from "../lib/impact.mjs";
import { selectResilienceComponents } from "../lib/resilience.mjs";

describe("selector de pruebas por componente", () => {
  it("reconoce un cambio exclusivamente documental", () => {
    const result = analyzeImpact({ files: ["docs/06_plan_calidad_seguridad_arquitectura.md"] });

    expect(result.docsOnly).toBe(true);
    expect(result.affectedComponents).toEqual([]);
    expect(result.fullSuite).toBe(false);
  });

  it("incluye consumidores transitivos de inventario", () => {
    const result = analyzeImpact({ files: ["src/modules/inventory/actions.ts"] });

    expect(result.directComponents).toEqual(["inventory-services"]);
    expect(result.affectedComponents).toEqual(
      expect.arrayContaining([
        "inventory-services",
        "pos-finance",
        "agenda-appointments",
        "clients",
        "analytics",
      ]),
    );
    expect(result.e2eJourneys).toEqual(
      expect.arrayContaining(["inventory", "pos-sales", "history-analytics"]),
    );
  });

  it("ejecuta los consumidores cuando cambia un componente compartido", () => {
    const result = analyzeImpact({ files: ["src/components/shared/Dialog.tsx"] });

    expect(result.directComponents).toEqual(["shared-ui"]);
    expect(result.affectedComponents).toEqual(
      expect.arrayContaining([
        "shared-ui",
        "auth-access",
        "pos-finance",
        "inventory-services",
        "agenda-appointments",
        "clients",
        "analytics",
        "ai-integrations",
      ]),
    );
  });

  it("aísla cambios propios de public-booking y lo protege ante cambios de agenda", () => {
    const publicImpact = analyzeImpact({
      files: ["src/modules/public-booking/application/get-public-config.ts"],
    });
    const agendaImpact = analyzeImpact({ files: ["src/modules/appointments/actions.ts"] });

    expect(publicImpact.directComponents).toEqual(["public-booking"]);
    expect(publicImpact.affectedComponents).toEqual(["public-booking"]);
    expect(publicImpact.testComponents).toEqual(["public-booking"]);
    expect(agendaImpact.affectedComponents).toContain("public-booking");
  });

  it("activa el fallback completo para archivos sin clasificar", () => {
    const result = analyzeImpact({ files: ["unknown-folder/new-file.ts"] });

    expect(result.fullSuite).toBe(true);
    expect(result.unclassifiedFiles).toEqual(["unknown-folder/new-file.ts"]);
    expect(result.affectedComponents).toHaveLength(Object.keys(result.manifest.components).length);
  });

  it("activa todos los componentes cuando cambia el selector", () => {
    const result = analyzeImpact({ files: ["ci/components.json"] });

    expect(result.directComponents).toEqual(["tooling"]);
    expect(result.fullSuite).toBe(true);
    expect(result.testComponents).toEqual(
      expect.arrayContaining(["inventory-services", "tooling"]),
    );
    expect(result.e2eJourneys).toEqual(
      expect.arrayContaining(["auth-session", "agenda", "accessibility"]),
    );
  });

  it("selecciona propiedades, mutacion y base segun los componentes afectados", () => {
    const impact = analyzeImpact({ files: ["src/modules/pos/domain/money.ts"] });
    const resilience = selectResilienceComponents(impact.affectedComponents);

    expect(resilience.propertyComponents).toContain("pos-finance");
    expect(resilience.mutationComponents).toContain("pos-finance");
    expect(resilience.databaseComponents).toContain("pos-finance");
  });
});
