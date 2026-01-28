import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { 
  Monitor, 
  Server, 
  HardDrive, 
  Wifi, 
  AlertTriangle, 
  CheckCircle, 
  Clock,
  Globe,
  RefreshCw,
  Filter,
  Activity,
  Smartphone,
  Database
} from 'lucide-react';
import { RiskScoreCard } from './RiskScoreCard';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

// Mock data
const overviewStats = {
  totalDevices: 78,
  onlineDevices: 72,
  offlineDevices: 3,
  warningDevices: 3,
  activeAlerts: 5,
  resolvedToday: 12,
  avgUptime: 99.2,
  lastUpdate: 'less than 1 minute ago',
};

const monitoredDevicesData = [
  { deviceName: 'SRV-MONITOR-01', type: 'server', ipAddress: '10.100.10.23', status: '7 months', statusType: 'success', rtdWorst: '2.5 ms', rtdMedian: '-', rtdPacketsLost: '-', location: 'Datacenter TS', osName: 'windows', osVersion: '' },
  { deviceName: 'VM-AUDIO-01', type: 'server', ipAddress: '10.100.11.33', status: '3 months', statusType: 'success', rtdWorst: '2.4 ms', rtdMedian: '-', rtdPacketsLost: '-', location: 'Datacenter TS', osName: 'linux', osVersion: '6.8.0-62' },
  { deviceName: 'NAS-BACKUP-01', type: 'server', ipAddress: '10.100.10.92', status: '7 months', statusType: 'success', rtdWorst: '2.6 ms', rtdMedian: '-', rtdPacketsLost: '-', location: 'Datacenter TS', osName: 'linux', osVersion: '' },
  { deviceName: 'ESXi-REPLICA-01', type: 'hypervisor', ipAddress: '10.200.10.101', status: '9 days', statusType: 'success', rtdWorst: '20.6 ms', rtdMedian: '14 ms', rtdPacketsLost: '2 %', location: 'DC Roma', osName: 'esxi', osVersion: '7.0.3' },
  { deviceName: 'FW-SERVICE-01', type: 'firewall', ipAddress: '10.200.2.254', status: '3 months', statusType: 'success', rtdWorst: '34.1 ms', rtdMedian: '14 ms', rtdPacketsLost: '-', location: 'DC WIND', osName: '-', osVersion: '-' },
  { deviceName: 'VM-WEB-01', type: 'server', ipAddress: '10.200.1.1', status: '2 months', statusType: 'success', rtdWorst: '33 ms', rtdMedian: '14 ms', rtdPacketsLost: '-', location: 'DC Roma', osName: 'windows', osVersion: '10.0.143' },
  { deviceName: 'VM-PBX-01', type: 'server', ipAddress: '10.200.3.1', status: '2 months', statusType: 'success', rtdWorst: '33.7 ms', rtdMedian: '14 ms', rtdPacketsLost: '-', location: '-', osName: '-', osVersion: '-' },
];

const networkTroubleshootingData = [
  { siteName: 'Site POC', siteStatus: '2 months', statusType: 'success', ipConflict: 'No Conflicts', dhcpRequests: '1.5 req/h', bufferbloatGrade: 'A', jitter: '0 ms', jitterDown: '1 ms', jitterUp: '1 ms' },
];

const connectivityStatusData = [
  { siteName: 'Site POC', deviceName: 'Mobile Device 01', type: 'mobile', ipAddress: '172.19.101.106', status: '16 hours', statusType: 'error', rtdWorst: '435.7 ms', rtdMedian: '33 ms', rtdPacketsLost: '43 %', statusChanges: '-', hasAlert: true },
  { siteName: 'Site POC', deviceName: 'Mobile-Device-02', type: 'mobile', ipAddress: '172.19.101.152', status: '2 hours', statusType: 'success', rtdWorst: '627.1 ms', rtdMedian: '164.5 ms', rtdPacketsLost: '-', statusChanges: '-', hasAlert: false },
  { siteName: 'Site POC', deviceName: 'VM-HS-Backup', type: 'server', ipAddress: '172.19.100.75', status: '4 months', statusType: 'success', rtdWorst: '-', rtdMedian: '-', rtdPacketsLost: '100 %', statusChanges: '-', hasAlert: false },
  { siteName: 'Site POC', deviceName: 'Virtual Machine 01', type: 'server', ipAddress: '172.19.100.76', status: '3 months', statusType: 'error', rtdWorst: '2.5 ms', rtdMedian: '-', rtdPacketsLost: '-', statusChanges: '-', hasAlert: true },
  { siteName: 'Site POC', deviceName: 'Virtual Machine 02', type: 'server', ipAddress: '172.19.105.2', status: '5 hours', statusType: 'success', rtdWorst: '3.4 ms', rtdMedian: '-', rtdPacketsLost: '-', statusChanges: '-', hasAlert: false },
  { siteName: 'Site POC', deviceName: 'Router-LTE-01', type: 'router', ipAddress: '172.19.101.118', status: '2 months', statusType: 'success', rtdWorst: '18.5 ms', rtdMedian: '4 ms', rtdPacketsLost: '-', statusChanges: '-', hasAlert: false },
  { siteName: 'Site POC', deviceName: 'Service Session 01', type: 'mobile', ipAddress: '172.19.101.147', status: '8 days', statusType: 'error', rtdWorst: '376.3 ms', rtdMedian: '6 ms', rtdPacketsLost: '44 %', statusChanges: '-', hasAlert: true },
];

