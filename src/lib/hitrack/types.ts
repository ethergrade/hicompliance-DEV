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
  networkQuality?: HiTrackNetworkQuality;
  /** Interfacce di rete note per il device: se > 0 c'è un dettaglio da aprire. */
  interfaceCount?: number;
  /** Host, datastore e VM letti dal device (vCenter). */
  inventoryCount?: number;
}

/** Stato attuale di un'interfaccia di rete. Traffico in bit/s. */
export interface HiTrackInterface {
  id: string;
  index: string;
  name: string | null;
  alias: string | null;
  type: string | null;
  physical: boolean;
  macAddress: string | null;
  mtu: number | null;
  speedBps: number | null;
  adminStatus: string | null;
  operStatus: string | null;
  operStatusSince: string | null;
  inBps: number | null;
  outBps: number | null;
  inUsagePercent: number | null;
  outUsagePercent: number | null;
  inErrors: number | null;
  outErrors: number | null;
  inDiscards: number | null;
  outDiscards: number | null;
  sampledAt: string | null;
  stale: boolean;
}

export interface HiTrackInventoryItem {
  id: string;
  key: string;
  name: string;
  attributes: Array<{ label: string; value: string }>;
  sampledAt: string | null;
}

export interface HiTrackDeviceDetail {
  deviceId: string;
  deviceName: string;
  interfaces: HiTrackInterface[];
  inventory: {
    hosts: HiTrackInventoryItem[];
    datastores: HiTrackInventoryItem[];
    vms: HiTrackInventoryItem[];
  };
}

export type HiTrackHistoryRange = "24h" | "7d" | "30d";

export interface HiTrackInterfacePoint {
  at: string;
  samples: number;
  inBpsAvg: number | null;
  inBpsMax: number | null;
  outBpsAvg: number | null;
  outBpsMax: number | null;
  inUsageAvg: number | null;
  inUsageMax: number | null;
  outUsageAvg: number | null;
  outUsageMax: number | null;
  downMinutes: number;
  inErrorsMax: number | null;
  outErrorsMax: number | null;
}

export interface HiTrackInterfaceHistory {
  interfaceId: string;
  range: HiTrackHistoryRange;
  granularity: "hour" | "day";
  points: HiTrackInterfacePoint[];
}

/** Qualità rete dal collector verso il device (network-quality-v1). Non è una banda. */
export interface HiTrackNetworkQuality {
  algorithmVersion: string;
  score: number | null;
  health: "green" | "amber" | "red" | "unknown";
  dataQuality: "ok" | "provisional";
  reasons: string[];
  observedAt: string | null;
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
