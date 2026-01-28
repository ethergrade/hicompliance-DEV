import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Database, 
  Server, 
  Shield, 
  Users, 
  Activity, 
  Search, 
  RefreshCw,
  Filter,
  HardDrive,
  Monitor,
  Usb,
  FileText,
  Power
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
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';

// Mock data
const overviewData = {
  refCode: 'HST-SIEM-0004',
  activationDate: '21/07/2025',
  hostsWindows: 84,
  hostsLinux: 0,
  logsSize: {
    baseLogs: '9.20 GB',
    customApp: '0.00 B',
    syslogStandard: '0.00 B',
    syslogFree: '0.00 B',
    webServers: '0.00 B',
    dlp: '22.51 GB',
    microsoft365: '3.86 GB',
    securityEvents: '2.86 MB',
    nas: '0.00 B',
    firewall: '581.57 MB',
    total: '36.14 GB',
  }
};

const usbDrivesData = [
  { date: '26/01/2026', whitelist: 2, notWhitelist: 65 },
  { date: '27/01/2026', whitelist: 5, notWhitelist: 28 },
  { date: '28/01/2026', whitelist: 1, notWhitelist: 8 },
];

const securityEventsData = [
  { name: 'Low', value: 1, color: '#fcd34d', lastReceived: '27/01/2026 14:41' },
  { name: 'Medium', value: 1, color: '#fb923c', lastReceived: '27/01/2026 11:17' },
  { name: 'High', value: 0, color: '#f87171', lastReceived: '' },
  { name: 'Critical', value: 0, color: '#dc2626', lastReceived: '' },
];

const windowsLogsData = [
  { date: '26/07', login: 150, remoteLogin: 20, logout: 100, authFailure: 5 },
  { date: '07/08', login: 200, remoteLogin: 30, logout: 150, authFailure: 10 },
  { date: '19/08', login: 180, remoteLogin: 25, logout: 120, authFailure: 8 },
  { date: '31/08', login: 220, remoteLogin: 35, logout: 180, authFailure: 15 },
  { date: '12/09', login: 250, remoteLogin: 40, logout: 200, authFailure: 12 },
  { date: '23/11', login: 20000, remoteLogin: 500, logout: 18000, authFailure: 200 },
  { date: '05/12', login: 19000, remoteLogin: 450, logout: 17000, authFailure: 180 },
];

const windowsLogsTableData = [
  { datetime: '28/01/2026 10:24:16', hostname: 'Salvetti', domain: 'IDROTHERM2K', username: 'm.salvetti@idrotherm2000.com', action: 'User Logged In With Cached Credentials', sourceIp: '127.0.0.1', type: 'Admin' },
  { datetime: '28/01/2026 10:23:36', hostname: 'Veeam365', domain: '-', username: '(empty)', action: 'User Login Failure', sourceIp: '-', type: 'NA' },
  { datetime: '28/01/2026 10:21:44', hostname: 'DESKTOP-GTEMH96', domain: '(empty)', username: 'user', action: 'User Logged In', sourceIp: '127.0.0.1', type: 'Standard User' },
  { datetime: '28/01/2026 10:20:24', hostname: 'DESKTOP-GTEMH96', domain: '(empty)', username: 'user', action: 'User Logged Off', sourceIp: '-', type: 'NA' },
];

const entraIdLogsData = [
  { date: '07/08', success: 1200, interrupted: 100, failure: 50 },
  { date: '24/09', success: 1800, interrupted: 200, failure: 150 },
  { date: '06/10', success: 1500, interrupted: 150, failure: 100 },
  { date: '30/10', success: 300, interrupted: 50, failure: 20 },
  { date: '23/11', success: 800, interrupted: 80, failure: 40 },
  { date: '17/12', success: 1100, interrupted: 100, failure: 60 },
];

