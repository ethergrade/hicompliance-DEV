import { describe, it, expect } from "vitest";
import { usageScore, networkScore, computeHostHealth, worstHosts } from "./hostHealth";
import type { HiTrackMonitoredDevice } from "./types";

const dev = (p: Partial<HiTrackMonitoredDevice> = {}): HiTrackMonitoredDevice => ({
  id: "d1", domotzDeviceId: 1, collectorId: "c", deviceName: "SRV-1", type: "Server", ipAddress: "10.0.0.1",
  status: "gestito", statusType: "success", rtdWorstMs: 5, rtdMedianMs: 2, packetLossPercent: 0,
  location: null, vendor: null, model: null, osName: null, osVersion: null, lastStatusChangeAt: null, ...p,
});

describe("hostHealth", () => {
  it("usageScore", () => {
    expect(usageScore(50)).toBe(100);
    expect(usageScore(90)).toBe(50);
    expect(usageScore(null)).toBeNull();
  });
  it("networkScore", () => {
    expect(networkScore(0, 10)).toBe(100);
    expect(networkScore(5, 10)).toBe(0);
  });
  it("host sano senza motivi; offline con motivo", () => {
    expect(computeHostHealth(dev(), [], []).reasons).toHaveLength(0);
    const off = computeHostHealth(dev({ statusType: "error" }), [], []);
    expect(off.reasons[0].kind).toBe("offline");
    expect(worstHosts([off, computeHostHealth(dev(), [], [])])).toHaveLength(1);
  });
  it("RAM alta collegata per IP", () => {
    const h = computeHostHealth(dev(), [], [{ id: "r", collectorName: "c", deviceName: "x", dimensionLabel: null, dimensionKey: "k", ipAddress: "10.0.0.1", totalRamGiB: 16, usagePercent: 95, usedRamGiB: 15, freeRamGiB: 1, status: "", statusType: "error", trend24h: [], trend7d: [], trend30d: [] }]);
    expect(h.reasons.some((r) => r.kind === "ram" && r.severity === "crit")).toBe(true);
  });
});
