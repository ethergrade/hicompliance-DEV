import type { HiTrackDashboardPayload, HiTrackMonitoredDevice, HiTrackDiskMetric, HiTrackRamMetric } from "./types";

/** Soglie usate per motivi e punteggio host. */
export const THRESHOLDS = {
  usageWarn: 80,
  usageCrit: 90,
  lossWarn: 1,
  lossCrit: 5,
  rtdWarn: 100,
  rtdCrit: 300,
} as const;

export type Severity = "ok" | "warn" | "crit";
export interface HealthReason { kind: "offline" | "ram" | "disk" | "network"; severity: Severity; text: string }
export interface HostHealth {
  device: HiTrackMonitoredDevice;
  score: number;
  availability: number;
  ram: number | null;
  disk: number | null;
  network: number;
  ramUsage: number | null;
  diskUsage: number | null;
  reasons: HealthReason[];
}

const clamp = (v: number) => Math.max(0, Math.min(100, v));

/** 100 fino alla soglia di attenzione, poi scende linearmente a 0 al 100%. */
export function usageScore(p: number | null): number | null {
  if (p === null || p === undefined || Number.isNaN(p)) return null;
  if (p <= THRESHOLDS.usageWarn) return 100;
  return clamp(100 - ((p - THRESHOLDS.usageWarn) / (100 - THRESHOLDS.usageWarn)) * 100);
}

/** Qualità rete calcolata da packet loss e RTD peggiore (non è banda in Mbps). */
export function networkScore(lossPct: number | null, rtdWorst: number | null): number {
  const loss = lossPct ?? 0;
  const rtd = rtdWorst ?? 0;
  const lossPart = clamp(100 - (loss / THRESHOLDS.lossCrit) * 100);
  const rtdPart = rtd <= THRESHOLDS.rtdWarn ? 100 : clamp(100 - ((rtd - THRESHOLDS.rtdWarn) / (THRESHOLDS.rtdCrit - THRESHOLDS.rtdWarn)) * 100);
  return Math.min(lossPart, rtdPart);
}

const sev = (v: number, warn: number, crit: number): Severity => (v > crit ? "crit" : v > warn ? "warn" : "ok");

function matches(device: HiTrackMonitoredDevice, name: string | null | undefined, ip: string | null | undefined) {
  const n = device.deviceName.toLowerCase();
  return (!!ip && !!device.ipAddress && ip === device.ipAddress) || (!!name && name.toLowerCase() === n);
}

export function computeHostHealth(device: HiTrackMonitoredDevice, disks: HiTrackDiskMetric[], rams: HiTrackRamMetric[]): HostHealth {
  const myRam = rams.filter((r) => matches(device, r.dimensionLabel, r.ipAddress) || matches(device, r.deviceName, null));
  const myDisks = disks.filter((d) => matches(device, d.deviceName, d.ipAddress));
  const ramUsage = myRam.length ? Math.max(...myRam.map((r) => r.usagePercent ?? 0)) : null;
  const diskUsage = myDisks.length ? Math.max(...myDisks.map((d) => d.usagePercent ?? 0)) : null;
  const offline = device.statusType === "error";
  const availability = offline ? 0 : device.statusType === "warning" ? 50 : 100;
  const ram = usageScore(ramUsage);
  const disk = usageScore(diskUsage);
  const network = networkScore(device.packetLossPercent, device.rtdWorstMs);
  const parts = [availability, network, ram, disk].filter((x): x is number => x !== null);
  const score = Math.round((parts.reduce((a, b) => a + b, 0) / parts.length) * 10) / 10;

  const reasons: HealthReason[] = [];
  if (offline) reasons.push({ kind: "offline", severity: "crit", text: "Host offline" });
  else if (device.statusType === "warning") reasons.push({ kind: "offline", severity: "warn", text: `Stato: ${device.status}` });
  if (ramUsage !== null) {
    const s = sev(ramUsage, THRESHOLDS.usageWarn, THRESHOLDS.usageCrit);
    if (s !== "ok") reasons.push({ kind: "ram", severity: s, text: `RAM al ${ramUsage.toFixed(1)}%` });
  }
  if (diskUsage !== null) {
    const s = sev(diskUsage, THRESHOLDS.usageWarn, THRESHOLDS.usageCrit);
    if (s !== "ok") {
      const worst = myDisks.reduce((a, b) => ((b.usagePercent ?? 0) > (a.usagePercent ?? 0) ? b : a));
      reasons.push({ kind: "disk", severity: s, text: `Disco ${worst.diskLabel} al ${diskUsage.toFixed(1)}%` });
    }
  }
  const loss = device.packetLossPercent ?? 0, rtd = device.rtdWorstMs ?? 0;
  const ls = sev(loss, THRESHOLDS.lossWarn, THRESHOLDS.lossCrit), rs = sev(rtd, THRESHOLDS.rtdWarn, THRESHOLDS.rtdCrit);
  if (ls !== "ok" || rs !== "ok") {
    reasons.push({ kind: "network", severity: ls === "crit" || rs === "crit" ? "crit" : "warn", text: `Rete degradata: packet loss ${loss.toFixed(1)}%, RTD peggiore ${rtd.toFixed(0)} ms` });
  }
  return { device, score, availability, ram, disk, network, ramUsage, diskUsage, reasons };
}

export function computeAllHosts(data: HiTrackDashboardPayload): HostHealth[] {
  return data.monitoredDevices.map((d) => computeHostHealth(d, data.logicalDisks, data.ramMonitoring));
}

/** I 5 host peggiori: solo quelli con almeno un problema. */
export function worstHosts(hosts: HostHealth[], n = 5): HostHealth[] {
  return [...hosts].filter((h) => h.reasons.length > 0).sort((a, b) => a.score - b.score).slice(0, n);
}

export interface GlobalBreakdownItem { label: string; value: number; max: number; detail: string }

/** Ricostruzione della formula documentata in HITRACK_HEALTH_SCORE.md con i dati del payload. */
export function globalBreakdown(data: HiTrackDashboardPayload): GlobalBreakdownItem[] {
  const o = data.overview;
  const managed = o.managedDevices || o.monitoredDevices;
  const avail = managed ? (o.onlineDevices / managed) * 45 : 0;
  const alertPen = Math.min(20, o.openAlerts * 2);
  const losses = data.monitoredDevices.map((d) => d.packetLossPercent).filter((x): x is number => x !== null);
  const avgLoss = losses.length ? losses.reduce((a, b) => a + b, 0) / losses.length : 0;
  const lossPen = Math.min(15, avgLoss * 3);
  const coverage = (o.dataCoveragePercent / 100) * 15;
  const fresh = o.freshnessSeconds === null ? 0 : o.freshnessSeconds <= 900 ? 5 : o.freshnessSeconds <= 3600 ? 2.5 : 0;
  return [
    { label: "Disponibilità", value: avail, max: 45, detail: `${o.onlineDevices}/${managed} dispositivi online` },
    { label: "Alert aperti", value: -alertPen, max: 20, detail: `${o.openAlerts} alert aperti` },
    { label: "Packet loss", value: -lossPen, max: 15, detail: `media ${avgLoss.toFixed(2)}%` },
    { label: "Copertura dati", value: coverage, max: 15, detail: `${o.dataCoveragePercent.toFixed(1)}% copertura` },
    { label: "Freschezza", value: fresh, max: 5, detail: o.freshnessSeconds === null ? "dato non disponibile" : `${o.freshnessSeconds}s dall'ultimo sync` },
  ];
}