const entraIdTableData = [
  { datetime: '28/01/2026 10:22:35', username: 'm.ceccarelli@idrotherm2000.com', application: 'Microsoft Account Controls V2', status: 'Success', location: 'Fiattone, Lucca, IT', sourceIp: '80.19.146.2' },
  { datetime: '28/01/2026 10:19:10', username: 'l.giannotti@idrotherm2000.com', application: 'One Outlook Web', status: 'Success', location: 'Fiattone, Lucca, IT', sourceIp: '80.19.146.2' },
  { datetime: '28/01/2026 10:13:09', username: 'elettrica@idrotherm2000.com', application: 'Azure Active Directory PowerShell', status: 'Failure', location: 'Los Angeles, California, US', sourceIp: '216.24.210.201' },
];

const sharePointLogsData = [
  { date: '19/08', opening: 40000, adding: 20000, deleting: 2000 },
  { date: '18/10', opening: 150000, adding: 30000, deleting: 5000 },
  { date: '11/11', opening: 20000, adding: 40000, deleting: 8000 },
  { date: '22/01', opening: 35000, adding: 25000, deleting: 3000 },
];

const securityEventsTableData = [
  { datetime: '27/01/2026 14:41:50', severity: 'Low', event: 'Installation or use of Remote Desktop software', source: 'Windows', category: 'Processes', hostname: 'srv05', message: 'Process name: C:\\Users\\Administrator...' },
  { datetime: '27/01/2026 11:17:37', severity: 'Medium', event: 'Microsoft 365 sign-in to administrative application', source: 'Microsoft365', category: 'Login', hostname: '-', message: 'User: Admin (admin@idrotherm2k.onmicrosoft.com)' },
  { datetime: '27/01/2026 09:53:36', severity: 'High', event: 'Spike of failed remote logons', source: 'Windows', category: 'Login', hostname: 'SRVDC1', message: 'Failed logons count: 8' },
];

const startupShutdownData = [
  { date: '30/10', startup: 200, unexpected: 50, shutdown: 300 },
  { date: '11/11', startup: 350, unexpected: 80, shutdown: 400 },
  { date: '23/11', startup: 400, unexpected: 100, shutdown: 500 },
  { date: '05/12', startup: 450, unexpected: 120, shutdown: 550 },
  { date: '17/12', startup: 300, unexpected: 60, shutdown: 350 },
  { date: '29/12', startup: 250, unexpected: 40, shutdown: 300 },
  { date: '10/01', startup: 350, unexpected: 70, shutdown: 400 },
  { date: '22/01', startup: 280, unexpected: 50, shutdown: 320 },
];

const startupShutdownTableData = [
  { datetime: '28/01/2026 10:21:44', hostname: 'DESKTOP-GTEMH96', operation: 'Startup (Fast Startup)' },
  { datetime: '28/01/2026 10:20:26', hostname: 'DESKTOP-GTEMH96', operation: 'Shutdown (Fast Startup)' },
  { datetime: '28/01/2026 09:43:20', hostname: 'Carrello202', operation: 'Startup (Fast Startup)' },
  { datetime: '28/01/2026 09:29:41', hostname: 'DESKTOP-86QJLG0', operation: 'Previous Shutdown Was Unexpected' },
];

const firewallLogsTableData = [
  { datetime: '27/01/2026 14:53:13', hostname: 'SFW X13304XQM3MVV4E', severity: 'Information', username: 'a.pecchi', actionType: 'Edit', action: 'Update', message: "Firewall Rule 'Manutenzione centralino' was updated..." },
  { datetime: '27/01/2026 14:49:15', hostname: 'SFW X13304XQM3MVV4E', severity: 'Notice', username: 'a.pecchi', actionType: 'Info', action: 'Other management action', message: "User 'kalliope' Status was changed to 'ACTIVE'..." },
];

const hostsTableData = [
  { hostname: 'alepoli', domain: 'IDROTHERM2000 SPA', osName: 'Windows 11 Pro', osVersion: '25H2', ipAddresses: ['192.168.100.163', 'fe80::8282:ab58:bedc:7bdb'], issues: 6 },
  { hostname: 'ambrosini', domain: 'IDROTHERM2000 SPA', osName: 'Windows 11 Pro', osVersion: '25H2', ipAddresses: ['192.168.101.163', 'fe80::a799:56da:e6b1:272a'], issues: 7 },
  { hostname: 'arianna', domain: 'IDROTHERM2000 SPA', osName: 'Windows 11 Pro', osVersion: '24H2', ipAddresses: ['192.168.100.164', 'fe80::c137:5034:a733:f264'], issues: 7 },
  { hostname: 'capoturno', domain: 'IDROTHERM2K', osName: 'Windows 10 Pro', osVersion: '22H2', ipAddresses: ['192.168.40.51', 'fe80::bad1:6522:c896:6cc2'], issues: 10 },
];

