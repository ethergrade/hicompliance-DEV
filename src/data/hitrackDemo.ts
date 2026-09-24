import type {
  HiTrackDashboardPayload,
  HiTrackDiskMetric,
  HiTrackMonitoredDevice,
  HiTrackRamMetric,
} from "@/lib/hitrack/types";

const trend = (base: number, length: number, swing = 4) =>
  Array.from({ length }, (_, index) =>
    Math.max(0, Math.min(100, base + Math.sin(index * 1.3) * swing + (index % 3) * 0.7)),
  );

const deviceSpecs = [
  ["CORE-SW-01", "10.40.0.2", "Switch", "Network appliance", "network os", "12.4", 1.8, 0.7],
  ["CORE-SW-02", "10.40.0.3", "Switch", "Network appliance", "network os", "12.4", 2.1, 0.8],
  ["EDGE-FW-01", "10.40.0.1", "Firewall", "Security appliance", "network os", "7.2", 3.2, 1.4],
  ["HV-NODE-01", "10.40.10.11", "Hypervisor", "Virtualization host", "linux", "8.0", 2.4, 0.9],
  ["HV-NODE-02", "10.40.10.12", "Hypervisor", "Virtualization host", "linux", "8.0", 2.7, 1.0],
  ["HV-NODE-03", "10.40.10.13", "Hypervisor", "Virtualization host", "linux", "8.0", 3.1, 1.2],
  ["SRV-DC-01", "10.40.10.21", "Server", "Virtual machine", "windows", "2022", 2.0, 0.8],
  ["SRV-DC-02", "10.40.10.22", "Server", "Virtual machine", "windows", "2022", 2.3, 0.9],
  ["SRV-FILE-01", "10.40.10.31", "Server", "Virtual machine", "windows", "2022", 3.7, 1.4],
  ["SRV-APP-01", "10.40.10.41", "Server", "Virtual machine", "linux", "9.4", 4.1, 1.7],
  ["SRV-APP-02", "10.40.10.42", "Server", "Virtual machine", "linux", "9.4", 4.3, 1.8],
  ["SRV-DB-01", "10.40.10.51", "Database server", "Virtual machine", "linux", "9.4", 5.2, 2.1],
  ["SRV-DB-02", "10.40.10.52", "Database server", "Virtual machine", "linux", "9.4", 5.8, 2.4],
  ["SRV-BACKUP-01", "10.40.10.61", "Backup server", "Virtual machine", "windows", "2022", 6.3, 2.6],
  ["NAS-01", "10.40.20.10", "Storage", "Storage appliance", "storage os", "7.1", 4.8, 2.0],
  ["NAS-02", "10.40.20.11", "Storage", "Storage appliance", "storage os", "7.1", 5.0, 2.1],
  ["AP-FLOOR1-01", "10.40.30.11", "Access point", "Wireless device", "network os", "6.5", 7.1, 3.2],
  ["AP-FLOOR1-02", "10.40.30.12", "Access point", "Wireless device", "network os", "6.5", 6.8, 3.0],
  ["AP-FLOOR2-01", "10.40.30.21", "Access point", "Wireless device", "network os", "6.5", 8.4, 3.6],
  ["AP-FLOOR2-02", "10.40.30.22", "Access point", "Wireless device", "network os", "6.5", 7.9, 3.4],
  ["PRINT-ADM-01", "10.40.40.21", "Printer", "Multifunction printer", null, null, 11.2, 4.8],
  ["PRINT-OPS-01", "10.40.40.22", "Printer", "Multifunction printer", null, null, 10.7, 4.4],
  ["WK-ADM-01", "10.40.50.101", "Workstation", "Desktop", "windows", "11", 2.9, 1.1],
  ["WK-ADM-02", "10.40.50.102", "Workstation", "Desktop", "windows", "11", 3.0, 1.2],
  ["WK-OPS-01", "10.40.50.111", "Workstation", "Desktop", "windows", "11", 3.4, 1.4],
  ["WK-OPS-02", "10.40.50.112", "Workstation", "Desktop", "windows", "11", 3.5, 1.5],
  ["WK-OPS-03", "10.40.50.113", "Workstation", "Desktop", "windows", "11", 3.8, 1.6],
  ["WK-DESIGN-01", "10.40.50.121", "Workstation", "Desktop", "macos", "15.1", 4.2, 1.9],
  ["WK-DESIGN-02", "10.40.50.122", "Workstation", "Desktop", "macos", "15.1", 4.5, 2.0],
  ["UPS-DATACENTER-01", "10.40.60.10", "Power", "UPS", null, null, 9.3, 4.1],
  ["CAM-ENTRY-01", "10.40.70.21", "Camera", "IP camera", null, null, 13.2, 5.4],
  ["CAM-WAREHOUSE-01", "10.40.70.22", "Camera", "IP camera", null, null, 15.6, 6.2],
] as const;

const monitoredDevices: HiTrackMonitoredDevice[] = deviceSpecs.map((item, index) => ({
  id: `demo-device-${index + 1}`,
  domotzDeviceId: 1000 + index,
  collectorId: "demo-collector-main",
  deviceName: item[0],
  ipAddress: item[1],
  type: item[2],
  vendor: item[3],
  osName: item[4],
  osVersion: item[5],
  status: index === 31 ? "attenzione" : "gestito",
  statusType: index === 31 ? "warning" : "success",
  rtdWorstMs: item[6],
  rtdMedianMs: item[7],
  packetLossPercent: index === 31 ? 1.2 : index % 9 === 0 ? 0.2 : 0,
  location: index < 16 ? "Datacenter" : "Sede principale",
  model: null,
  lastStatusChangeAt: null,
}));