const logicalDisksData = [
  { siteName: 'Site POC', deviceName: 'VM-HS-Backup', diskId: 'C:', type: 'server', ipAddress: '172.19.100.75', status: '4 months', statusType: 'success', usage: 83.8, size: '69.33 GiB', freeSpace: '11.19 GiB' },
  { siteName: 'Site POC', deviceName: 'VM-HS-Backup', diskId: 'D:', type: 'server', ipAddress: '172.19.100.75', status: '4 months', statusType: 'success', usage: 100, size: '5.13 GiB', freeSpace: '0 B' },
  { siteName: 'Site POC', deviceName: 'VM-HS-Backup', diskId: 'F:', type: 'server', ipAddress: '172.19.100.75', status: '4 months', statusType: 'success', usage: 66.6, size: '1.20 TiB', freeSpace: '409.81 GiB' },
];

const diskSpaceData = [
  { collectorName: 'COLLECTOR_01', deviceName: 'VM-WEB-01', diskId: 'A:', type: 'server', ipAddress: '10.200.1.1', status: '2 months', statusType: 'success', usage: null, size: '-', freeSpace: '-' },
  { collectorName: 'COLLECTOR_01', deviceName: 'VM-WEB-01', diskId: 'C:', type: 'server', ipAddress: '10.200.1.1', status: '2 months', statusType: 'success', usage: 28.2, size: '199.51 GiB', freeSpace: '143.11 GiB' },
  { collectorName: 'COLLECTOR_01', deviceName: 'VM-WEB-01', diskId: 'D:', type: 'server', ipAddress: '10.200.1.1', status: '2 months', statusType: 'success', usage: null, size: '-', freeSpace: '-' },
  { collectorName: 'COLLECTOR_01', deviceName: 'VM-SQL-01', diskId: 'A:', type: 'server', ipAddress: '10.200.2.1', status: '3 months', statusType: 'success', usage: null, size: '-', freeSpace: '-' },
];

const getStatusColor = (statusType: string) => {
  switch (statusType) {
    case 'success': return 'bg-green-500/20 text-green-500';
    case 'warning': return 'bg-yellow-500/20 text-yellow-500';
    case 'error': return 'bg-red-500/20 text-red-500';
    default: return 'bg-muted text-muted-foreground';
  }
};

const getDeviceIcon = (type: string) => {
  switch (type) {
    case 'server': return <Server className="w-4 h-4 text-muted-foreground" />;
    case 'firewall': return <Wifi className="w-4 h-4 text-muted-foreground" />;
    case 'hypervisor': return <Database className="w-4 h-4 text-muted-foreground" />;
    case 'mobile': return <Smartphone className="w-4 h-4 text-muted-foreground" />;
    case 'router': return <Globe className="w-4 h-4 text-muted-foreground" />;
    default: return <Monitor className="w-4 h-4 text-muted-foreground" />;
  }
};

const getUsageColor = (usage: number) => {
  if (usage >= 90) return 'bg-red-500';
  if (usage >= 70) return 'bg-orange-500';
  if (usage >= 50) return 'bg-yellow-500';
  return 'bg-primary';
};

