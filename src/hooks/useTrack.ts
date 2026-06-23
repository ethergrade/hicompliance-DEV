import { useApiWithFallback } from "./useApiWithFallback";
import { trackApi } from "@/lib/api/track";

export interface TrackOverviewStats {
	totalDevices: number;
	onlineDevices: number;
	offlineDevices: number;
	warningDevices: number;
	resolvedToday: number;
	avgUptime: number;
	lastUpdate: string;
}

export interface MonitoredDevice {
	deviceName: string;
	type: string;
	ipAddress: string;
	status: string;
	statusType: string;
	rtdWorst: string;
	rtdMedian: string;
	rtdPacketsLost: string;
	statusChanges24h: string;
	location: string;
	osName: string;
	osVersion: string;
	tags: string[];
}

export interface NetworkSite {
	siteName: string;
	siteStatus: string;
	statusType: string;
	ipConflict: string;
	dhcpRequests: string;
	bufferbloatGrade: string;
	jitter: string;
	jitterDown: string;
	jitterUp: string;
}

export interface LogicalDisk {
	siteName?: string;
	collectorName?: string;
	deviceName: string;
	diskId: string;
	type: string;
	ipAddress: string;
	status: string;
	statusType: string;
	usage: number | null;
	size: string;
	freeSpace: string;
	trend: number[];
}

export interface RamMonitor {
	deviceName: string;
	ipAddress: string;
	totalRam: string;
	usedRam: string;
	freeRam: string;
	usagePercent: number;
	status: string;
	statusType: string;
	trend: number[];
}

export interface TrackDashboardData {
	overview: TrackOverviewStats;
	monitoredDevices: MonitoredDevice[];
	networkSites: NetworkSite[];
	logicalDisks: LogicalDisk[];
	diskSpace: LogicalDisk[];
	ramMonitoring: RamMonitor[];
}