const usersTableData = [
  { name: 'admin', status: 'Enabled', domain: 'IDROTHERM2K.local', memberOf: '6 Groups', isAdmin: true },
  { name: 'Administrator', status: 'Enabled', domain: 'IDROTHERM2K.local', memberOf: '7 Groups', isAdmin: true },
  { name: 'Albino Bolpagni', status: 'Enabled', domain: 'IDROTHERM2K.local', memberOf: '7 Groups', isAdmin: false },
  { name: 'alessandro billi', status: 'Enabled', domain: 'IDROTHERM2K.local', memberOf: '4 Groups', isAdmin: true },
  { name: 'Alessio Motta', status: 'Disabled', domain: 'EUROTUBI.local', memberOf: 'EUROTUBI.local\\Domain Users', isAdmin: false },
];

const actionColors: Record<string, string> = {
  'User Logged In With Cached Credentials': 'bg-primary/20 text-primary',
  'User Login Failure': 'bg-red-500/20 text-red-500',
  'User Logged In': 'bg-green-500/20 text-green-500',
  'User Logged Off': 'bg-muted text-muted-foreground',
  'Success': 'bg-green-500/20 text-green-500',
  'Failure': 'bg-red-500/20 text-red-500',
  'Startup (Fast Startup)': 'bg-green-500/20 text-green-500',
  'Shutdown (Fast Startup)': 'bg-blue-500/20 text-blue-500',
  'Previous Shutdown Was Unexpected': 'bg-orange-500/20 text-orange-500',
  'Startup': 'bg-green-500/20 text-green-500',
};

const severityColors: Record<string, string> = {
  'Low': 'bg-yellow-500/20 text-yellow-500',
  'Medium': 'bg-orange-500/20 text-orange-500',
  'High': 'bg-red-500/20 text-red-500',
  'Critical': 'bg-red-700/20 text-red-700',
  'Information': 'bg-blue-500/20 text-blue-500',
  'Notice': 'bg-purple-500/20 text-purple-500',
};

