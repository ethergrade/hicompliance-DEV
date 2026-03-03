import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Server, Shield, Users, Activity, Search, RefreshCw,
  Filter, HardDrive, Monitor, Usb, Power
} from 'lucide-react';
import { RiskScoreCard } from './RiskScoreCard';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts';
import {
  overviewData, usbDrivesData, securityEventsData, windowsLogsData,
  windowsLogsTableData, entraIdLogsData, entraIdTableData, sharePointLogsData,
  securityEventsTableData, startupShutdownData, startupShutdownTableData,
  firewallLogsTableData, hostsTableData, usersADData, usersLocalData, usersEntraData,
  actionColors, severityColors,
} from './hilog/mockData';
import { GlobalFilters, type HiLogFilters } from './hilog/GlobalFilters';
import { PaginatedTable } from './hilog/PaginatedTable';
import { CorrelationSection } from './hilog/CorrelationSection';
import { AdvancedFilter, createEmptyFilter, evalAdvancedFilter } from './hilog/filterEngine';

const STORAGE_KEY = 'hilog_query_builder_state';

const loadPersistedState = () => {
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return {
        filters: parsed.filters || { globalSearch: '', severity: 'all', hostname: '', username: '', ip: '' },
        advancedFilter: parsed.advancedFilter || createEmptyFilter(),
        advancedMode: parsed.advancedMode || false,
      };
    }
  } catch {}
  return null;
};

const persistState = (filters: HiLogFilters, advancedFilter: AdvancedFilter, advancedMode: boolean) => {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ filters, advancedFilter, advancedMode }));
  } catch {}
};

// Helper: check if any field in an object matches a search string
const matchesSearch = (obj: Record<string, any>, search: string): boolean => {
  if (!search) return true;
  const q = search.toLowerCase();
  return Object.values(obj).some(v => {
    if (Array.isArray(v)) return v.some(item => String(item).toLowerCase().includes(q));
    return String(v).toLowerCase().includes(q);
  });
};

