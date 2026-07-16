import { describe, expect, it } from "vitest";
import {
  classifyUsageStatus,
  formatFreshness,
  matchCollectorAlias,
  normalizeClientAlias,
  pickTrend,
} from "@/lib/hitrack/formatters";

describe("HiTrack formatters", () => {
  it("normalizes client aliases for collector matching", () => {
    expect(normalizeClientAlias("ETRURIA_SOCIETA_COOPERATIVA")).toBe(
      "etruria_societa_cooperativa",
    );
    expect(
      matchCollectorAlias(
        "ETRURIA_SOCIETA_COOPERATIVA",
        "collector-etruria-societa-cooperativa",
      ),
    ).toBe(true);
  });

  it("classifies usage thresholds conservatively", () => {
    expect(classifyUsageStatus(null)).toBe("muted");
    expect(classifyUsageStatus(55)).toBe("success");
    expect(classifyUsageStatus(80)).toBe("warning");
    expect(classifyUsageStatus(95)).toBe("error");
  });

  it("formats freshness in readable buckets", () => {
    expect(formatFreshness(45)).toBe("meno di 1 minuto");
    expect(formatFreshness(90)).toBe("1 minuti");
    expect(formatFreshness(7200)).toBe("2 ore");
  });

  it("picks the trend series for the requested window", () => {
    const source = {
      trend24h: [1, 2],
      trend7d: [3, 4],
      trend30d: [5, 6],
    };
    expect(pickTrend(source, "24h")).toEqual([1, 2]);
    expect(pickTrend(source, "7d")).toEqual([3, 4]);
    expect(pickTrend(source, "30d")).toEqual([5, 6]);
  });
});
