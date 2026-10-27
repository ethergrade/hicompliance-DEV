import type { HiTrackDashboardPayload, HiTrackDiskMetric, HiTrackMonitoredDevice, HiTrackRamMetric } from "./types";

/**
 * Salute di un singolo host, da 0 a 100: la media delle voci per cui c'è un dato.
 * Una voce senza dato non pesa e si mostra N/D.
 *
 * Le soglie di RAM e disco sono quelle del resto della dashboard (75 e 90, come il
 * backend). La rete non si ricalcola: si usa il punteggio di qualità rete del
 * backend, che sa già ignorare la perdita sui device che limitano i ping (ESXi,
 * iDRAC). Ricalcolandola da perdita e latenza grezze quei device finirebbero fra
 * i peggiori per un falso allarme.
 */
export const THRESHOLDS = { usageWarn: 75, usageCrit: 90 } as const;

export type Severity = "ok" | "warn" | "crit";
export interface HealthReason {
	kind: "offline" | "ram" | "disk" | "network";
	severity: Severity;
	text: string;
}

export interface HostHealth {
	device: HiTrackMonitoredDevice;
	/** null se nessuna voce ha un dato. */
	score: number | null;
	availability: number | null;
	ram: number | null;
	disk: number | null;
	network: number | null;
	ramUsage: number | null;
	diskUsage: number | null;
	reasons: HealthReason[];
}

const clamp = (v: number) => Math.max(0, Math.min(100, v));

/** 100 fino alla soglia di attenzione, poi giù in linea retta fino a 0 al 100%. */
export function usageScore(p: number | null): number | null {
	if (p === null || Number.isNaN(p)) return null;
	if (p <= THRESHOLDS.usageWarn) return 100;
	return clamp(100 - ((p - THRESHOLDS.usageWarn) / (100 - THRESHOLDS.usageWarn)) * 100);
}

export const usageSeverity = (p: number): Severity =>
	p >= THRESHOLDS.usageCrit ? "crit" : p >= THRESHOLDS.usageWarn ? "warn" : "ok";

const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

/**
 * A quale device appartiene una riga RAM. Di norma al device che la misura
 * (deviceId). Su un vCenter però le righe sono una per host ESXi: se l'host è a
 * sua volta un device monitorato (stesso IP o nome) la RAM è sua, non del vCenter.
 */
function ramOwner(row: HiTrackRamMetric, devices: HiTrackMonitoredDevice[]): string | undefined {
	const host = norm(row.dimensionLabel);
	if (host) {
		const esxi = devices.find((d) => norm(d.ipAddress) === host || norm(d.deviceName) === host);
		if (esxi) return esxi.id;
	}
	return row.deviceId;
}

function hostHealth(device: HiTrackMonitoredDevice, rams: HiTrackRamMetric[], disks: HiTrackDiskMetric[]): HostHealth {
	const maxUsage = (rows: Array<{ usagePercent: number | null }>) => {
		const v = rows.map((r) => r.usagePercent).filter((x): x is number => x !== null);
		return v.length ? Math.max(...v) : null;
	};
	const ramUsage = maxUsage(rams);
	const diskUsage = maxUsage(disks);

	const availability = device.statusType === "success" ? 100 : device.statusType === "error" ? 0 : null;
	const ram = usageScore(ramUsage);
	const disk = usageScore(diskUsage);
	const network = device.networkQuality?.score ?? null;

	const parts = [availability, ram, disk, network].filter((x): x is number => x !== null);
	const score = parts.length ? Math.round(parts.reduce((a, b) => a + b, 0) / parts.length) : null;

	const reasons: HealthReason[] = [];
	if (device.statusType === "error") reasons.push({ kind: "offline", severity: "crit", text: "Host offline" });
	if (ramUsage !== null && usageSeverity(ramUsage) !== "ok") {
		reasons.push({ kind: "ram", severity: usageSeverity(ramUsage), text: `RAM al ${ramUsage.toFixed(1)}%` });
	}
	if (diskUsage !== null && usageSeverity(diskUsage) !== "ok") {
		const worst = disks.reduce((a, b) => ((b.usagePercent ?? 0) > (a.usagePercent ?? 0) ? b : a));
		reasons.push({ kind: "disk", severity: usageSeverity(diskUsage), text: `Disco ${worst.diskLabel} al ${diskUsage.toFixed(1)}%` });
	}
	const nq = device.networkQuality?.health;
	if (nq === "red" || nq === "amber") {
		reasons.push({
			kind: "network",
			severity: nq === "red" ? "crit" : "warn",
			text: `Qualità rete ${device.networkQuality?.score ?? "N/D"}/100`,
		});
	}

	return { device, score, availability, ram, disk, network, ramUsage, diskUsage, reasons };
}

export function computeAllHosts(data: HiTrackDashboardPayload): HostHealth[] {
	const devices = data.monitoredDevices;
	const ramByDevice = new Map<string, HiTrackRamMetric[]>();
	for (const row of data.ramMonitoring) {
		const owner = ramOwner(row, devices);
		if (owner) ramByDevice.set(owner, [...(ramByDevice.get(owner) ?? []), row]);
	}
	const diskByDevice = new Map<string, HiTrackDiskMetric[]>();
	for (const row of data.logicalDisks) {
		if (row.deviceId) diskByDevice.set(row.deviceId, [...(diskByDevice.get(row.deviceId) ?? []), row]);
	}

	return devices.map((d) => hostHealth(d, ramByDevice.get(d.id) ?? [], diskByDevice.get(d.id) ?? []));
}

/** I 5 host peggiori, solo fra quelli con almeno un problema: un host sano non ci finisce. */
export function worstHosts(hosts: HostHealth[], n = 5): HostHealth[] {
	return hosts
		.filter((h) => h.reasons.length > 0)
		.sort((a, b) => (a.score ?? 101) - (b.score ?? 101))
		.slice(0, n);
}