export const HiLogDashboard: React.FC = () => {
  const persisted = useMemo(() => loadPersistedState(), []);
  
  const [filters, setFilters] = useState<HiLogFilters>(
    persisted?.filters || { globalSearch: '', severity: 'all', hostname: '', username: '', ip: '' }
  );
  const [advancedFilter, setAdvancedFilter] = useState<AdvancedFilter>(
    persisted?.advancedFilter || createEmptyFilter()
  );
  const [advancedMode, setAdvancedMode] = useState(persisted?.advancedMode || false);

  // Persist state on every change
  useEffect(() => {
    persistState(filters, advancedFilter, advancedMode);
  }, [filters, advancedFilter, advancedMode]);

  // Combined filter: basic + advanced
  const applyAllFilters = useCallback(<T extends Record<string, any>>(data: T[], extraFields?: { hostnameKey?: string; usernameKey?: string; ipKey?: string; severityKey?: string }): T[] => {
    if (advancedMode) {
      return evalAdvancedFilter(data, advancedFilter);
    }
    return data.filter(item => {
      if (!matchesSearch(item, filters.globalSearch)) return false;
      const hk = extraFields?.hostnameKey || 'hostname';
      const uk = extraFields?.usernameKey || 'username';
      const ik = extraFields?.ipKey || 'sourceIp';
      const sk = extraFields?.severityKey || 'severity';
      if (filters.hostname && !(item[hk] || '').toLowerCase().includes(filters.hostname.toLowerCase())) return false;
      if (filters.username && !(item[uk] || '').toLowerCase().includes(filters.username.toLowerCase())) return false;
      if (filters.ip) {
        const ipVal = item[ik] || '';
        const ipArr = item['ipAddresses'];
        const ipMatch = Array.isArray(ipArr) ? ipArr.some((ip: string) => ip.includes(filters.ip)) : String(ipVal).includes(filters.ip);
        if (!ipMatch) return false;
      }
      if (filters.severity !== 'all' && item[sk] && item[sk] !== filters.severity) return false;
      return true;
    });
  }, [filters, advancedFilter, advancedMode]);

  const filteredWindowsLogs = useMemo(() => applyAllFilters(windowsLogsTableData), [applyAllFilters]);
  const filteredEntraId = useMemo(() => applyAllFilters(entraIdTableData, { usernameKey: 'username', ipKey: 'sourceIp' }), [applyAllFilters]);
  const filteredSecurityEvents = useMemo(() => applyAllFilters(securityEventsTableData), [applyAllFilters]);
  const filteredFirewall = useMemo(() => applyAllFilters(firewallLogsTableData), [applyAllFilters]);
  const filteredHosts = useMemo(() => applyAllFilters(hostsTableData, { hostnameKey: 'hostname', usernameKey: 'domain', ipKey: 'ipAddresses' }), [applyAllFilters]);
  const filteredStartup = useMemo(() => applyAllFilters(startupShutdownTableData, { hostnameKey: 'hostname' }), [applyAllFilters]);
  const filteredUsersAD = useMemo(() => applyAllFilters(usersADData, { usernameKey: 'name', hostnameKey: 'domain' }), [applyAllFilters]);
  const filteredUsersLocal = useMemo(() => applyAllFilters(usersLocalData, { usernameKey: 'name', hostnameKey: 'domain' }), [applyAllFilters]);
  const filteredUsersEntra = useMemo(() => applyAllFilters(usersEntraData, { usernameKey: 'name', hostnameKey: 'domain' }), [applyAllFilters]);

  const exportDataSets = useMemo(() => ({
    windowsLogs: filteredWindowsLogs,
    entraId: filteredEntraId,
    securityEvents: filteredSecurityEvents,
    firewall: filteredFirewall,
    hosts: filteredHosts,
    startup: filteredStartup,
  }), [filteredWindowsLogs, filteredEntraId, filteredSecurityEvents, filteredFirewall, filteredHosts, filteredStartup]);

  return (
    <div className="space-y-8">
      {/* Global Filters */}
      <GlobalFilters
        filters={filters}
        onChange={setFilters}
        advancedFilter={advancedFilter}
        onAdvancedFilterChange={setAdvancedFilter}
        advancedMode={advancedMode}
        onToggleAdvanced={() => setAdvancedMode(!advancedMode)}
        dataSets={exportDataSets}
      />

      {/* Overview Section */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold">Overview</h2>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="border-border">
            <CardContent className="pt-6">
              <div className="space-y-4">
                <div>
                  <h3 className="font-semibold text-lg">HiLog SIEM</h3>
                  <p className="text-sm text-muted-foreground">Ref: {overviewData.refCode}</p>
                </div>
                <div className="flex gap-8">
                  <div>
                    <p className="text-sm text-muted-foreground">Activation date</p>
                    <p className="font-medium">{overviewData.activationDate}</p>
                  </div>
                  <div>
                    <p className="text-sm text-primary">Hosts</p>
                    <div className="flex gap-4">
                      <div>
                        <p className="text-2xl font-bold">{overviewData.hostsWindows}</p>
                        <p className="text-xs text-muted-foreground">WINDOWS</p>
                      </div>
                      <div>
                        <p className="text-2xl font-bold">{overviewData.hostsLinux}</p>
                        <p className="text-xs text-muted-foreground">LINUX</p>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="pt-4 border-t border-border">
                  <h4 className="font-semibold text-sm mb-3">LOGS SIZE</h4>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div><span className="font-medium">{overviewData.logsSize.baseLogs}</span><span className="text-primary text-xs ml-1">BASE LOGS</span></div>
                    <div><span className="font-medium">{overviewData.logsSize.customApp}</span><span className="text-primary text-xs ml-1">CUSTOM APP</span></div>
                    <div><span className="font-medium">{overviewData.logsSize.dlp}</span><span className="text-primary text-xs ml-1">DLP</span></div>
                    <div><span className="font-medium">{overviewData.logsSize.microsoft365}</span><span className="text-primary text-xs ml-1">MICROSOFT 365</span></div>
                    <div><span className="font-medium">{overviewData.logsSize.securityEvents}</span><span className="text-primary text-xs ml-1">SECURITY EVENTS</span></div>
                    <div><span className="font-medium">{overviewData.logsSize.firewall}</span><span className="text-primary text-xs ml-1">FIREWALL</span></div>
                  </div>
                  <div className="mt-3 pt-3 border-t border-border">
                    <span className="text-lg font-bold">{overviewData.logsSize.total}</span>
                    <span className="text-primary text-xs ml-2">TOTAL</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-primary flex items-center gap-2">
                <Server className="w-4 h-4" />WINDOWS FILE SERVER
              </CardTitle>
              <p className="text-xs text-muted-foreground">Last 24 hours</p>
            </CardHeader>
            <CardContent>
              <div className="h-48 flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={[{ name: 'No data', value: 100 }]} cx="50%" cy="50%" innerRadius={50} outerRadius={70} dataKey="value" stroke="none">
                      <Cell fill="hsl(var(--muted))" />
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-primary flex items-center gap-2">
                <Usb className="w-4 h-4" />USB DRIVES
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={usbDrivesData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                    <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                    <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }} />
                    <Legend />
                    <Bar dataKey="whitelist" fill="#22c55e" name="Whitelist" />
                    <Bar dataKey="notWhitelist" fill="#f87171" name="Not whitelist" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <RiskScoreCard title="Log Collection Rate" level="Ottimo" levelColor="green" score={98} ringColor="#10b981" />
          <RiskScoreCard title="Security Events Coverage" level="Buono" levelColor="yellow" score={85} ringColor="#eab308" />
        </div>
      </section>

      {/* Security Events Overview */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold">Security Events</h2>
        <Card className="border-border">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Shield className="w-5 h-5 text-orange-500" />Security Events - Last 24 hours
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="h-64">
                <p className="text-sm font-medium mb-2 text-center">Events comparison</p>
                <ResponsiveContainer width="100%" height="90%">
                  <PieChart>
                    <Pie data={securityEventsData.filter(e => e.value > 0)} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" label={({ name }) => name}>
                      {securityEventsData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="grid grid-cols-2 gap-4">
                {securityEventsData.map((event) => (
                  <div key={event.name} className="text-center">
                    <p className="text-3xl font-bold" style={{ color: event.color }}>{event.value}</p>
                    <p className="text-sm font-medium" style={{ color: event.color }}>{event.name}</p>
                    {event.lastReceived && (
                      <p className="text-xs text-muted-foreground">Last received at: {event.lastReceived}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Windows Logs Section */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold">Windows</h2>
        <Card className="border-border">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <Monitor className="w-5 h-5 text-blue-500" />Logs overview
              </CardTitle>
              <Badge variant="outline">{filteredWindowsLogs.length} eventi</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-64 mb-6">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={windowsLogsData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" />
                  <YAxis stroke="hsl(var(--muted-foreground))" />
                  <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }} />
                  <Legend />
                  <Bar dataKey="login" fill="#22c55e" name="Login" stackId="a" />
                  <Bar dataKey="remoteLogin" fill="#fbbf24" name="Remote or Delegated login" stackId="a" />
                  <Bar dataKey="logout" fill="#3b82f6" name="Logout" stackId="a" />
                  <Bar dataKey="authFailure" fill="#f87171" name="Authentication Failure" stackId="a" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <PaginatedTable
              data={filteredWindowsLogs}
              renderTable={(pageData) => (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>DATETIME</TableHead>
                      <TableHead>HOSTNAME</TableHead>
                      <TableHead>USER DOMAIN</TableHead>
                      <TableHead>USERNAME</TableHead>
                      <TableHead>ACTION</TableHead>
                      <TableHead>SOURCE IP</TableHead>
                      <TableHead>TYPE</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pageData.map((log, index) => (
                      <TableRow key={index}>
                        <TableCell className="text-sm text-muted-foreground">{log.datetime}</TableCell>
                        <TableCell className="font-medium">{log.hostname}</TableCell>
                        <TableCell className="text-sm">{log.domain}</TableCell>
                        <TableCell className="text-sm">{log.username}</TableCell>
                        <TableCell>
                          <Badge className={cn("font-medium text-xs", actionColors[log.action] || 'bg-muted text-muted-foreground')}>
                            {log.action}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-sm">{log.sourceIp}</TableCell>
                        <TableCell className="text-sm">{log.type}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            />
          </CardContent>
        </Card>
      </section>

      {/* Microsoft Entra ID Section */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold">Microsoft Entra ID</h2>
        <Card className="border-border">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <Activity className="w-5 h-5 text-purple-500" />Logs overview
              </CardTitle>
              <Badge variant="outline">{filteredEntraId.length} eventi</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-64 mb-6">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={entraIdLogsData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" />
                  <YAxis stroke="hsl(var(--muted-foreground))" />
                  <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }} />
                  <Legend />
                  <Bar dataKey="success" fill="#22c55e" name="Success" stackId="a" />
                  <Bar dataKey="interrupted" fill="#fbbf24" name="Interrupted" stackId="a" />
                  <Bar dataKey="failure" fill="#f87171" name="Failure" stackId="a" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <PaginatedTable
              data={filteredEntraId}
              renderTable={(pageData) => (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>DATETIME</TableHead>
                      <TableHead>USERNAME</TableHead>
                      <TableHead>APPLICATION</TableHead>
                      <TableHead>STATUS</TableHead>
                      <TableHead>LOCATION</TableHead>
                      <TableHead>SOURCE IP</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pageData.map((log, index) => (
                      <TableRow key={index}>
                        <TableCell className="text-sm text-muted-foreground">{log.datetime}</TableCell>
                        <TableCell className="text-sm">{log.username}</TableCell>
                        <TableCell className="text-sm">{log.application}</TableCell>
                        <TableCell>
                          <Badge className={cn("font-medium text-xs", actionColors[log.status] || 'bg-muted text-muted-foreground')}>
                            {log.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">{log.location}</TableCell>
                        <TableCell className="font-mono text-sm">{log.sourceIp}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            />
          </CardContent>
        </Card>
      </section>

      {/* Security Events Detail */}
      <section className="space-y-4">
        <Card className="border-border">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <Shield className="w-5 h-5 text-red-500" />Security Events Detail
              </CardTitle>
              <Badge variant="outline">{filteredSecurityEvents.length} eventi</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <PaginatedTable
              data={filteredSecurityEvents}
              renderTable={(pageData) => (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>DATETIME</TableHead>
                      <TableHead>SEVERITY</TableHead>
                      <TableHead>EVENT</TableHead>
                      <TableHead>SOURCE</TableHead>
                      <TableHead>HOSTNAME</TableHead>
                      <TableHead>USERNAME</TableHead>
                      <TableHead>IP</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pageData.map((ev, index) => (
                      <TableRow key={index}>
                        <TableCell className="text-sm text-muted-foreground">{ev.datetime}</TableCell>
                        <TableCell>
                          <Badge className={cn("font-medium text-xs", severityColors[ev.severity] || '')}>
                            {ev.severity}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm max-w-xs truncate" title={ev.event}>{ev.event}</TableCell>
                        <TableCell className="text-sm">{ev.source}</TableCell>
                        <TableCell className="text-sm">{ev.hostname}</TableCell>
                        <TableCell className="text-sm">{ev.username}</TableCell>
                        <TableCell className="font-mono text-sm">{ev.sourceIp}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            />
          </CardContent>
        </Card>
      </section>

      {/* SharePoint DLP */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold">SharePoint DLP</h2>
        <Card className="border-border">
          <CardHeader>
            <CardTitle className="text-lg">File Operations</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={sharePointLogsData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" />
                  <YAxis stroke="hsl(var(--muted-foreground))" />
                  <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }} />
                  <Legend />
                  <Bar dataKey="opening" fill="#3b82f6" name="Opening" stackId="a" />
                  <Bar dataKey="adding" fill="#22c55e" name="Adding" stackId="a" />
                  <Bar dataKey="deleting" fill="#f87171" name="Deleting" stackId="a" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Firewall Section */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold">Firewall</h2>
        <Card className="border-border">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <Shield className="w-5 h-5 text-green-500" />Firewall Logs
              </CardTitle>
              <Badge variant="outline">{filteredFirewall.length} eventi</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <PaginatedTable
              data={filteredFirewall}
              renderTable={(pageData) => (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>DATETIME</TableHead>
                      <TableHead>SEVERITY</TableHead>
                      <TableHead>ACTION TYPE</TableHead>
                      <TableHead>ACTION</TableHead>
                      <TableHead>MESSAGE</TableHead>
                      <TableHead>SOURCE IP</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pageData.map((log, index) => (
                      <TableRow key={index}>
                        <TableCell className="text-sm text-muted-foreground">{log.datetime}</TableCell>
                        <TableCell>
                          <Badge className={cn("font-medium text-xs", severityColors[log.severity] || '')}>
                            {log.severity}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">{log.actionType}</TableCell>
                        <TableCell className="text-sm">{log.action}</TableCell>
                        <TableCell className="text-sm max-w-xs truncate" title={log.message}>{log.message}</TableCell>
                        <TableCell className="font-mono text-sm">{log.sourceIp}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            />
          </CardContent>
        </Card>
      </section>

      {/* Startup / Shutdown */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold">Startup / Shutdown</h2>
        <Card className="border-border">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <Power className="w-5 h-5 text-yellow-500" />Events
              </CardTitle>
              <Badge variant="outline">{filteredStartup.length} eventi</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-64 mb-6">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={startupShutdownData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" />
                  <YAxis stroke="hsl(var(--muted-foreground))" />
                  <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }} />
                  <Legend />
                  <Bar dataKey="startup" fill="#22c55e" name="Startup" stackId="a" />
                  <Bar dataKey="unexpected" fill="#f97316" name="Unexpected" stackId="a" />
                  <Bar dataKey="shutdown" fill="#3b82f6" name="Shutdown" stackId="a" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <PaginatedTable
              data={filteredStartup}
              renderTable={(pageData) => (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>DATETIME</TableHead>
                      <TableHead>HOSTNAME</TableHead>
                      <TableHead>OPERATION</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pageData.map((log, index) => (
                      <TableRow key={index}>
                        <TableCell className="text-sm text-muted-foreground">{log.datetime}</TableCell>
                        <TableCell className="font-medium">{log.hostname}</TableCell>
                        <TableCell>
                          <Badge className={cn("font-medium text-xs", actionColors[log.operation] || 'bg-muted text-muted-foreground')}>
                            {log.operation}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            />
          </CardContent>
        </Card>
      </section>

      {/* Hosts Section */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold">Hosts</h2>
        <Card className="border-border">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <HardDrive className="w-5 h-5 text-blue-500" />Registered Hosts
              </CardTitle>
              <Badge variant="outline">{filteredHosts.length} hosts</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <PaginatedTable
              data={filteredHosts}
              renderTable={(pageData) => (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>HOSTNAME</TableHead>
                      <TableHead>DOMAIN</TableHead>
                      <TableHead>OS</TableHead>
                      <TableHead>VERSION</TableHead>
                      <TableHead>IP</TableHead>
                      <TableHead>ISSUES</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pageData.map((host, index) => (
                      <TableRow key={index}>
                        <TableCell className="font-medium">{host.hostname}</TableCell>
                        <TableCell className="text-sm">{host.domain}</TableCell>
                        <TableCell className="text-sm">{host.osName}</TableCell>
                        <TableCell className="text-sm">{host.osVersion}</TableCell>
                        <TableCell className="font-mono text-sm">{host.ipAddresses.join(', ')}</TableCell>
                        <TableCell>
                          <Badge variant={host.issues > 10 ? 'destructive' : host.issues > 5 ? 'secondary' : 'outline'}>
                            {host.issues}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            />
          </CardContent>
        </Card>
      </section>

      {/* Users Section */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold">Users</h2>
        <Card className="border-border">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Users className="w-5 h-5 text-purple-500" />User Directory
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="ad">
              <TabsList>
                <TabsTrigger value="ad">Active Directory ({filteredUsersAD.length})</TabsTrigger>
                <TabsTrigger value="local">Local ({filteredUsersLocal.length})</TabsTrigger>
                <TabsTrigger value="entra">Entra ID ({filteredUsersEntra.length})</TabsTrigger>
              </TabsList>

              <TabsContent value="ad">
                <PaginatedTable
                  data={filteredUsersAD}
                  renderTable={(pageData) => (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>NAME</TableHead>
                          <TableHead>STATUS</TableHead>
                          <TableHead>DOMAIN</TableHead>
                          <TableHead>MEMBER OF</TableHead>
                          <TableHead>ADMIN</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pageData.map((user, index) => (
                          <TableRow key={index}>
                            <TableCell className="font-medium">{user.name}</TableCell>
                            <TableCell>
                              <Badge variant={user.status === 'Enabled' ? 'outline' : 'secondary'}>
                                {user.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-sm">{user.domain}</TableCell>
                            <TableCell className="text-sm">{user.memberOf}</TableCell>
                            <TableCell>{user.isAdmin ? <Badge variant="destructive">Admin</Badge> : '-'}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                />
              </TabsContent>

              <TabsContent value="local">
                <PaginatedTable
                  data={filteredUsersLocal}
                  renderTable={(pageData) => (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>NAME</TableHead>
                          <TableHead>STATUS</TableHead>
                          <TableHead>HOST</TableHead>
                          <TableHead>MEMBER OF</TableHead>
                          <TableHead>ADMIN</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pageData.map((user, index) => (
                          <TableRow key={index}>
                            <TableCell className="font-medium">{user.name}</TableCell>
                            <TableCell>
                              <Badge variant={user.status === 'Enabled' ? 'outline' : 'secondary'}>
                                {user.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-sm">{user.domain}</TableCell>
                            <TableCell className="text-sm">{user.memberOf}</TableCell>
                            <TableCell>{user.isAdmin ? <Badge variant="destructive">Admin</Badge> : '-'}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                />
              </TabsContent>

              <TabsContent value="entra">
                <PaginatedTable
                  data={filteredUsersEntra}
                  renderTable={(pageData) => (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>NAME</TableHead>
                          <TableHead>STATUS</TableHead>
                          <TableHead>DOMAIN</TableHead>
                          <TableHead>MEMBER OF</TableHead>
                          <TableHead>ADMIN</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pageData.map((user, index) => (
                          <TableRow key={index}>
                            <TableCell className="font-medium">{user.name}</TableCell>
                            <TableCell>
                              <Badge variant={user.status === 'Enabled' ? 'outline' : 'secondary'}>
                                {user.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-sm">{user.domain}</TableCell>
                            <TableCell className="text-sm">{user.memberOf}</TableCell>
                            <TableCell>{user.isAdmin ? <Badge variant="destructive">Admin</Badge> : '-'}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </section>

      {/* Correlation Section */}
      <CorrelationSection />
    </div>
  );
};
