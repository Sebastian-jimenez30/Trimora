import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const resilienceConfigPath = fileURLToPath(
  new URL("../../../ci/resilience.json", import.meta.url),
);

export function loadResilienceConfig() {
  const config = JSON.parse(readFileSync(resilienceConfigPath, "utf8"));
  if (config.version !== 1 || !config.components || typeof config.components !== "object") {
    throw new Error("El manifiesto ci/resilience.json no tiene una estructura valida");
  }

  for (const [componentName, component] of Object.entries(config.components)) {
    for (const field of ["properties", "mutationTargets", "database"]) {
      if (!Array.isArray(component[field] ?? [])) {
        throw new Error(`El componente ${componentName} no define ${field} como arreglo`);
      }
    }
    for (const filePath of component.properties ?? []) {
      if (!existsSync(fileURLToPath(new URL(`../../../${filePath}`, import.meta.url)))) {
        throw new Error(`La prueba de propiedades no existe: ${filePath}`);
      }
    }
    for (const target of component.mutationTargets ?? []) {
      if (!target.file || !Array.isArray(target.tests) || !Array.isArray(target.mutations)) {
        throw new Error(`El objetivo de mutacion de ${componentName} es invalido`);
      }
    }
  }

  return config;
}

export function selectResilienceComponents(affectedComponents) {
  const config = loadResilienceConfig();
  const configured = new Set(Object.keys(config.components));
  const affected = affectedComponents.filter((component) => configured.has(component));
  return {
    propertyComponents: affected.filter(
      (component) => (config.components[component].properties ?? []).length > 0,
    ),
    mutationComponents: affected.filter(
      (component) => (config.components[component].mutationTargets ?? []).length > 0,
    ),
    databaseComponents: affected.filter(
      (component) => (config.components[component].database ?? []).length > 0,
    ),
  };
}
