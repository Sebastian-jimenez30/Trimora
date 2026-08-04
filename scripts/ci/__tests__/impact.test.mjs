import { describe, expect, it } from "vitest";
import { analyzeImpact } from "../lib/impact.mjs";

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
        "shared-ui",
      ]),
    );
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
  });
});
