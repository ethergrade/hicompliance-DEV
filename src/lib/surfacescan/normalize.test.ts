import { describe, expect, it } from "vitest";
import { toCvss, toEpss } from "./normalize";

describe("toCvss", () => {
  it("accetta numeri e stringhe numeriche (decimal da PostgreSQL)", () => {
    expect(toCvss(9.8)).toBe(9.8);
    expect(toCvss("9.8")).toBe(9.8);
    expect(toCvss("0")).toBe(0);
  });

  it("scarta vuoti, testo e valori fuori scala", () => {
    expect(toCvss(null)).toBeNull();
    expect(toCvss(undefined)).toBeNull();
    expect(toCvss("")).toBeNull();
    expect(toCvss("  ")).toBeNull();
    expect(toCvss("n/d")).toBeNull();
    expect(toCvss(11)).toBeNull();
    expect(toCvss(-1)).toBeNull();
    expect(toCvss(Number.NaN)).toBeNull();
  });
});

describe("toEpss", () => {
  it("resta nella scala 0–1", () => {
    expect(toEpss("0.00042")).toBe(0.00042);
    expect(toEpss(1)).toBe(1);
    expect(toEpss(42)).toBeNull();
  });
});
