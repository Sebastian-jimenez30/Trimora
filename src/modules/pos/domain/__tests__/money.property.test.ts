import { describe, expect, it } from "vitest";
import {
  addMoney,
  fromMoneyCents,
  fromQuantityUnits,
  toMoneyCents,
  toQuantityUnits,
} from "../money";

function createDeterministicGenerator(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state;
  };
}

describe("propiedades de dinero e inventario", () => {
  it("conserva cualquier monto representable al ir y volver de centavos", () => {
    const next = createDeterministicGenerator(0x5eedc0de);
    for (let index = 0; index < 2_000; index += 1) {
      const cents = next() % 100_000_000;
      expect(toMoneyCents(fromMoneyCents(cents))).toBe(cents);
    }
  });

  it("mantiene suma conmutativa y asociativa sin error flotante", () => {
    const next = createDeterministicGenerator(0xcafef00d);
    for (let index = 0; index < 1_000; index += 1) {
      const first = fromMoneyCents(next() % 1_000_000);
      const second = fromMoneyCents(next() % 1_000_000);
      const third = fromMoneyCents(next() % 1_000_000);
      expect(addMoney(first, second)).toBe(addMoney(second, first));
      expect(addMoney(fromMoneyCents(addMoney(first, second)), third)).toBe(
        addMoney(first, fromMoneyCents(addMoney(second, third))),
      );
    }
  });

  it("conserva cualquier cantidad de inventario con cuatro decimales", () => {
    const next = createDeterministicGenerator(0xdecafbad);
    for (let index = 0; index < 2_000; index += 1) {
      const units = next() % 100_000_000;
      expect(toQuantityUnits(fromQuantityUnits(units))).toBe(units);
    }
  });

  it("aplica redondeo decimal estable en los limites", () => {
    expect(toMoneyCents("10.121")).toBe(1_012);
    expect(toMoneyCents("10.126")).toBe(1_013);
    expect(toQuantityUnits("1.23454")).toBe(12_345);
    expect(toQuantityUnits("1.23456")).toBe(12_346);
  });
});
