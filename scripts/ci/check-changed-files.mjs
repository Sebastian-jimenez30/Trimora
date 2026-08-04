import { existsSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { getChangedFiles, repositoryRoot } from "./lib/impact.mjs";

const mode = process.argv[2];
if (mode !== "format" && mode !== "lint") throw new Error("El modo debe ser format o lint");

const checkAll = process.env.CHECK_ALL === "true";
const changedFiles = checkAll ? ["."] : getChangedFiles(process.env.BASE_SHA, process.env.HEAD_SHA);
const supportedExtensions =
  mode === "format"
    ? new Set([
        ".cjs",
        ".css",
        ".html",
        ".js",
        ".json",
        ".jsx",
        ".md",
        ".mjs",
        ".ts",
        ".tsx",
        ".yaml",
        ".yml",
      ])
    : new Set([".cjs", ".js", ".jsx", ".mjs", ".ts", ".tsx"]);
const files = checkAll
  ? changedFiles
  : changedFiles.filter((filePath) => {
      const absolutePath = `${repositoryRoot}/${filePath}`;
      if (!existsSync(absolutePath) || !statSync(absolutePath).isFile()) return false;
      const extension = filePath.slice(filePath.lastIndexOf("."));
      return supportedExtensions.has(extension);
    });

if (files.length === 0) {
  console.log(`No hay archivos aplicables para ${mode}.`);
  process.exit(0);
}

const npmExecutable = process.platform === "win32" ? "npm.cmd" : "npm";
const toolArguments =
  mode === "format"
    ? ["exec", "--", "prettier", "--check", ...files]
    : ["exec", "--", "eslint", "--max-warnings=0", ...files];
const result = spawnSync(npmExecutable, toolArguments, { cwd: repositoryRoot, stdio: "inherit" });

if (result.error) throw result.error;
process.exit(result.status ?? 1);
