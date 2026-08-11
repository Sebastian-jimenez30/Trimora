import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";

const databaseUrl = process.env.PRODUCTION_DATABASE_URL;
const backupDirectoryArgument = process.argv[2];

if (!databaseUrl) throw new Error("Falta PRODUCTION_DATABASE_URL");
if (!backupDirectoryArgument) {
  throw new Error(
    "Uso: node scripts/release/verify-backup-preservation.mjs <directorio-del-respaldo>",
  );
}

const backupDirectory = path.resolve(backupDirectoryArgument);
const manifest = JSON.parse(await readFile(path.join(backupDirectory, "manifest.json"), "utf8"));
if (manifest.format !== "trimora-public-json-v1" || !Array.isArray(manifest.files)) {
  throw new Error("El manifiesto de respaldo no tiene un formato reconocido");
}

const sql = postgres(databaseUrl, {
  max: 1,
  connect_timeout: 15,
  idle_timeout: 5,
  prepare: false,
});

function checksum(content) {
  return createHash("sha256").update(content).digest("hex");
}

try {
  let verifiedRows = 0;

  await sql.begin(async (transaction) => {
    await transaction`SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY`;

    for (const file of manifest.files) {
      const content = await readFile(path.join(backupDirectory, file.file), "utf8");
      if (checksum(content) !== file.sha256) {
        throw new Error(`El hash del respaldo no coincide para ${file.table}`);
      }

      const backedRows = JSON.parse(content);
      if (!Array.isArray(backedRows) || backedRows.length !== file.rows) {
        throw new Error(`El conteo del respaldo no coincide para ${file.table}`);
      }

      const currentRows = await transaction`SELECT id FROM ${transaction(file.table)}`;
      const currentIds = new Set(currentRows.map((row) => String(row.id)));
      const missingIds = backedRows
        .filter((row) => row.id !== undefined && row.id !== null)
        .map((row) => String(row.id))
        .filter((id) => !currentIds.has(id));

      if (missingIds.length > 0) {
        throw new Error(`${file.table} perdio ${missingIds.length} filas respaldadas`);
      }
      if (currentRows.length < backedRows.length) {
        throw new Error(`${file.table} tiene menos filas que el respaldo`);
      }

      verifiedRows += backedRows.length;
    }
  });

  console.log(
    JSON.stringify({
      event: "production_backup_preservation_verified",
      tables: manifest.files.length,
      rows: verifiedRows,
    }),
  );
} finally {
  await sql.end({ timeout: 5 });
}
