export type SpreadsheetCell = string | number | boolean | Date | DateConstructor | null | undefined;

const unsafeHeaders = new Set(["__proto__", "constructor", "prototype"]);

function isBlankCell(cell: SpreadsheetCell) {
  return cell === null || cell === undefined || (typeof cell === "string" && cell.trim() === "");
}

function normalizeCell(cell: SpreadsheetCell) {
  return cell instanceof Date ? cell.toISOString() : (cell ?? "");
}

function buildHeaders(row: readonly SpreadsheetCell[]) {
  const occurrences = new Map<string, number>();

  return row.map((cell, index) => {
    const candidate = String(normalizeCell(cell)).trim() || `Columna_${index + 1}`;
    const safeCandidate = unsafeHeaders.has(candidate) ? `Columna_${index + 1}` : candidate;
    const occurrence = (occurrences.get(safeCandidate) ?? 0) + 1;
    occurrences.set(safeCandidate, occurrence);
    return occurrence === 1 ? safeCandidate : `${safeCandidate}_${occurrence}`;
  });
}

export function rowsToRecords(rows: readonly (readonly SpreadsheetCell[])[]) {
  const headerIndex = rows.findIndex((row) => row.some((cell) => !isBlankCell(cell)));
  if (headerIndex === -1) return [];

  const headers = buildHeaders(rows[headerIndex]);
  return rows.slice(headerIndex + 1).flatMap((row) => {
    if (row.every(isBlankCell)) return [];

    return [
      Object.fromEntries(headers.map((header, index) => [header, normalizeCell(row[index])])),
    ];
  });
}

export function parseCsv(csv: string): string[][] {
  const source = csv.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  const commitCell = () => {
    row.push(cell);
    cell = "";
  };
  const commitRow = () => {
    commitCell();
    rows.push(row);
    row = [];
  };

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];

    if (quoted) {
      if (character === '"') {
        if (source[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += character;
      }
      continue;
    }

    if (character === '"' && cell.length === 0) quoted = true;
    else if (character === ",") commitCell();
    else if (character === "\n") commitRow();
    else if (character !== "\r") cell += character;
  }

  if (quoted) throw new Error("El archivo CSV contiene una celda sin cerrar");
  if (cell.length > 0 || row.length > 0) commitRow();
  return rows;
}
