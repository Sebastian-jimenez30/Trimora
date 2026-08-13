import { spawnSync } from "node:child_process";
import { loadResilienceConfig } from "./lib/resilience.mjs";
import { repositoryRoot } from "./lib/impact.mjs";

const componentName = process.argv[2];
const config = loadResilienceConfig();
const component = config.components[componentName];

if (!componentName || !component) {
  throw new Error(`Componente de resiliencia desconocido: ${componentName || "sin nombre"}`);
}
if (component.properties.length === 0) {
  throw new Error(`El componente ${componentName} no tiene pruebas de propiedades`);
}

const npmExecutable = process.platform === "win32" ? "npm.cmd" : "npm";
const result = spawnSync(
  npmExecutable,
  ["exec", "--", "vitest", "run", "--project", "server", ...component.properties],
  { cwd: repositoryRoot, env: process.env, stdio: "inherit" },
);

if (result.error) throw result.error;
process.exit(result.status ?? 1);