const diskSpecs = [
  ["DATASTORE-PROD-01", "HV-NODE-01", "10.40.10.11", 4096, 68],
  ["DATASTORE-PROD-02", "HV-NODE-02", "10.40.10.12", 4096, 72],
  ["DATASTORE-BACKUP", "HV-NODE-03", "10.40.10.13", 8192, 81],
  ["C:", "SRV-DC-01", "10.40.10.21", 160, 47],
  ["C:", "SRV-DC-02", "10.40.10.22", 160, 52],
  ["C:", "SRV-FILE-01", "10.40.10.31", 240, 64],
  ["D:", "SRV-FILE-01", "10.40.10.31", 2048, 76],
  ["/", "SRV-APP-01", "10.40.10.41", 120, 41],
  ["/data", "SRV-APP-01", "10.40.10.41", 500, 58],
  ["/", "SRV-APP-02", "10.40.10.42", 120, 44],
  ["/data", "SRV-APP-02", "10.40.10.42", 500, 63],
  ["/", "SRV-DB-01", "10.40.10.51", 180, 56],
  ["/var/lib/data", "SRV-DB-01", "10.40.10.51", 2048, 84],
  ["/", "SRV-DB-02", "10.40.10.52", 180, 51],
  ["/var/lib/data", "SRV-DB-02", "10.40.10.52", 2048, 79],
  ["C:", "SRV-BACKUP-01", "10.40.10.61", 240, 62],
  ["E:", "SRV-BACKUP-01", "10.40.10.61", 6144, 88],
  ["ARCHIVE", "NAS-02", "10.40.20.11", 12288, 71],
] as const;

const logicalDisks: HiTrackDiskMetric[] = diskSpecs.map((item, index) => {
  const used = item[4];
  return {
    id: `demo-disk-${index + 1}`,
    collectorName: "Rete aziendale",
    deviceName: item[1],
    diskLabel: item[0],
    dimensionKey: `volume-${index + 1}`,
    ipAddress: item[2],
    status: used >= 85 ? "attenzione" : "operativo",
    statusType: used >= 85 ? "warning" : "success",
    usagePercent: used,
    sizeGiB: item[3],
    freeSpaceGiB: item[3] * (1 - used / 100),
    trend24h: trend(used, 12, 2),
    trend7d: trend(used - 2, 14, 4),
    trend30d: trend(used - 5, 16, 6),
  };
});

const ramSpecs = [
  ["HV-NODE-01", "10.40.10.11", 256, 61], ["HV-NODE-02", "10.40.10.12", 256, 66],
  ["HV-NODE-03", "10.40.10.13", 256, 73], ["SRV-DC-01", "10.40.10.21", 16, 48],
  ["SRV-DC-02", "10.40.10.22", 16, 51], ["SRV-FILE-01", "10.40.10.31", 32, 69],
  ["SRV-APP-01", "10.40.10.41", 32, 64], ["SRV-APP-02", "10.40.10.42", 32, 58],
  ["SRV-DB-01", "10.40.10.51", 128, 82], ["SRV-DB-02", "10.40.10.52", 128, 77],
  ["SRV-BACKUP-01", "10.40.10.61", 64, 71], ["NAS-01", "10.40.20.10", 32, 55],
  ["NAS-02", "10.40.20.11", 32, 59],
] as const;

const ramMonitoring: HiTrackRamMetric[] = ramSpecs.map((item, index) => ({
  id: `demo-ram-${index + 1}`,
  collectorName: "Rete aziendale",
  deviceName: item[0],
  dimensionLabel: item[0],
  dimensionKey: `host-${index + 1}`,
  ipAddress: item[1],
  totalRamGiB: item[2],
  usagePercent: item[3],
  usedRamGiB: item[2] * item[3] / 100,
  freeRamGiB: item[2] * (1 - item[3] / 100),
  status: item[3] >= 80 ? "attenzione" : "operativo",
  statusType: item[3] >= 80 ? "warning" : "success",
  trend24h: trend(item[3], 12, 3),
  trend7d: trend(item[3] - 2, 14, 5),
  trend30d: trend(item[3] - 4, 16, 7),
}));

export const HITRACK_DEMO_DATA: HiTrackDashboardPayload = {
  overview: {
    monitoredDevices: monitoredDevices.length,
    onlineDevices: 31,
    offlineDevices: 1,
    openAlerts: 3,
    managedDevices: monitoredDevices.length,
    unmanagedDevices: 0,
    healthScore: 91.6,
    dataCoveragePercent: 96.8,
    freshnessSeconds: 38,
    lastSyncedAt: new Date().toISOString(),
  },
  collectors: [{
    id: "demo-collector-main",
    organizationId: "demo",
    domotzAgentId: 1,
    collectorName: "Rete aziendale",
    collectorStatus: "ONLINE",
    matchingRule: null,
    lastSyncedAt: new Date().toISOString(),
    dataCoveragePercent: 96.8,
    freshnessSeconds: 38,
  }],
  monitoredDevices,
  logicalDisks,
  ramMonitoring,
  dataCoverage: {
    monitoredDevicesWithRtd: 32,
    managedDevices: 32,
    devicesWithRamMetrics: 13,
    devicesWithDiskMetrics: 18,
    ramCoveragePercent: 100,
    diskCoveragePercent: 100,
    note: "Copertura completa degli asset che espongono metriche quantitative verificate.",
  },
};

export function isHiTrackDemoOrganization(name?: string | null) {
  return name?.trim().toLocaleLowerCase("it-IT") === "innovatech group s.r.l.";
}