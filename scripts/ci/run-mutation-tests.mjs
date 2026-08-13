import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { loadResilienceConfig } from "./lib/resilience.mjs";
import { repositoryRoot } from "./lib/impact.mjs";

const componentName = process.argv[2];
const config = loadResilienceConfig();
const component = config.components[componentName];

if (!componentName || !component) {
  throw new Error(`Componente de mutacion desconocido: ${componentName || "sin nombre"}`);
}
if (component.mutationTargets.length === 0) {
  throw new Error(`El componente ${componentName} no tiene objetivos de mutacion`);
}

const npmExecutable = process.platform === "win32" ? "npm.cmd" : "npm";
const reportDirectory = join(repositoryRoot, "reports", "mutation", componentName);
mkdirSync(reportDirectory, { recursive: true });

function runTests(testFiles) {
  return spawnSync(
    npmExecutable,
    ["exec", "--", "vitest", "run", "--project", "server", ...testFiles],
    { cwd: repositoryRoot, env: process.env, encoding: "utf8" },
  );
}

const results = [];
for (const target of component.mutationTargets) {
  const absolutePath = join(repositoryRoot, target.file);
  const original = readFileSync(absolutePath, "utf8");
  const baseline = runTests(target.tests);
  if (baseline.error) throw baseline.error;
  if (baseline.status !== 0) {
    process.stdout.write(baseline.stdout ?? "");
    process.stderr.write(baseline.stderr ?? "");
    throw new Error(`La linea base de mutacion fallo para ${target.file}`);
  }

  for (const mutation of target.mutations) {
    const occurrences = original.split(mutation.find).length - 1;
    if (occurrences !== 1) {
      throw new Error(
        `La mutacion ${mutation.id} esperaba una coincidencia en ${target.file} y encontro ${occurrences}`,
      );
    }

    const mutated = original.replace(mutation.find, mutation.replace);
    let execution;
    try {
      mkdirSync(dirname(absolutePath), { recursive: true });
      writeFileSync(absolutePath, mutated, "utf8");
      execution = runTests(target.tests);
    } finally {
      writeFileSync(absolutePath, original, "utf8");
    }
    if (execution.error) throw execution.error;
    results.push({
      id: mutation.id,
      description: mutation.description,
      file: target.file,
      killed: execution.status !== 0,
    });
  }
}

const killed = results.filter((result) => result.killed).length;
const score = results.length === 0 ? 100 : (killed / results.length) * 100;
const report = { component: componentName, killed, total: results.length, score, results };
writeFileSync(
  join(reportDirectory, "mutation-report.json"),
  `${JSON.stringify(report, null, 2)}\n`,
);
writeFileSync(
  join(reportDirectory, "mutation-report.md"),
  [
    `# Mutacion - ${componentName}`,
    "",
    `- Mutantes eliminados: ${killed}/${results.length}`,
    `- Puntaje: ${score.toFixed(2)}%`,
    "",
    ...results.map(
      (result) => `- ${result.killed ? "KILLED" : "SURVIVED"} ${result.id}: ${result.description}`,
    ),
    "",
  ].join("\n"),
);

console.log(`Mutacion ${componentName}: ${killed}/${results.length} (${score.toFixed(2)}%)`);
if (killed !== results.length) process.exit(1);