export const HiTrackDashboard: React.FC = () => {
  return (
    <div className="space-y-8">
      {/* Overview Section */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold">Monitoring Overview</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="border-border">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Dispositivi Monitorati</p>
                  <p className="text-3xl font-bold text-primary">{overviewStats.totalDevices}</p>
                </div>
                <div className="p-3 rounded-full bg-primary/10">
                  <Monitor className="w-6 h-6 text-primary" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Online</p>
                  <p className="text-3xl font-bold text-green-500">{overviewStats.onlineDevices}</p>
                </div>
                <div className="p-3 rounded-full bg-green-500/10">
                  <CheckCircle className="w-6 h-6 text-green-500" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Offline / Warning</p>
                  <p className="text-3xl font-bold text-orange-500">{overviewStats.offlineDevices + overviewStats.warningDevices}</p>
                </div>
                <div className="p-3 rounded-full bg-orange-500/10">
                  <AlertTriangle className="w-6 h-6 text-orange-500" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Allarmi Attivi</p>
                  <p className="text-3xl font-bold text-red-500">{overviewStats.activeAlerts}</p>
                </div>
                <div className="p-3 rounded-full bg-red-500/10">
                  <Activity className="w-6 h-6 text-red-500" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <RiskScoreCard 
            title="Uptime Medio"
            level="Ottimo"
            levelColor="green"
            score={99}
            ringColor="#10b981"
          />
          <RiskScoreCard 
            title="Health Score"
            level="Buono"
            levelColor="yellow"
            score={92}
            ringColor="#eab308"
          />
        </div>
      </section>

      {/* Monitored Devices Section */}
      <section className="space-y-4">
        <Card className="border-border">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Monitor className="w-5 h-5 text-primary" />
                  Monitored Devices
                </CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  {overviewStats.totalDevices} monitored Devices | last update {overviewStats.lastUpdate}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm">
                  <Filter className="w-4 h-4 mr-1" />
                  Add filter
                </Button>
                <Input placeholder="Search" className="w-48" />
                <Button variant="outline" size="sm">
                  <RefreshCw className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Device Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>IP Address</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>RTD Worst</TableHead>
                  <TableHead>RTD Median</TableHead>
                  <TableHead>RTD Packets Lost</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>OS Name</TableHead>
                  <TableHead>OS Version</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {monitoredDevicesData.map((device, index) => (
                  <TableRow key={index}>
                    <TableCell className="font-medium">{device.deviceName}</TableCell>
                    <TableCell>{getDeviceIcon(device.type)}</TableCell>
                    <TableCell className="font-mono text-sm">{device.ipAddress}</TableCell>
                    <TableCell>
                      <Badge className={cn("font-medium", getStatusColor(device.statusType))}>
                        <Clock className="w-3 h-3 mr-1" />
                        {device.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">{device.rtdWorst}</TableCell>
                    <TableCell className="text-sm">{device.rtdMedian}</TableCell>
                    <TableCell className="text-sm">{device.rtdPacketsLost}</TableCell>
                    <TableCell className="text-sm">{device.location}</TableCell>
                    <TableCell className="text-sm">{device.osName}</TableCell>
                    <TableCell className="text-sm">{device.osVersion}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </section>

      {/* Network Troubleshooting Section */}
      <section className="space-y-4">
        <Card className="border-border">
          <CardHeader>
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <Globe className="w-5 h-5 text-blue-500" />
                Network Troubleshooting
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                1 monitored Collector | last update {overviewStats.lastUpdate}
              </p>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Site Name</TableHead>
                  <TableHead>Site Status</TableHead>
                  <TableHead>IP Conflict</TableHead>
                  <TableHead>DHCP Requests</TableHead>
                  <TableHead>Bufferbloat Grade</TableHead>
                  <TableHead>Jitter</TableHead>
                  <TableHead>Jitter (Loaded Down)</TableHead>
                  <TableHead>Jitter (Loaded Up)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {networkTroubleshootingData.map((site, index) => (
                  <TableRow key={index}>
                    <TableCell className="font-medium">{site.siteName}</TableCell>
                    <TableCell>
                      <Badge className={cn("font-medium", getStatusColor(site.statusType))}>
                        <Clock className="w-3 h-3 mr-1" />
                        {site.siteStatus}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{site.ipConflict}</Badge>
                    </TableCell>
                    <TableCell className="text-sm">{site.dhcpRequests}</TableCell>
                    <TableCell>
                      <Badge className="bg-green-500/20 text-green-500 font-bold">{site.bufferbloatGrade}</Badge>
                    </TableCell>
                    <TableCell className="text-sm">{site.jitter}</TableCell>
                    <TableCell className="text-sm">{site.jitterDown}</TableCell>
                    <TableCell className="text-sm">{site.jitterUp}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </section>

      {/* Connectivity Status & Uptime Section */}
      <section className="space-y-4">
        <Card className="border-border">
          <CardHeader>
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <Globe className="w-5 h-5 text-green-500" />
                Connectivity Status & Uptime
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                {overviewStats.totalDevices} monitored Devices | last update {overviewStats.lastUpdate}
              </p>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Site Name</TableHead>
                  <TableHead>Device Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>IP Address</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>RTD Worst</TableHead>
                  <TableHead>RTD Median</TableHead>
                  <TableHead>RTD Packets Lost</TableHead>
                  <TableHead>Status Changes 24h</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {connectivityStatusData.map((device, index) => (
                  <TableRow key={index}>
                    <TableCell className="font-medium">{device.siteName}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {device.hasAlert && <AlertTriangle className="w-4 h-4 text-red-500" />}
                        <span className={cn("font-medium", device.hasAlert ? "text-red-500" : "")}>{device.deviceName}</span>
                      </div>
                    </TableCell>
                    <TableCell>{getDeviceIcon(device.type)}</TableCell>
                    <TableCell className="font-mono text-sm">{device.ipAddress}</TableCell>
                    <TableCell>
                      <Badge className={cn("font-medium", getStatusColor(device.statusType))}>
                        <Clock className="w-3 h-3 mr-1" />
                        {device.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">{device.rtdWorst}</TableCell>
                    <TableCell className="text-sm">{device.rtdMedian}</TableCell>
                    <TableCell className="text-sm">{device.rtdPacketsLost}</TableCell>
                    <TableCell className="text-sm">{device.statusChanges}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </section>

      {/* Logical Disks Section */}
      <section className="space-y-4">
        <Card className="border-border">
          <CardHeader>
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <HardDrive className="w-5 h-5 text-purple-500" />
                Logical Disks
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                {logicalDisksData.length} monitored Device | last update {overviewStats.lastUpdate}
              </p>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Site Name</TableHead>
                  <TableHead>Device Name</TableHead>
                  <TableHead>Id</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>IP Address</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Usage</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Free Space</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logicalDisksData.map((disk, index) => (
                  <TableRow key={index}>
                    <TableCell className="font-medium">{disk.siteName}</TableCell>
                    <TableCell className="font-medium">{disk.deviceName}</TableCell>
                    <TableCell className="font-mono">{disk.diskId}</TableCell>
                    <TableCell>{getDeviceIcon(disk.type)}</TableCell>
                    <TableCell className="font-mono text-sm">{disk.ipAddress}</TableCell>
                    <TableCell>
                      <Badge className={cn("font-medium", getStatusColor(disk.statusType))}>
                        <Clock className="w-3 h-3 mr-1" />
                        {disk.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2 min-w-[120px]">
                        <span className="text-sm w-12">{disk.usage} %</span>
                        <div className="flex-1">
                          <Progress 
                            value={disk.usage} 
                            className="h-2"
                            indicatorClassName={getUsageColor(disk.usage)}
                          />
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{disk.size}</TableCell>
                    <TableCell className="text-sm">{disk.freeSpace}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </section>

      {/* Disk Space Section */}
      <section className="space-y-4">
        <Card className="border-border">
          <CardHeader>
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <Database className="w-5 h-5 text-blue-500" />
                Disk Space
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                16 monitored Devices | last update {overviewStats.lastUpdate}
              </p>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Collector Name</TableHead>
                  <TableHead>Device Name</TableHead>
                  <TableHead>Id</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>IP Address</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Usage</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Free Space</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {diskSpaceData.map((disk, index) => (
                  <TableRow key={index}>
                    <TableCell className="font-medium text-primary">{disk.collectorName}</TableCell>
                    <TableCell className="font-medium text-primary">{disk.deviceName}</TableCell>
                    <TableCell className="font-mono">{disk.diskId}</TableCell>
                    <TableCell>{getDeviceIcon(disk.type)}</TableCell>
                    <TableCell className="font-mono text-sm">{disk.ipAddress}</TableCell>
                    <TableCell>
                      <Badge className={cn("font-medium", getStatusColor(disk.statusType))}>
                        <Clock className="w-3 h-3 mr-1" />
                        {disk.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {disk.usage !== null ? (
                        <div className="flex items-center gap-2 min-w-[120px]">
                          <span className="text-sm w-12">{disk.usage} %</span>
                          <div className="flex-1">
                            <Progress 
                              value={disk.usage} 
                              className="h-2"
                              indicatorClassName={getUsageColor(disk.usage)}
                            />
                          </div>
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">{disk.size}</TableCell>
                    <TableCell className="text-sm">{disk.freeSpace}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </section>
    </div>
  );
};