export const HiLogDashboard: React.FC = () => {
  const [activeUserTab, setActiveUserTab] = useState('active-directory');

  return (
    <div className="space-y-8">
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
                    <div>
                      <span className="font-medium">{overviewData.logsSize.baseLogs}</span>
                      <span className="text-primary text-xs ml-1">BASE LOGS</span>
                    </div>
                    <div>
                      <span className="font-medium">{overviewData.logsSize.customApp}</span>
                      <span className="text-primary text-xs ml-1">CUSTOM APP</span>
                    </div>
                    <div>
                      <span className="font-medium">{overviewData.logsSize.dlp}</span>
                      <span className="text-primary text-xs ml-1">DLP</span>
                    </div>
                    <div>
                      <span className="font-medium">{overviewData.logsSize.microsoft365}</span>
                      <span className="text-primary text-xs ml-1">MICROSOFT 365</span>
                    </div>
                    <div>
                      <span className="font-medium">{overviewData.logsSize.securityEvents}</span>
                      <span className="text-primary text-xs ml-1">SECURITY EVENTS</span>
                    </div>
                    <div>
                      <span className="font-medium">{overviewData.logsSize.firewall}</span>
                      <span className="text-primary text-xs ml-1">FIREWALL</span>
                    </div>
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
                <Server className="w-4 h-4" />
                WINDOWS FILE SERVER
              </CardTitle>
              <p className="text-xs text-muted-foreground">Last 24 hours</p>
            </CardHeader>
            <CardContent>
              <div className="h-48 flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={[{ name: 'No data', value: 100 }]}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={70}
                      dataKey="value"
                      stroke="none"
                    >
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
                <Usb className="w-4 h-4" />
                USB DRIVES
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={usbDrivesData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                    <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--card))', 
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px'
                      }} 
                    />
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
          <RiskScoreCard 
            title="Log Collection Rate"
            level="Ottimo"
            levelColor="green"
            score={98}
            ringColor="#10b981"
          />
          <RiskScoreCard 
            title="Security Events Coverage"
            level="Buono"
            levelColor="yellow"
            score={85}
            ringColor="#eab308"
          />
        </div>
      </section>

      {/* Security Events Overview */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold">Security Events</h2>
        
        <Card className="border-border">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Shield className="w-5 h-5 text-orange-500" />
              Security Events - Last 24 hours
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Events comparison donut */}
              <div className="h-64">
                <p className="text-sm font-medium mb-2 text-center">Events comparison</p>
                <ResponsiveContainer width="100%" height="90%">
                  <PieChart>
                    <Pie
                      data={securityEventsData.filter(e => e.value > 0)}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      dataKey="value"
                      label={({ name }) => name}
                    >
                      {securityEventsData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* Severity counters */}
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
                <Monitor className="w-5 h-5 text-blue-500" />
                Logs overview
              </CardTitle>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm">
                  <Filter className="w-4 h-4 mr-1" />
                  Add filter
                </Button>
                <Input placeholder="Search" className="w-48" />
                <Button variant="outline" size="sm">
                  <RefreshCw className="w-4 h-4 mr-1" />
                  Refresh
                </Button>
              </div>
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
                {windowsLogsTableData.map((log, index) => (
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
          </CardContent>
        </Card>
      </section>

      {/* Microsoft Entra ID Section */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold">Microsoft Entra ID</h2>
        
        <Card className="border-border">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Activity className="w-5 h-5 text-purple-500" />
              Logs overview
            </CardTitle>
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
                {entraIdTableData.map((log, index) => (
                  <TableRow key={index}>
                    <TableCell className="text-sm text-muted-foreground">{log.datetime}</TableCell>
                    <TableCell className="font-medium">{log.username}</TableCell>
                    <TableCell className="text-sm">{log.application}</TableCell>
                    <TableCell>
                      <Badge className={cn("font-medium", actionColors[log.status])}>
                        {log.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">{log.location}</TableCell>
                    <TableCell className="font-mono text-sm">{log.sourceIp}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </section>

      {/* Security Events Detailed */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold">Security Events</h2>
        
        <Card className="border-border">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Shield className="w-5 h-5 text-orange-500" />
              Logs overview
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>DATETIME</TableHead>
                  <TableHead>SEVERITY</TableHead>
                  <TableHead>EVENT</TableHead>
                  <TableHead>SOURCE</TableHead>
                  <TableHead>CATEGORY</TableHead>
                  <TableHead>HOSTNAME</TableHead>
                  <TableHead>MESSAGE</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {securityEventsTableData.map((event, index) => (
                  <TableRow key={index}>
                    <TableCell className="text-sm text-muted-foreground">{event.datetime}</TableCell>
                    <TableCell>
                      <Badge className={cn("font-medium", severityColors[event.severity])}>
                        {event.severity}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium text-primary">{event.event}</TableCell>
                    <TableCell className="text-sm">{event.source}</TableCell>
                    <TableCell className="text-sm">{event.category}</TableCell>
                    <TableCell className="text-sm">{event.hostname}</TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-xs truncate">{event.message}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </section>

      {/* Startup and Shutdown Section */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold">Startup and Shutdown</h2>
        
        <Card className="border-border">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Power className="w-5 h-5 text-green-500" />
              Logs overview
            </CardTitle>
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

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>DATETIME</TableHead>
                  <TableHead>HOSTNAME</TableHead>
                  <TableHead>OPERATION</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {startupShutdownTableData.map((log, index) => (
                  <TableRow key={index}>
                    <TableCell className="text-sm text-muted-foreground">{log.datetime}</TableCell>
                    <TableCell className="font-medium">{log.hostname}</TableCell>
                    <TableCell>
                      <Badge className={cn("font-medium", actionColors[log.operation])}>
                        {log.operation}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </section>

      {/* Firewall Logs Section */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold">Firewall</h2>
        
        <Card className="border-border">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Shield className="w-5 h-5 text-blue-500" />
              Logs overview
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>DATETIME</TableHead>
                  <TableHead>HOSTNAME</TableHead>
                  <TableHead>SEVERITY</TableHead>
                  <TableHead>USERNAME</TableHead>
                  <TableHead>ACTION TYPE</TableHead>
                  <TableHead>ACTION</TableHead>
                  <TableHead>MESSAGE</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {firewallLogsTableData.map((log, index) => (
                  <TableRow key={index}>
                    <TableCell className="text-sm text-muted-foreground">{log.datetime}</TableCell>
                    <TableCell className="font-medium">{log.hostname}</TableCell>
                    <TableCell>
                      <Badge className={cn("font-medium", severityColors[log.severity])}>
                        {log.severity}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">{log.username}</TableCell>
                    <TableCell className="text-sm text-primary">{log.actionType}</TableCell>
                    <TableCell className="text-sm">{log.action}</TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-xs truncate">{log.message}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
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
                <HardDrive className="w-5 h-5 text-primary" />
                All Hosts
              </CardTitle>
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
                  <TableHead>HOSTNAME</TableHead>
                  <TableHead>DOMAIN</TableHead>
                  <TableHead>OS NAME</TableHead>
                  <TableHead>OS VERSION</TableHead>
                  <TableHead>IP ADDRESSES</TableHead>
                  <TableHead>ISSUES</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {hostsTableData.map((host, index) => (
                  <TableRow key={index}>
                    <TableCell className="font-medium text-primary">{host.hostname}</TableCell>
                    <TableCell className="text-sm">{host.domain}</TableCell>
                    <TableCell className="text-sm">{host.osName}</TableCell>
                    <TableCell>
                      <span className="text-sm">{host.osVersion}</span>
                      {host.osVersion === '24H2' || host.osVersion === '22H2' ? (
                        <Badge variant="outline" className="ml-2 text-orange-500 border-orange-500">!</Badge>
                      ) : null}
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
          </CardContent>
        </Card>
      </section>

      {/* Users and Admins Section */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold">Users and Admins</h2>
        
        <Card className="border-border">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Users className="w-5 h-5 text-primary" />
              Directory Users
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="active-directory" className="w-full">
              <TabsList className="mb-4">
                <TabsTrigger value="active-directory">Active Directory</TabsTrigger>
                <TabsTrigger value="local">Local</TabsTrigger>
                <TabsTrigger value="entra-id">Entra ID</TabsTrigger>
              </TabsList>
              
              <TabsContent value="active-directory">
                <div className="flex items-center gap-4 mb-4">
                  <Button variant="outline" size="sm">
                    <Filter className="w-4 h-4 mr-1" />
                    Add filter
                  </Button>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" className="rounded" defaultChecked />
                    Show disabled
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" className="rounded" />
                    Show admins only
                  </label>
                  <Input placeholder="Search" className="w-64" />
                </div>
                
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
                    {usersTableData.map((user, index) => (
                      <TableRow key={index}>
                        <TableCell>
                          {user.isAdmin && (
                            <Badge variant="outline" className="bg-primary/10 text-primary border-primary">
                              👑
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="font-medium text-primary">{user.name}</TableCell>
                        <TableCell>
                          <Badge className={cn("font-medium", user.status === 'Enabled' ? 'bg-green-500/20 text-green-500' : 'bg-muted text-muted-foreground')}>
                            {user.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-primary">{user.domain}</TableCell>
                        <TableCell className="text-primary">{user.memberOf}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TabsContent>
              
              <TabsContent value="local">
                <p className="text-muted-foreground">Local users will be displayed here.</p>
              </TabsContent>
              
              <TabsContent value="entra-id">
                <p className="text-muted-foreground">Entra ID users will be displayed here.</p>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </section>
    </div>
  );
};
