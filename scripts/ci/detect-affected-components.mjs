import { appendFileSync } from "node:fs";
import { analyzeImpact, getAllTrackedFiles, getChangedFiles } from "./lib/impact.mjs";

const forceFullSuite = process.env.FORCE_FULL_SUITE === "true";
const consolidation = process.env.CONSOLIDATION_RUN === "true";
const files =
  forceFullSuite && (!process.env.BASE_SHA || !process.env.HEAD_SHA)
    ? getAllTrackedFiles()
    : getChangedFiles(process.env.BASE_SHA, process.env.HEAD_SHA);
const impact = analyzeImpact({ files, forceFullSuite });

function setOutput(name, value) {
  const serialized = typeof value === "string" ? value : JSON.stringify(value);
  if (process.env.GITHUB_OUTPUT)
    appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${serialized}\n`);
  console.log(`${name}=${serialized}`);
}

setOutput("components", impact.affectedComponents);
setOutput("test_components", impact.testComponents);
setOutput("has_components", impact.affectedComponents.length > 0);
setOutput("has_test_components", impact.testComponents.length > 0);
setOutput("docs_only", impact.docsOnly);
setOutput("full_suite", impact.fullSuite);
setOutput("needs_build", impact.needsBuild);
setOutput("needs_typecheck", impact.needsTypecheck);
setOutput("needs_database", impact.needsDatabase);
setOutput("consolidation", consolidation);

const componentsWithoutTests = impact.affectedComponents.filter(
  (name) => impact.testsByComponent[name].length === 0,
);
const summary = [
  "## Plan de pruebas por impacto",
  "",
  `- Archivos modificados: ${impact.files.length}`,
  `- Componentes directos: ${impact.directComponents.join(", ") || "ninguno"}`,
  `- Componentes afectados: ${impact.affectedComponents.join(", ") || "ninguno"}`,
  `- Componentes con pruebas registradas: ${impact.testComponents.join(", ") || "ninguno"}`,
  `- Suite completa seleccionada: ${impact.fullSuite ? "sí" : "no"}`,
  `- Ejecución de consolidación: ${consolidation ? "sí" : "no"}`,
];

if (componentsWithoutTests.length > 0) {
  summary.push(
    `- Componentes todavía sin pruebas registradas: ${componentsWithoutTests.join(", ")}`,
  );
}
if (impact.unclassifiedFiles.length > 0) {
  summary.push(
    "",
    "### Archivos no clasificados que activaron el fallback",
    "",
    ...impact.unclassifiedFiles.map((file) => `- ${file}`),
  );
}
summary.push("", "### Archivos evaluados", "", ...impact.files.map((file) => `- ${file}`));

if (process.env.GITHUB_STEP_SUMMARY)
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary.join("\n")}\n`);
