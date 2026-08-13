import { describe, expect, it } from "vitest";
import { parseCsv, rowsToRecords } from "../spreadsheet";

describe("importacion segura de hojas de calculo", () => {
  it("convierte encabezados y filas en registros", () => {
    expect(
      rowsToRecords([
        ["Nombre", "Precio"],
        ["Corte", 25_000],
        [null, null],
      ]),
    ).toEqual([{ Nombre: "Corte", Precio: 25_000 }]);
  });

  it("protege encabezados especiales y duplicados", () => {
    expect(
      rowsToRecords([
        ["name", "name", "__proto__"],
        ["Cera", "Premium", true],
      ]),
    ).toEqual([{ name: "Cera", name_2: "Premium", Columna_3: true }]);
  });

  it("interpreta comas, saltos de linea y comillas escapadas en CSV", () => {
    const rows = parseCsv(
      '\uFEFFNombre,Descripcion\r\n"Corte, premium","Linea 1\nLinea 2 ""VIP"""',
    );

    expect(rowsToRecords(rows)).toEqual([
      { Nombre: "Corte, premium", Descripcion: 'Linea 1\nLinea 2 "VIP"' },
    ]);
  });

  it("rechaza un CSV con comillas sin cerrar", () => {
    expect(() => parseCsv('Nombre\n"Corte')).toThrow("sin cerrar");
  });
});
