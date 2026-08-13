import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));
const manifestPath = fileURLToPath(new URL("../../../ci/components.json", import.meta.url));

export function loadManifest() {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (manifest.version !== 1 || !manifest.components || typeof manifest.components !== "object") {
    throw new Error("El manifiesto ci/components.json no tiene una estructura válida");
  }

  const componentNames = new Set(Object.keys(manifest.components));
  for (const [name, component] of Object.entries(manifest.components)) {
    for (const field of ["paths", "testRoots", "coverage", "e2e", "triggers"]) {
      if (!Array.isArray(component[field]))
        throw new Error(`El componente ${name} no define ${field} como arreglo`);
    }
    for (const target of component.triggers) {
      if (!componentNames.has(target))
        throw new Error(`El componente ${name} activa un destino inexistente: ${target}`);
    }
  }

  return manifest;
}

function runGit(args) {
  return execFileSync("git", args, { cwd: repositoryRoot, encoding: "utf8" }).trim();
}

export function getChangedFiles(baseSha, headSha) {
  if (!baseSha || !headSha)
    throw new Error("BASE_SHA y HEAD_SHA son obligatorios para detectar impacto");
  const output = runGit([
    "diff",
    "--name-only",
    "--diff-filter=ACMRTUXB",
    `${baseSha}...${headSha}`,
  ]);
  return output ? output.split(/\r?\n/u).map(normalizePath) : [];
}

export function getAllTrackedFiles() {
  const output = runGit(["ls-files"]);
  return output ? output.split(/\r?\n/u).map(normalizePath) : [];
}

export function normalizePath(filePath) {
  return filePath.replaceAll("\\", "/").replace(/^\.\//u, "").replace(/^\/+/u, "");
}

function matchesConfiguredPath(filePath, configuredPath) {
  const normalized = normalizePath(configuredPath);
  return normalized.endsWith("/") ? filePath.startsWith(normalized) : filePath === normalized;
}

function isDocumentationFile(filePath) {
  return filePath.startsWith("docs/") || filePath.endsWith(".md");
}

function collectTriggeredComponents(manifest, initialComponents) {
  const affected = new Set(initialComponents);
  const pending = [...initialComponents];

  while (pending.length > 0) {
    const current = pending.shift();
    for (const target of manifest.components[current].triggers) {
      if (affected.has(target)) continue;
      affected.add(target);
      pending.push(target);
    }
  }

  return [...affected].sort();
}

function isTestFile(filePath) {
  return /\.(test|spec)\.[cm]?[jt]sx?$/u.test(filePath);
}

function findTestsInDirectory(directoryPath) {
  if (!existsSync(directoryPath) || !statSync(directoryPath).isDirectory()) return [];
  const tests = [];
  for (const entry of readdirSync(directoryPath, { withFileTypes: true })) {
    const absolutePath = `${directoryPath}/${entry.name}`;
    if (entry.isDirectory()) tests.push(...findTestsInDirectory(absolutePath));
    if (entry.isFile() && isTestFile(entry.name))
      tests.push(normalizePath(absolutePath.slice(repositoryRoot.length)));
  }
  return tests;
}

export function findComponentTests(manifest, componentName) {
  const roots = manifest.components[componentName].testRoots;
  return [
    ...new Set(
      roots.flatMap((root) => findTestsInDirectory(`${repositoryRoot}/${normalizePath(root)}`)),
    ),
  ].sort();
}

export function analyzeImpact({ files, forceFullSuite = false }) {
  const manifest = loadManifest();
  const componentNames = Object.keys(manifest.components).sort();
  const directComponents = new Set();
  const unclassifiedFiles = [];

  for (const filePath of files) {
    if (isDocumentationFile(filePath)) continue;
    const matches = componentNames.filter((name) =>
      manifest.components[name].paths.some((configuredPath) =>
        matchesConfiguredPath(filePath, configuredPath),
      ),
    );
    if (matches.length === 0) unclassifiedFiles.push(filePath);
    matches.forEach((name) => directComponents.add(name));
  }

  const mustRunFullSuite =
    forceFullSuite || unclassifiedFiles.length > 0 || directComponents.has("tooling");
  const affectedComponents = mustRunFullSuite
    ? componentNames
    : collectTriggeredComponents(manifest, [...directComponents]);
  const testsByComponent = Object.fromEntries(
    affectedComponents.map((name) => [name, findComponentTests(manifest, name)]),
  );
  const testComponents = affectedComponents.filter((name) => testsByComponent[name].length > 0);
  const docsOnly = files.length > 0 && files.every(isDocumentationFile);
  const e2eJourneys = [
    ...new Set(affectedComponents.flatMap((name) => manifest.components[name].e2e)),
  ].sort();

  return {
    manifest,
    files,
    directComponents: [...directComponents].sort(),
    affectedComponents,
    testComponents,
    testsByComponent,
    e2eJourneys,
    unclassifiedFiles,
    docsOnly,
    fullSuite: mustRunFullSuite,
    needsBuild: !docsOnly,
    needsTypecheck: !docsOnly,
    needsDatabase: affectedComponents.includes("database"),
  };
}

export { repositoryRoot };
