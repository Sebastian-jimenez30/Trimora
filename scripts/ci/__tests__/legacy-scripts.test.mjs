import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { repositoryRoot } from "../lib/impact.mjs";

const manifest = JSON.parse(
  readFileSync(join(repositoryRoot, "ci", "legacy-scripts.json"), "utf8"),
);

function listFiles(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = join(directory, entry.name);
    return entry.isDirectory() ? listFiles(absolutePath) : [absolutePath];
  });
}

describe("aislamiento de scripts historicos", () => {
  it("mantiene el inventario explicito y sin referencias productivas", () => {
    expect(manifest.version).toBe(1);
    expect(manifest.policy).toBe("manual-only-not-importable");

    const referenceFiles = [
      join(repositoryRoot, "package.json"),
      ...listFiles(join(repositoryRoot, ".github", "workflows")),
      ...listFiles(join(repositoryRoot, "src")),
    ];
    const referencedBy = [];

    for (const scriptPath of manifest.scripts) {
      expect(existsSync(join(repositoryRoot, scriptPath)), scriptPath).toBe(true);
      for (const referenceFile of referenceFiles) {
        const content = readFileSync(referenceFile, "utf8");
        if (
          content.includes(scriptPath) ||
          content.includes(scriptPath.replace(/^scripts\//u, ""))
        ) {
          referencedBy.push(`${scriptPath} <- ${relative(repositoryRoot, referenceFile)}`);
        }
      }
    }

    expect(referencedBy).toEqual([]);
  });
});
