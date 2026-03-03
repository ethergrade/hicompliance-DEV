import React, { useState, useMemo, useCallback } from 'react';
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
  const [filters, setFilters] = useState<HiLogFilters>({
    globalSearch: '', severity: 'all', hostname: '', username: '', ip: '',
  });
  const [advancedFilter, setAdvancedFilter] = useState<AdvancedFilter>(createEmptyFilter());
  const [advancedMode, setAdvancedMode] = useState(false);

  // Combined filter: basic + advanced
  const applyAllFilters = useCallback(<T extends Record<string, any>>(data: T[], extraFields?: { hostnameKey?: string; usernameKey?: string; ipKey?: string; severityKey?: string }): T[] => {
    // If advanced mode is active, use the boolean engine
    if (advancedMode) {
      return evalAdvancedFilter(data, advancedFilter);
    }
    // Otherwise use legacy simple filters
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
      />

      {/* Overview Section */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold">Overview</h2>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* System Info Card */}
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

          {/* Windows File Server Card */}
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

          {/* USB Drives Card */}
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
                        <TableCell className="font-medium">{log.username}</TableCell>
                        <TableCell className="text-sm">{log.application}</TableCell>
                        <TableCell>
                          <Badge className={cn("font-medium", actionColors[log.status])}>{log.status}</Badge>
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

      {/* Security Events Detailed */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold">Security Events - Dettaglio</h2>
        <Card className="border-border">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <Shield className="w-5 h-5 text-orange-500" />Logs overview
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
                      <TableHead>CATEGORY</TableHead>
                      <TableHead>HOSTNAME</TableHead>
                      <TableHead>USERNAME</TableHead>
                      <TableHead>IP</TableHead>
                      <TableHead>MESSAGE</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pageData.map((event, index) => (
                      <TableRow key={index}>
                        <TableCell className="text-sm text-muted-foreground">{event.datetime}</TableCell>
                        <TableCell>
                          <Badge className={cn("font-medium", severityColors[event.severity])}>{event.severity}</Badge>
                        </TableCell>
                        <TableCell className="font-medium text-primary">{event.event}</TableCell>
                        <TableCell className="text-sm">{event.source}</TableCell>
                        <TableCell className="text-sm">{event.category}</TableCell>
                        <TableCell className="text-sm">{event.hostname}</TableCell>
                        <TableCell className="text-sm">{event.username}</TableCell>
                        <TableCell className="text-sm font-mono">{event.sourceIp}</TableCell>
                        <TableCell className="text-sm text-muted-foreground max-w-xs truncate">{event.message}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            />
          </CardContent>
        </Card>
      </section>

      {/* Startup and Shutdown Section */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold">Startup and Shutdown</h2>
        <Card className="border-border">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <Power className="w-5 h-5 text-green-500" />Logs overview
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
                  <Bar dataKey="unexpected" fill="#fbbf24" name="Previous Shutdown was unexpected" stackId="a" />
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
                          <Badge className={cn("font-medium", actionColors[log.operation])}>{log.operation}</Badge>
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

      {/* Firewall Logs Section */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold">Firewall</h2>
        <Card className="border-border">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <Shield className="w-5 h-5 text-blue-500" />Logs overview
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
                      <TableHead>HOSTNAME</TableHead>
                      <TableHead>SEVERITY</TableHead>
                      <TableHead>USERNAME</TableHead>
                      <TableHead>ACTION TYPE</TableHead>
                      <TableHead>ACTION</TableHead>
                      <TableHead>SOURCE IP</TableHead>
                      <TableHead>MESSAGE</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pageData.map((log, index) => (
                      <TableRow key={index}>
                        <TableCell className="text-sm text-muted-foreground">{log.datetime}</TableCell>
                        <TableCell className="font-medium">{log.hostname}</TableCell>
                        <TableCell>
                          <Badge className={cn("font-medium", severityColors[log.severity])}>{log.severity}</Badge>
                        </TableCell>
                        <TableCell className="text-sm">{log.username}</TableCell>
                        <TableCell className="text-sm text-primary">{log.actionType}</TableCell>
                        <TableCell className="text-sm">{log.action}</TableCell>
                        <TableCell className="text-sm font-mono">{log.sourceIp}</TableCell>
                        <TableCell className="text-sm text-muted-foreground max-w-xs truncate">{log.message}</TableCell>
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
                <HardDrive className="w-5 h-5 text-primary" />All Hosts
              </CardTitle>
              <Badge variant="outline">{filteredHosts.length} host</Badge>
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
                      <TableHead>OS NAME</TableHead>
                      <TableHead>OS VERSION</TableHead>
                      <TableHead>IP ADDRESSES</TableHead>
                      <TableHead>ISSUES</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pageData.map((host, index) => (
                      <TableRow key={index}>
                        <TableCell className="font-medium text-primary">{host.hostname}</TableCell>
                        <TableCell className="text-sm">{host.domain}</TableCell>
                        <TableCell className="text-sm">{host.osName}</TableCell>
                        <TableCell>
                          <span className="text-sm">{host.osVersion}</span>
                          {(host.osVersion === '24H2' || host.osVersion === '22H2' || host.osVersion === '1809') && (
                            <Badge variant="outline" className="ml-2 text-orange-500 border-orange-500">!</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {host.ipAddresses.map((ip, i) => (
                            <div key={i} className="text-sm font-mono">{ip}</div>
                          ))}
                        </TableCell>
                        <TableCell className="font-medium">{host.issues}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            />
          </CardContent>
        </Card>
      </section>

      {/* Users and Admins Section */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold">Users and Admins</h2>
        <Card className="border-border">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Users className="w-5 h-5 text-primary" />Directory Users
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="active-directory" className="w-full">
              <TabsList className="mb-4">
                <TabsTrigger value="active-directory">Active Directory ({filteredUsersAD.length})</TabsTrigger>
                <TabsTrigger value="local">Local ({filteredUsersLocal.length})</TabsTrigger>
                <TabsTrigger value="entra-id">Entra ID ({filteredUsersEntra.length})</TabsTrigger>
              </TabsList>
              
              <TabsContent value="active-directory">
                <PaginatedTable
                  data={filteredUsersAD}
                  renderTable={(pageData) => (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead></TableHead>
                          <TableHead>NAME</TableHead>
                          <TableHead>STATUS</TableHead>
                          <TableHead>DOMAIN</TableHead>
                          <TableHead>MEMBER OF</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pageData.map((user, index) => (
                          <TableRow key={index}>
                            <TableCell>
                              {user.isAdmin && (
                                <Badge variant="outline" className="bg-primary/10 text-primary border-primary">👑</Badge>
                              )}
                            </TableCell>
                            <TableCell className="font-medium text-primary">{user.name}</TableCell>
                            <TableCell>
                              <Badge className={cn("font-medium", user.status === 'Enabled' ? 'bg-green-500/20 text-green-500' : 'bg-muted text-muted-foreground')}>
                                {user.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-sm">{user.domain}</TableCell>
                            <TableCell className="text-sm">{user.memberOf}</TableCell>
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
                          <TableHead></TableHead>
                          <TableHead>NAME</TableHead>
                          <TableHead>STATUS</TableHead>
                          <TableHead>HOST</TableHead>
                          <TableHead>MEMBER OF</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pageData.map((user, index) => (
                          <TableRow key={index}>
                            <TableCell>
                              {user.isAdmin && (
                                <Badge variant="outline" className="bg-primary/10 text-primary border-primary">👑</Badge>
                              )}
                            </TableCell>
                            <TableCell className="font-medium text-primary">{user.name}</TableCell>
                            <TableCell>
                              <Badge className={cn("font-medium", user.status === 'Enabled' ? 'bg-green-500/20 text-green-500' : 'bg-muted text-muted-foreground')}>
                                {user.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-sm">{user.domain}</TableCell>
                            <TableCell className="text-sm">{user.memberOf}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                />
              </TabsContent>
              
              <TabsContent value="entra-id">
                <PaginatedTable
                  data={filteredUsersEntra}
                  renderTable={(pageData) => (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead></TableHead>
                          <TableHead>NAME</TableHead>
                          <TableHead>STATUS</TableHead>
                          <TableHead>DOMAIN</TableHead>
                          <TableHead>MEMBER OF</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pageData.map((user, index) => (
                          <TableRow key={index}>
                            <TableCell>
                              {user.isAdmin && (
                                <Badge variant="outline" className="bg-primary/10 text-primary border-primary">👑</Badge>
                              )}
                            </TableCell>
                            <TableCell className="font-medium text-primary">{user.name}</TableCell>
                            <TableCell>
                              <Badge className={cn("font-medium", user.status === 'Enabled' ? 'bg-green-500/20 text-green-500' : 'bg-muted text-muted-foreground')}>
                                {user.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-sm">{user.domain}</TableCell>
                            <TableCell className="text-sm">{user.memberOf}</TableCell>
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

      {/* Correlations Section */}
      <CorrelationSection />
    </div>
  );
};
