import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";

const databaseUrl = process.env.PRODUCTION_DATABASE_URL;
const destinationArgument = process.argv[2];

if (!databaseUrl) throw new Error("Falta PRODUCTION_DATABASE_URL");
if (!destinationArgument) {
  throw new Error("Uso: node scripts/release/backup-public-data.mjs <directorio-fuera-del-repo>");
}

const repositoryRoot = path.resolve(process.cwd());
const destination = path.resolve(destinationArgument);
const relativeDestination = path.relative(repositoryRoot, destination);
if (!relativeDestination.startsWith("..") || path.isAbsolute(relativeDestination)) {
  throw new Error("El respaldo debe guardarse fuera del repositorio");
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

await mkdir(destination, { recursive: false });

try {
  const manifest = await sql.begin(async (transaction) => {
    await transaction`SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY`;

    const tables = await transaction`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `;
    const columns = await transaction`
      SELECT table_name, column_name, data_type, is_nullable, ordinal_position
      FROM information_schema.columns
      WHERE table_schema = 'public'
      ORDER BY table_name, ordinal_position
    `;

    const files = [];
    for (const { table_name: tableName } of tables) {
      const rows = await transaction`SELECT * FROM ${transaction(tableName)}`;
      const content = `${JSON.stringify(rows)}\n`;
      const fileName = `${tableName}.json`;
      await writeFile(path.join(destination, fileName), content, {
        encoding: "utf8",
        flag: "wx",
      });
      files.push({
        table: tableName,
        file: fileName,
        rows: rows.length,
        bytes: Buffer.byteLength(content),
        sha256: checksum(content),
      });
    }

    return {
      format: "trimora-public-json-v1",
      createdAt: new Date().toISOString(),
      transactionIsolation: "repeatable read, read only",
      files,
      columns,
    };
  });

  const manifestContent = `${JSON.stringify(manifest, null, 2)}\n`;
  await writeFile(path.join(destination, "manifest.json"), manifestContent, {
    encoding: "utf8",
    flag: "wx",
  });

  console.log(
    JSON.stringify({
      event: "production_backup_completed",
      destination,
      tables: manifest.files.length,
      rows: manifest.files.reduce((total, file) => total + file.rows, 0),
      manifestSha256: checksum(manifestContent),
    }),
  );
} finally {
  await sql.end({ timeout: 5 });
}
