import { spawnSync } from "node:child_process";

const browser = process.argv[2];
if (!browser) throw new Error("Debes indicar el navegador E2E");
if (!new Set(["chromium", "firefox", "webkit"]).has(browser)) {
  throw new Error(`Navegador E2E no permitido: ${browser}`);
}

let journeys = [];
if (process.env.E2E_JOURNEYS) {
  journeys = JSON.parse(process.env.E2E_JOURNEYS);
  if (!Array.isArray(journeys) || journeys.some((journey) => typeof journey !== "string")) {
    throw new Error("E2E_JOURNEYS debe ser un arreglo JSON de identificadores");
  }
}

const argumentsList = ["playwright", "test", `--project=${browser}`];
if (journeys.length > 0 && process.env.E2E_FULL_SUITE !== "true") {
  argumentsList.push("--grep", `@(?:${journeys.join("|")})`);
}

const executable = process.platform === "win32" ? "npx.cmd" : "npx";
const result = spawnSync(executable, argumentsList, { stdio: "inherit", shell: false });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
