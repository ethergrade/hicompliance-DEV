export type HiTrackTrendWindow = "24h" | "7d" | "30d";

export interface HiTrackCollector {
  id: string;
  organizationId: string;
  domotzAgentId: number;
  collectorName: string;
  collectorStatus: string;
  matchingRule: string | null;
  lastSyncedAt: string | null;
  dataCoveragePercent: number;
  freshnessSeconds: number | null;
}

export interface HiTrackOverview {
  monitoredDevices: number;
  onlineDevices: number;
  offlineDevices: number;
  openAlerts: number;
  managedDevices: number;
  unmanagedDevices: number;
  healthScore: number;
  dataCoveragePercent: number;
  freshnessSeconds: number | null;
  lastSyncedAt: string | null;
}

export interface HiTrackMonitoredDevice {
  id: string;
  domotzDeviceId: number;
  collectorId: string;
  deviceName: string;
  type: string;
  ipAddress: string | null;
  status: string;
  statusType: "success" | "warning" | "error" | "muted";
  rtdWorstMs: number | null;
  rtdMedianMs: number | null;
  packetLossPercent: number | null;
  location: string | null;
  vendor: string | null;
  model: string | null;
  osName: string | null;
  osVersion: string | null;
  lastStatusChangeAt: string | null;
}

export interface HiTrackDiskMetric {
  id: string;
  collectorName: string;
  deviceName: string;
  /** Nome leggibile del datastore («DS_01»), con ripiego sull'identificativo interno. */
  diskLabel: string;
  /** L'identificativo interno di vCenter («datastore-1149»), per il riscontro tecnico. */
  dimensionKey: string;
  ipAddress: string | null;
  status: string;
  statusType: "success" | "warning" | "error" | "muted";
  usagePercent: number | null;
  sizeGiB: number | null;
  freeSpaceGiB: number | null;
  trend24h: number[];
  trend7d: number[];
  trend30d: number[];
}

export interface HiTrackRamMetric {
  id: string;
  collectorName: string;
  deviceName: string;
  /** L'host ESXi cui la misura si riferisce: più host stanno dietro lo stesso vCenter. */
  dimensionLabel: string | null;
  /** L'identificativo interno («host-21»), quando il nome non è disponibile. */
  dimensionKey: string;
  ipAddress: string | null;
  totalRamGiB: number | null;
  usagePercent: number | null;
  usedRamGiB: number | null;
  freeRamGiB: number | null;
  status: string;
  statusType: "success" | "warning" | "error" | "muted";
  trend24h: number[];
  trend7d: number[];
  trend30d: number[];
}

export interface HiTrackDataCoverage {
  monitoredDevicesWithRtd: number;
  managedDevices: number;
  devicesWithRamMetrics: number;
  devicesWithDiskMetrics: number;
  ramCoveragePercent: number;
  diskCoveragePercent: number;
  note: string | null;
}

export interface HiTrackDashboardPayload {
  overview: HiTrackOverview;
  collectors: HiTrackCollector[];
  monitoredDevices: HiTrackMonitoredDevice[];
  ramMonitoring: HiTrackRamMetric[];
  logicalDisks: HiTrackDiskMetric[];
  dataCoverage: HiTrackDataCoverage;
}

export const EMPTY_HITRACK_DASHBOARD: HiTrackDashboardPayload = {
  overview: {
    monitoredDevices: 0,
    onlineDevices: 0,
    offlineDevices: 0,
    openAlerts: 0,
    managedDevices: 0,
    unmanagedDevices: 0,
    healthScore: 0,
    dataCoveragePercent: 0,
    freshnessSeconds: null,
    lastSyncedAt: null,
  },
  collectors: [],
  monitoredDevices: [],
  ramMonitoring: [],
  logicalDisks: [],
  dataCoverage: {
    monitoredDevicesWithRtd: 0,
    managedDevices: 0,
    devicesWithRamMetrics: 0,
    devicesWithDiskMetrics: 0,
    ramCoveragePercent: 0,
    diskCoveragePercent: 0,
    note: "Dato non disponibile",
  },
};
