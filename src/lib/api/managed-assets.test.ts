import { afterEach, describe, expect, it, vi } from "vitest";
import { availabilityOf, nearestExpiry, haloSyncRunning, isSyncedFromGestionale, type AssetHiTrackMatch, type HaloLink, type ManagedAsset } from "./managed-assets";

const match = (over: Partial<AssetHiTrackMatch>): AssetHiTrackMatch => ({
	deviceId: "d", mode: "ip", deviceName: "fw", ipAddress: null, type: null, vendor: null, model: null,
	location: null, osName: null, networkHealth: null, lastStatusChangeAt: null,
	status: "online", statusType: "success", ...over,
});

describe("managed assets", () => {
	afterEach(() => vi.useRealTimers());

	it("an online device with a struggling network is amber, not green", () => {
		expect(availabilityOf(match({}))).toBe("up");
		expect(availabilityOf(match({ networkHealth: "amber" }))).toBe("warn");
		expect(availabilityOf(match({ status: "offline", statusType: "error", networkHealth: "green" }))).toBe("down");
		expect(availabilityOf(match({ status: "unknown", statusType: "muted" }))).toBe("unknown");
		expect(availabilityOf(null)).toBe("unknown");
	});

	it("the nearest expiry is the first between contract and warranty", () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-10-27T10:00:00Z"));
		const a = { end_contract_date: "2027-10-27", warranty_expiration: "2026-11-06" } as ManagedAsset;
		expect(nearestExpiry(a)).toBe(10);
		expect(nearestExpiry({ end_contract_date: null, warranty_expiration: null } as ManagedAsset)).toBeNull();
	});
});

describe("Halo", () => {
	const link = (status: HaloLink["lastSyncStatus"], minutiFa: number): HaloLink => ({
		haloClientId: "265", haloClientName: "AKC", lastSyncStatus: status, lastSyncMessage: null, lastSyncCounts: null,
		lastSyncStartedAt: new Date(Date.now() - minutiFa * 60_000).toISOString(), lastSyncAt: null, linkedAt: null,
	});

	it("una sync è in corso finché batte, per quanto duri", () => {
		const battito = (minutiFa: number) => ({ ...link("running", 20), heartbeatAt: new Date(Date.now() - minutiFa * 60_000).toISOString() });
		expect(haloSyncRunning(battito(1))).toBe(true);
		expect(haloSyncRunning(battito(4))).toBe(false);
		expect(haloSyncRunning({ ...battito(1), lastSyncStatus: "ok" })).toBe(false);
		// backend senza battito: mezz'ora dall'avvio
		expect(haloSyncRunning(link("running", 20))).toBe(true);
		expect(haloSyncRunning(link("running", 31))).toBe(false);
		expect(haloSyncRunning(null)).toBe(false);
	});

	it("un asset sparito dal gestionale non è più bloccato", () => {
		expect(isSyncedFromGestionale({ source: "halo", halo_removed_at: null })).toBe(true);
		expect(isSyncedFromGestionale({ source: "halo", halo_removed_at: "2026-10-28T10:00:00Z" })).toBe(false);
		expect(isSyncedFromGestionale({ source: "manual", halo_removed_at: null })).toBe(false);
	});
});
