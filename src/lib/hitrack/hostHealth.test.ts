import { describe, expect, it } from "vitest";
import { computeAllHosts, usageScore, worstHosts } from "./hostHealth";
import { EMPTY_HITRACK_DASHBOARD, type HiTrackDashboardPayload, type HiTrackMonitoredDevice } from "./types";

const device = (id: string, over: Partial<HiTrackMonitoredDevice> = {}): HiTrackMonitoredDevice => ({
	id,
	domotzDeviceId: 1,
	collectorId: "c",
	deviceName: id,
	type: "server",
	ipAddress: null,
	status: "online",
	statusType: "success",
	rtdWorstMs: null,
	rtdMedianMs: null,
	packetLossPercent: null,
	location: null,
	vendor: null,
	model: null,
	osName: null,
	osVersion: null,
	lastStatusChangeAt: null,
	...over,
});

const ram = (deviceId: string, usagePercent: number, dimensionLabel: string | null = null) => ({
	id: `ram-${deviceId}-${dimensionLabel}`,
	deviceId,
	collectorName: "c",
	deviceName: deviceId,
	dimensionLabel,
	dimensionKey: "",
	ipAddress: null,
	totalRamGiB: 64,
	usagePercent,
	usedRamGiB: null,
	freeRamGiB: null,
	status: "runtime",
	statusType: "success" as const,
	trend24h: [],
	trend7d: [],
	trend30d: [],
});

const payload = (over: Partial<HiTrackDashboardPayload>): HiTrackDashboardPayload => ({ ...EMPTY_HITRACK_DASHBOARD, ...over });

describe("hostHealth", () => {
	it("usage stays full up to 75% and falls to zero at 100%", () => {
		expect(usageScore(75)).toBe(100);
		expect(usageScore(87.5)).toBe(50);
		expect(usageScore(100)).toBe(0);
		expect(usageScore(null)).toBeNull();
	});

	it("an unknown status is N/D, not a full mark", () => {
		const [h] = computeAllHosts(payload({ monitoredDevices: [device("a", { status: "unknown", statusType: "muted" })] }));
		expect(h.availability).toBeNull();
		expect(h.score).toBeNull();
	});

	it("uses the backend network score, so ICMP-limited hosts are not flagged", () => {
		const esxi = device("esxi", {
			packetLossPercent: 25,
			networkQuality: { algorithmVersion: "network-quality-v2", score: 95, health: "green", dataQuality: "ok", reasons: ["icmp_rate_limited"], observedAt: null },
		});
		const [h] = computeAllHosts(payload({ monitoredDevices: [esxi] }));
		expect(h.network).toBe(95);
		expect(h.reasons).toEqual([]);
		expect(worstHosts([h])).toEqual([]);
	});

	it("gives ESXi RAM rows to the ESXi host when it is monitored, otherwise to the vCenter", () => {
		const vcenter = device("vcenter");
		const esxi = device("esxi", { ipAddress: "10.0.100.80" });
		const hosts = computeAllHosts(
			payload({
				monitoredDevices: [vcenter, esxi],
				ramMonitoring: [ram("vcenter", 95, "10.0.100.80"), ram("vcenter", 40, "10.0.100.81")],
			}),
		);
		const by = Object.fromEntries(hosts.map((h) => [h.device.id, h]));
		expect(by.esxi.ramUsage).toBe(95);
		expect(by.esxi.reasons.map((r) => r.severity)).toEqual(["crit"]);
		expect(by.vcenter.ramUsage).toBe(40);
	});

	it("an offline host is the worst and healthy hosts never appear among the worst", () => {
		const hosts = computeAllHosts(
			payload({ monitoredDevices: [device("ok"), device("giu", { status: "offline", statusType: "error" })] }),
		);
		expect(worstHosts(hosts).map((h) => h.device.id)).toEqual(["giu"]);
	});
});
