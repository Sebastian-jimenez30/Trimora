import { spawnSync } from "node:child_process";
import { findComponentTests, loadManifest, repositoryRoot } from "./lib/impact.mjs";

const componentName = process.argv[2];
const withCoverage = process.argv.includes("--coverage");
const manifest = loadManifest();

if (!componentName || !manifest.components[componentName]) {
  throw new Error(`Componente desconocido: ${componentName || "sin nombre"}`);
}

const testFiles = findComponentTests(manifest, componentName);
if (testFiles.length === 0) {
  console.log(
    `::warning title=Componente sin pruebas::${componentName} todavía no tiene archivos de prueba registrados.`,
  );
  process.exit(0);
}

const npmExecutable = process.platform === "win32" ? "npm.cmd" : "npm";
const argumentsList = ["exec", "--", "vitest", "run", ...testFiles];
if (withCoverage) {
  argumentsList.push(
    "--coverage",
    `--coverage.reportsDirectory=coverage/components/${componentName}`,
  );
}

const result = spawnSync(npmExecutable, argumentsList, {
  cwd: repositoryRoot,
  env: {
    ...process.env,
    VITEST_COMPONENT: componentName,
    VITEST_COVERAGE_INCLUDE: JSON.stringify(manifest.components[componentName].coverage),
  },
  stdio: "inherit",
});

if (result.error) throw result.error;
process.exit(result.status ?? 1);