const mockTrackData: TrackDashboardData = {
	overview: {
		totalDevices: 78,
		onlineDevices: 72,
		offlineDevices: 3,
		warningDevices: 3,
		resolvedToday: 12,
		avgUptime: 99.2,
		lastUpdate: "less than 1 minute ago",
	},
	monitoredDevices: [
		{
			deviceName: "SRV-MONITOR-01",
			type: "server",
			ipAddress: "10.100.10.23",
			status: "7 months",
			statusType: "success",
			rtdWorst: "2.5 ms",
			rtdMedian: "-",
			rtdPacketsLost: "-",
			statusChanges24h: "0",
			location: "Datacenter TS",
			osName: "windows",
			osVersion: "",
			tags: ["Core", "Collector"],
		},
		{
			deviceName: "VM-AUDIO-01",
			type: "server",
			ipAddress: "10.100.11.33",
			status: "3 months",
			statusType: "success",
			rtdWorst: "2.4 ms",
			rtdMedian: "-",
			rtdPacketsLost: "-",
			statusChanges24h: "0",
			location: "Datacenter TS",
			osName: "linux",
			osVersion: "6.8.0-62",
			tags: ["VoIP", "Production"],
		},
		{
			deviceName: "NAS-BACKUP-01",
			type: "server",
			ipAddress: "10.100.10.92",
			status: "7 months",
			statusType: "success",
			rtdWorst: "2.6 ms",
			rtdMedian: "-",
			rtdPacketsLost: "-",
			statusChanges24h: "1",
			location: "Datacenter TS",
			osName: "linux",
			osVersion: "",
			tags: ["Backup", "Storage"],
		},
		{
			deviceName: "ESXi-REPLICA-01",
			type: "hypervisor",
			ipAddress: "10.200.10.101",
			status: "9 days",
			statusType: "success",
			rtdWorst: "20.6 ms",
			rtdMedian: "14 ms",
			rtdPacketsLost: "2 %",
			statusChanges24h: "2",
			location: "DC Roma",
			osName: "esxi",
			osVersion: "7.0.3",
			tags: ["Virtualization", "Replica"],
		},
		{
			deviceName: "FW-SERVICE-01",
			type: "firewall",
			ipAddress: "10.200.2.254",
			status: "3 months",
			statusType: "success",
			rtdWorst: "34.1 ms",
			rtdMedian: "14 ms",
			rtdPacketsLost: "-",
			statusChanges24h: "1",
			location: "DC WIND",
			osName: "-",
			osVersion: "-",
			tags: ["Perimeter", "Security"],
		},
		{
			deviceName: "VM-WEB-01",
			type: "server",
			ipAddress: "10.200.1.1",
			status: "2 months",
			statusType: "success",
			rtdWorst: "33 ms",
			rtdMedian: "14 ms",
			rtdPacketsLost: "-",
			statusChanges24h: "0",
			location: "DC Roma",
			osName: "windows",
			osVersion: "10.0.143",
			tags: ["Web", "Production"],
		},
		{
			deviceName: "VM-PBX-01",
			type: "server",
			ipAddress: "10.200.3.1",
			status: "2 months",
			statusType: "success",
			rtdWorst: "33.7 ms",
			rtdMedian: "14 ms",
			rtdPacketsLost: "-",
			statusChanges24h: "0",
			location: "-",
			osName: "-",
			osVersion: "-",
			tags: ["PBX", "Voice"],
		},
	],
	networkSites: [
		{
			siteName: "Site POC",
			siteStatus: "2 months",
			statusType: "success",
			ipConflict: "No Conflicts",
			dhcpRequests: "1.5 req/h",
			bufferbloatGrade: "A",
			jitter: "0 ms",
			jitterDown: "1 ms",
			jitterUp: "1 ms",
		},
	],
	logicalDisks: [
		{
			siteName: "Site POC",
			deviceName: "VM-HS-Backup",
			diskId: "C:",
			type: "server",
			ipAddress: "172.19.100.75",
			status: "4 months",
			statusType: "success",
			usage: 83.8,
			size: "69.33 GiB",
			freeSpace: "11.19 GiB",
			trend: [88, 87, 86, 85, 84.3, 83.8],
		},
		{
			siteName: "Site POC",
			deviceName: "VM-HS-Backup",
			diskId: "D:",
			type: "server",
			ipAddress: "172.19.100.75",
			status: "4 months",
			statusType: "success",
			usage: 100,
			size: "5.13 GiB",
			freeSpace: "0 B",
			trend: [100, 100, 100, 100, 100, 100],
		},
		{
			siteName: "Site POC",
			deviceName: "VM-HS-Backup",
			diskId: "F:",
			type: "server",
			ipAddress: "172.19.100.75",
			status: "4 months",
			statusType: "success",
			usage: 66.6,
			size: "1.20 TiB",
			freeSpace: "409.81 GiB",
			trend: [73, 71, 70, 69, 68, 66.6],
		},
	],
	diskSpace: [
		{
			collectorName: "COLLECTOR_01",
			deviceName: "VM-WEB-01",
			diskId: "A:",
			type: "server",
			ipAddress: "10.200.1.1",
			status: "2 months",
			statusType: "success",
			usage: null,
			size: "-",
			freeSpace: "-",
			trend: [10, 9.5, 9, 8.3, 7.9, 7.2],
		},
		{
			collectorName: "COLLECTOR_01",
			deviceName: "VM-WEB-01",
			diskId: "C:",
			type: "server",
			ipAddress: "10.200.1.1",
			status: "2 months",
			statusType: "success",
			usage: 28.2,
			size: "199.51 GiB",
			freeSpace: "143.11 GiB",
			trend: [36, 34, 33, 31, 29.4, 28.2],
		},
		{
			collectorName: "COLLECTOR_01",
			deviceName: "VM-WEB-01",
			diskId: "D:",
			type: "server",
			ipAddress: "10.200.1.1",
			status: "2 months",
			statusType: "success",
			usage: null,
			size: "-",
			freeSpace: "-",
			trend: [12, 11.5, 10.8, 10, 9.6, 9.1],
		},
		{
			collectorName: "COLLECTOR_01",
			deviceName: "VM-SQL-01",
			diskId: "A:",
			type: "server",
			ipAddress: "10.200.2.1",
			status: "3 months",
			statusType: "success",
			usage: null,
			size: "-",
			freeSpace: "-",
			trend: [18, 17.3, 16.8, 16, 15.4, 14.9],
		},
	],
	ramMonitoring: [
		{
			deviceName: "VM-HS-Backup",
			ipAddress: "172.19.100.75",
			totalRam: "64 GB",
			usedRam: "42.1 GB",
			freeRam: "21.9 GB",
			usagePercent: 65.8,
			status: "4 months",
			statusType: "success",
			trend: [74, 72, 70, 68, 66, 65.8],
		},
		{
			deviceName: "VM-WEB-01",
			ipAddress: "10.200.1.1",
			totalRam: "16 GB",
			usedRam: "8.6 GB",
			freeRam: "7.4 GB",
			usagePercent: 53.7,
			status: "2 months",
			statusType: "success",
			trend: [61, 59, 58, 56, 55, 53.7],
		},
		{
			deviceName: "VM-SQL-01",
			ipAddress: "10.200.2.1",
			totalRam: "32 GB",
			usedRam: "24.8 GB",
			freeRam: "7.2 GB",
			usagePercent: 77.5,
			status: "3 months",
			statusType: "success",
			trend: [84, 82, 80, 79, 78, 77.5],
		},
		{
			deviceName: "ESXi-REPLICA-01",
			ipAddress: "10.200.10.101",
			totalRam: "128 GB",
			usedRam: "90.6 GB",
			freeRam: "37.4 GB",
			usagePercent: 70.8,
			status: "9 days",
			statusType: "success",
			trend: [79, 77, 75, 73, 72, 70.8],
		},
	],
};

export function useTrackDashboard(tenantId?: string) {
	return useApiWithFallback<TrackDashboardData>(
		() =>
			trackApi.dashboard(tenantId) as unknown as Promise<TrackDashboardData>,
		mockTrackData,
		[tenantId],
	);
}
