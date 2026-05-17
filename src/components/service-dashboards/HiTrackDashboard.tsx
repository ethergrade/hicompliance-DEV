import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { DemoDataBadge } from './DemoDataBadge';
import { useTrackDashboard } from '@/hooks/useTrack';
import { 
  Monitor, 
  Server, 
  HardDrive, 
  Cpu,
  Wifi, 
  AlertTriangle, 
  CheckCircle, 
  Clock,
  Globe,
  RefreshCw,
  Filter,
  ChevronLeft,
  ChevronRight,
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
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Area, AreaChart, ResponsiveContainer } from 'recharts';
import { cn } from '@/lib/utils';

// Mock data
// Data provided by useTrackDashboard hook with mock fallback
// Helper functions remain inline since they're pure UI logic {


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

const getDeviceTypeLabel = (type: string) => {
  switch (type) {
    case 'server': return 'Server';
    case 'firewall': return 'Firewall';
    case 'hypervisor': return 'Hypervisor';
    case 'mobile': return 'Mobile';
    case 'router': return 'Router';
    default: return type.replace(/[-_]/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
  }
};

const getUsageColor = (usage: number) => {
  if (usage >= 90) return 'bg-red-500';
  if (usage >= 70) return 'bg-orange-500';
  if (usage >= 50) return 'bg-yellow-500';
  return 'bg-primary';
};

const RamTrendSparkline: React.FC<{ values: number[]; gradientId: string }> = ({ values, gradientId }) => {
  const chartData = values.map((value, index) => ({ index, value }));

  return (
    <div className="h-12 min-w-[160px] w-[180px]">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 4, right: 2, left: 2, bottom: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#22c55e" stopOpacity={0.35} />
              <stop offset="95%" stopColor="#22c55e" stopOpacity={0.03} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="value"
            stroke="#22c55e"
            strokeWidth={2}
            fill={`url(#${gradientId})`}
            dot={false}
            isAnimationActive={true}
            animationDuration={450}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};

const MONITORED_DEVICES_PER_PAGE = 15;

export const HiTrackDashboard: React.FC = () => {
  const { data: trackData, isMock } = useTrackDashboard();
  const { overview: overviewStats, monitoredDevices: monitoredDevicesData, networkSites: networkTroubleshootingData, logicalDisks: logicalDisksData, diskSpace: diskSpaceData, ramMonitoring: ramMonitoringData } = trackData;
  const [monitoredSearchQuery, setMonitoredSearchQuery] = useState('');
  const [showMonitoredFilters, setShowMonitoredFilters] = useState(false);
  const [monitoredCurrentPage, setMonitoredCurrentPage] = useState(1);
  const [logicalDiskSelectionByDevice, setLogicalDiskSelectionByDevice] = useState<Record<string, string>>({});
  const [monitoredFilters, setMonitoredFilters] = useState({
    type: 'all',
    statusType: 'all',
    location: 'all',
    osName: 'all',
    tag: 'all',
  });

  const monitoredFilterOptions = useMemo(() => {
    const types = Array.from(new Set(monitoredDevicesData.map((device) => device.type))).sort();
    const statusTypes = Array.from(new Set(monitoredDevicesData.map((device) => device.statusType))).sort();
    const locations = Array.from(new Set(monitoredDevicesData.map((device) => device.location))).sort();
    const osNames = Array.from(new Set(monitoredDevicesData.map((device) => device.osName))).sort();
    const tags = Array.from(new Set(monitoredDevicesData.flatMap((device) => device.tags))).sort();

    return { types, statusTypes, locations, osNames, tags };
  }, []);

  const filteredMonitoredDevices = useMemo(() => {
    const query = monitoredSearchQuery.trim().toLowerCase();

    return monitoredDevicesData.filter((device) => {
      const matchesSearch =
        query.length === 0 ||
        [
          device.deviceName,
          device.type,
          device.ipAddress,
          device.status,
          device.statusType,
          device.rtdWorst,
          device.rtdMedian,
          device.rtdPacketsLost,
          device.statusChanges24h,
          device.location,
          device.osName,
          device.osVersion,
          ...device.tags,
        ]
          .join(' ')
          .toLowerCase()
          .includes(query);

      const matchesType = monitoredFilters.type === 'all' || device.type === monitoredFilters.type;
      const matchesStatus = monitoredFilters.statusType === 'all' || device.statusType === monitoredFilters.statusType;
      const matchesLocation = monitoredFilters.location === 'all' || device.location === monitoredFilters.location;
      const matchesOsName = monitoredFilters.osName === 'all' || device.osName === monitoredFilters.osName;
      const matchesTag = monitoredFilters.tag === 'all' || device.tags.includes(monitoredFilters.tag);

      return matchesSearch && matchesType && matchesStatus && matchesLocation && matchesOsName && matchesTag;
    });
  }, [monitoredFilters, monitoredSearchQuery]);

  const activeMonitoredFiltersCount = useMemo(
    () => Object.values(monitoredFilters).filter((value) => value !== 'all').length,
    [monitoredFilters]
  );

  const totalMonitoredPages = Math.max(
    1,
    Math.ceil(filteredMonitoredDevices.length / MONITORED_DEVICES_PER_PAGE)
  );

  const paginatedMonitoredDevices = useMemo(() => {
    const startIndex = (monitoredCurrentPage - 1) * MONITORED_DEVICES_PER_PAGE;
    const endIndex = startIndex + MONITORED_DEVICES_PER_PAGE;
    return filteredMonitoredDevices.slice(startIndex, endIndex);
  }, [filteredMonitoredDevices, monitoredCurrentPage]);

  const monitoredPageStart = filteredMonitoredDevices.length === 0
    ? 0
    : (monitoredCurrentPage - 1) * MONITORED_DEVICES_PER_PAGE + 1;

  const monitoredPageEnd = Math.min(
    monitoredCurrentPage * MONITORED_DEVICES_PER_PAGE,
    filteredMonitoredDevices.length
  );

  const mergedDiskEntries = useMemo(
    () => [
      ...logicalDisksData.map((disk) => ({
        ...disk,
        collectorName: '-',
      })),
      ...diskSpaceData.map((disk) => ({
        ...disk,
        siteName: '-',
      })),
    ],
    []
  );

  const logicalDiskGroups = useMemo(() => {
    const groupedByDevice = mergedDiskEntries.reduce((accumulator, disk) => {
      if (!accumulator[disk.deviceName]) {
        accumulator[disk.deviceName] = [];
      }
      accumulator[disk.deviceName].push(disk);
      return accumulator;
    }, {} as Record<string, typeof mergedDiskEntries>);

    return Object.entries(groupedByDevice).map(([deviceName, disks]) => ({
      deviceName,
      disks,
    }));
  }, [mergedDiskEntries]);

  useEffect(() => {
    setMonitoredCurrentPage(1);
  }, [monitoredSearchQuery, monitoredFilters]);

  useEffect(() => {
    setLogicalDiskSelectionByDevice((previous) => {
      const nextSelections = { ...previous };

      logicalDiskGroups.forEach((group) => {
        const hasValidSelection =
          !!nextSelections[group.deviceName] &&
          group.disks.some((disk) => disk.diskId === nextSelections[group.deviceName]);

        if (!hasValidSelection) {
          nextSelections[group.deviceName] = group.disks[0].diskId;
        }
      });

      return nextSelections;
    });
  }, [logicalDiskGroups]);

  useEffect(() => {
    if (monitoredCurrentPage > totalMonitoredPages) {
      setMonitoredCurrentPage(totalMonitoredPages);
    }
  }, [monitoredCurrentPage, totalMonitoredPages]);

  const resetMonitoredFilters = () => {
    setMonitoredSearchQuery('');
    setMonitoredFilters({
      type: 'all',
      statusType: 'all',
      location: 'all',
      osName: 'all',
      tag: 'all',
    });
  };

  return (
    <div className="space-y-8">
      {/* Overview Section */}
      <section className="space-y-4">
        <div className="flex items-center justify-center gap-3">
          <h2 className="text-2xl font-bold">Monitoring Overview</h2>
          <DemoDataBadge show={isMock} />
        </div>

        <div className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <Card className="h-full border-border">
            <CardContent className="flex min-h-[160px] flex-col items-center justify-center gap-3 p-6 text-center">
              <div className="rounded-full bg-primary/10 p-3">
                <Monitor className="h-6 w-6 text-primary" />
              </div>
              <p className="text-sm text-muted-foreground">Dispositivi Monitorati</p>
              <p className="text-3xl font-bold leading-none text-primary">{overviewStats.totalDevices}</p>
            </CardContent>
          </Card>

          <Card className="h-full border-border">
            <CardContent className="flex min-h-[160px] flex-col items-center justify-center gap-3 p-6 text-center">
              <div className="rounded-full bg-green-500/10 p-3">
                <CheckCircle className="h-6 w-6 text-green-500" />
              </div>
              <p className="text-sm text-muted-foreground">Online</p>
              <p className="text-3xl font-bold leading-none text-green-500">{overviewStats.onlineDevices}</p>
            </CardContent>
          </Card>

          <Card className="h-full border-border">
            <CardContent className="flex min-h-[160px] flex-col items-center justify-center gap-3 p-6 text-center">
              <div className="rounded-full bg-orange-500/10 p-3">
                <AlertTriangle className="h-6 w-6 text-orange-500" />
              </div>
              <p className="text-sm text-muted-foreground">Offline</p>
              <p className="text-3xl font-bold leading-none text-orange-500">{overviewStats.offlineDevices + overviewStats.warningDevices}</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <RiskScoreCard 
            title="Uptime Medio Collector"
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
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </section>

      {/* Monitored Devices Section */}
      <section className="space-y-4">
        <Card className="border-border">
          <CardHeader>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Monitor className="w-5 h-5 text-primary" />
                  Monitored Devices
                </CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  {filteredMonitoredDevices.length} / {overviewStats.totalDevices} monitored Devices | last update {overviewStats.lastUpdate}
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowMonitoredFilters((previous) => !previous)}
                >
                  <Filter className="w-4 h-4 mr-1" />
                  Add filter
                  {activeMonitoredFiltersCount > 0 && (
                    <span className="ml-2 rounded-full bg-primary/15 px-2 py-0.5 text-xs text-primary">
                      {activeMonitoredFiltersCount}
                    </span>
                  )}
                </Button>
                <Input
                  placeholder="Search tutte le colonne"
                  className="w-48 md:w-64"
                  value={monitoredSearchQuery}
                  onChange={(event) => setMonitoredSearchQuery(event.target.value)}
                />
                <Button variant="outline" size="sm" onClick={resetMonitoredFilters}>
                  <RefreshCw className="w-4 h-4" />
                </Button>
              </div>
            </div>
            {showMonitoredFilters && (
              <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-5">
                <select
                  aria-label="Filter by type"
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                  value={monitoredFilters.type}
                  onChange={(event) => setMonitoredFilters((previous) => ({ ...previous, type: event.target.value }))}
                >
                  <option value="all">Type: all</option>
                  {monitoredFilterOptions.types.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="Filter by status"
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                  value={monitoredFilters.statusType}
                  onChange={(event) => setMonitoredFilters((previous) => ({ ...previous, statusType: event.target.value }))}
                >
                  <option value="all">Status: all</option>
                  {monitoredFilterOptions.statusTypes.map((statusType) => (
                    <option key={statusType} value={statusType}>
                      {statusType}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="Filter by location"
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                  value={monitoredFilters.location}
                  onChange={(event) => setMonitoredFilters((previous) => ({ ...previous, location: event.target.value }))}
                >
                  <option value="all">Location: all</option>
                  {monitoredFilterOptions.locations.map((location) => (
                    <option key={location} value={location}>
                      {location}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="Filter by OS"
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                  value={monitoredFilters.osName}
                  onChange={(event) => setMonitoredFilters((previous) => ({ ...previous, osName: event.target.value }))}
                >
                  <option value="all">OS: all</option>
                  {monitoredFilterOptions.osNames.map((osName) => (
                    <option key={osName} value={osName}>
                      {osName}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="Filter by tag"
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                  value={monitoredFilters.tag}
                  onChange={(event) => setMonitoredFilters((previous) => ({ ...previous, tag: event.target.value }))}
                >
                  <option value="all">Tag: all</option>
                  {monitoredFilterOptions.tags.map((tag) => (
                    <option key={tag} value={tag}>
                      {tag}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Device Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>IP Address</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>TAG</TableHead>
                  <TableHead>RTD Worst</TableHead>
                  <TableHead>RTD Median</TableHead>
                  <TableHead>RTD Packets Lost</TableHead>
                  <TableHead>Status Changes 24h</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>OS Name</TableHead>
                  <TableHead>OS Version</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredMonitoredDevices.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={12} className="py-6 text-center text-sm text-muted-foreground">
                      Nessun device trovato con i filtri correnti.
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedMonitoredDevices.map((device, index) => (
                    <TableRow key={index}>
                      <TableCell className="font-medium">{device.deviceName}</TableCell>
                      <TableCell>
                        <div className="flex min-w-[80px] flex-col items-center gap-1 text-xs text-muted-foreground">
                          {getDeviceIcon(device.type)}
                          <span className="leading-none">{getDeviceTypeLabel(device.type)}</span>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-sm">{device.ipAddress}</TableCell>
                      <TableCell>
                        <Badge className={cn("font-medium", getStatusColor(device.statusType))}>
                          <Clock className="w-3 h-3 mr-1" />
                          {device.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {device.tags.map((tag) => (
                            <Badge key={`${device.deviceName}-${tag}`} variant="outline" className="text-xs">
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">{device.rtdWorst}</TableCell>
                      <TableCell className="text-sm">{device.rtdMedian}</TableCell>
                      <TableCell className="text-sm">{device.rtdPacketsLost}</TableCell>
                      <TableCell className="text-sm">{device.statusChanges24h}</TableCell>
                      <TableCell className="text-sm">{device.location}</TableCell>
                      <TableCell className="text-sm">{device.osName}</TableCell>
                      <TableCell className="text-sm">{device.osVersion}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
            <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
              <p className="text-sm text-muted-foreground">
                Mostrando {monitoredPageStart}-{monitoredPageEnd} di {filteredMonitoredDevices.length} devices
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setMonitoredCurrentPage((previous) => Math.max(1, previous - 1))}
                  disabled={monitoredCurrentPage === 1}
                  aria-label="Pagina precedente"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="min-w-[70px] text-center text-sm text-muted-foreground">
                  {monitoredCurrentPage} / {totalMonitoredPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setMonitoredCurrentPage((previous) => Math.min(totalMonitoredPages, previous + 1))}
                  disabled={monitoredCurrentPage === totalMonitoredPages}
                  aria-label="Pagina successiva"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
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
                Logical Disks & Disk Space
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                {logicalDiskGroups.length} monitored Devices | last update {overviewStats.lastUpdate}
              </p>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Site Name</TableHead>
                  <TableHead>Collector Name</TableHead>
                  <TableHead>Device Name</TableHead>
                  <TableHead>Id</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>IP Address</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Usage</TableHead>
                  <TableHead>Trend</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Free Space</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logicalDiskGroups.map((group) => {
                  const selectedDiskId = logicalDiskSelectionByDevice[group.deviceName] || group.disks[0].diskId;
                  const selectedDisk = group.disks.find((disk) => disk.diskId === selectedDiskId) || group.disks[0];
                  const isMultiDiskDevice = group.disks.length > 1;

                  return (
                    <TableRow key={group.deviceName}>
                      <TableCell className="font-medium">{selectedDisk.siteName}</TableCell>
                      <TableCell className={cn("font-medium", selectedDisk.collectorName !== '-' ? "text-primary" : "")}>
                        {selectedDisk.collectorName}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{group.deviceName}</span>
                          {isMultiDiskDevice && (
                            <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
                              Multi
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {isMultiDiskDevice ? (
                          <Tabs
                            value={selectedDiskId}
                            onValueChange={(value) =>
                              setLogicalDiskSelectionByDevice((previous) => ({
                                ...previous,
                                [group.deviceName]: value,
                              }))
                            }
                          >
                            <TabsList className="h-8 bg-muted/40 p-0.5">
                              {group.disks.map((disk) => (
                                <TabsTrigger
                                  key={`${group.deviceName}-${disk.diskId}`}
                                  value={disk.diskId}
                                  className="h-7 px-2 text-xs font-mono"
                                >
                                  {disk.diskId}
                                </TabsTrigger>
                              ))}
                            </TabsList>
                          </Tabs>
                        ) : (
                          <span className="font-mono">{selectedDisk.diskId}</span>
                        )}
                      </TableCell>
                      <TableCell>{getDeviceIcon(selectedDisk.type)}</TableCell>
                      <TableCell className="font-mono text-sm">{selectedDisk.ipAddress}</TableCell>
                      <TableCell>
                        <Badge className={cn("font-medium", getStatusColor(selectedDisk.statusType))}>
                          <Clock className="w-3 h-3 mr-1" />
                          {selectedDisk.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {selectedDisk.usage !== null ? (
                          <div className="flex items-center gap-2 min-w-[120px]">
                            <span className="text-sm w-12">{selectedDisk.usage} %</span>
                            <div className="flex-1">
                              <Progress
                                value={selectedDisk.usage}
                                className="h-2"
                                indicatorClassName={getUsageColor(selectedDisk.usage)}
                              />
                            </div>
                          </div>
                        ) : (
                          <span className="text-sm text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <RamTrendSparkline
                          values={selectedDisk.trend}
                          gradientId={`disk-trend-${group.deviceName.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${selectedDisk.diskId.toLowerCase().replace(/[^a-z0-9]/g, '')}`}
                        />
                      </TableCell>
                      <TableCell className="text-sm">{selectedDisk.size}</TableCell>
                      <TableCell className="text-sm">{selectedDisk.freeSpace}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </section>

      {/* RAM Monitoring Section */}
      <section className="space-y-4">
        <Card className="border-border">
          <CardHeader>
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <Cpu className="w-5 h-5 text-cyan-500" />
                RAM Monitoring
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                {ramMonitoringData.length} monitored Devices | last update {overviewStats.lastUpdate}
              </p>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Device Name</TableHead>
                  <TableHead>IP Address</TableHead>
                  <TableHead>Total RAM</TableHead>
                  <TableHead>Used RAM</TableHead>
                  <TableHead>Free RAM</TableHead>
                  <TableHead>Usage</TableHead>
                  <TableHead>Trend</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ramMonitoringData.map((device, index) => (
                  <TableRow key={device.deviceName}>
                    <TableCell className="font-medium">{device.deviceName}</TableCell>
                    <TableCell className="font-mono text-sm">{device.ipAddress}</TableCell>
                    <TableCell className="text-sm">{device.totalRam}</TableCell>
                    <TableCell className="text-sm">{device.usedRam}</TableCell>
                    <TableCell className="text-sm">{device.freeRam}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2 min-w-[120px]">
                        <span className="text-sm w-12">{device.usagePercent.toFixed(1)} %</span>
                        <div className="flex-1">
                          <Progress
                            value={device.usagePercent}
                            className="h-2"
                            indicatorClassName={getUsageColor(device.usagePercent)}
                          />
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <RamTrendSparkline
                        values={device.trend}
                        gradientId={`ram-trend-${index}-${device.deviceName.toLowerCase().replace(/[^a-z0-9]/g, '-')}`}
                      />
                    </TableCell>
                    <TableCell>
                      <Badge className={cn("font-medium", getStatusColor(device.statusType))}>
                        <Clock className="w-3 h-3 mr-1" />
                        {device.status}
                      </Badge>
                    </TableCell>
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
