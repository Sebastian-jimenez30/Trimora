import { describe, expect, it } from "vitest";
import {
  addMoney,
  fromMoneyCents,
  fromQuantityUnits,
  toMoneyCents,
  toQuantityUnits,
} from "../money";

describe("aritmetica monetaria del POS", () => {
  it("opera en centavos sin propagar errores de punto flotante", () => {
    expect(toMoneyCents(0.1 + 0.2)).toBe(30);
    expect(addMoney("10.10", "20.20", 0.3)).toBe(3060);
    expect(fromMoneyCents(3060)).toBe("30.60");
  });

  it("conserva cuatro decimales para consumibles", () => {
    expect(toQuantityUnits("1.2345")).toBe(12_345);
    expect(fromQuantityUnits(12_345)).toBe("1.2345");
  });

  it("rechaza valores no finitos o fuera del rango seguro", () => {
    expect(() => toMoneyCents(Number.POSITIVE_INFINITY)).toThrow();
    expect(() => toQuantityUnits(Number.MAX_SAFE_INTEGER)).toThrow();
  });
});
