import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const componentCoverage = process.env.VITEST_COVERAGE_INCLUDE
  ? (JSON.parse(process.env.VITEST_COVERAGE_INCLUDE) as string[])
  : ["src/**/*.{ts,tsx}", "scripts/ci/**/*.mjs"];

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(projectRoot, "src"),
    },
  },
  test: {
    globals: true,
    projects: [
      {
        extends: true,
        test: {
          name: "server",
          environment: "node",
          include: ["**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts}"],
          setupFiles: ["./src/test/setup.server.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "client",
          environment: "jsdom",
          include: ["**/*.{test,spec}.{jsx,tsx}"],
          setupFiles: ["./src/test/setup.client.ts"],
        },
      },
    ],
    coverage: {
      provider: "v8",
      include: componentCoverage,
      exclude: [
        "node_modules/",
        ".next/",
        "coverage/",
        "**/*.d.ts",
        "**/*.{test,spec}.{js,mjs,cjs,jsx,ts,mts,cts,tsx}",
      ],
      reporter: ["text", "json-summary", "lcov", "html"],
      reportsDirectory: process.env.VITEST_COVERAGE_DIRECTORY ?? "coverage",
      reportOnFailure: true,
      thresholds: {
        lines: 1,
        functions: 1,
        branches: 1,
        statements: 1,
      },
    },
  },
});
