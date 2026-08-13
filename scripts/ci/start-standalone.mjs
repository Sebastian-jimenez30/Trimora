import { cp, mkdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const repositoryRoot = process.cwd();
const standaloneRoot = path.join(repositoryRoot, ".next", "standalone");
const serverPath = path.join(standaloneRoot, "server.js");
const publicSource = path.join(repositoryRoot, "public");
const staticSource = path.join(repositoryRoot, ".next", "static");
const serverUrl = new URL(process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000");

await mkdir(path.join(standaloneRoot, ".next"), { recursive: true });
await Promise.all([
  cp(publicSource, path.join(standaloneRoot, "public"), { recursive: true, force: true }),
  cp(staticSource, path.join(standaloneRoot, ".next", "static"), {
    recursive: true,
    force: true,
  }),
]);

process.env.HOSTNAME = serverUrl.hostname;
process.env.PORT = serverUrl.port || (serverUrl.protocol === "https:" ? "443" : "80");

await import(pathToFileURL(serverPath).href);
