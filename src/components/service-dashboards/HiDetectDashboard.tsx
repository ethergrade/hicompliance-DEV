import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { RiskScoreCard } from './RiskScoreCard';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Shield,
  AlertTriangle,
  Monitor,
  Activity,
  Eye,
  Clock,
  CheckCircle,
  XCircle,
  Bell,
  Target,
  Zap,
  TrendingUp,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  Legend,
  AreaChart,
  Area,
} from 'recharts';

// Mock data for overview
const overviewData = {
  totalEndpoints: 245,
  monitoredEndpoints: 238,
  threatsDetected: 127,
  alertsToday: 23,
  avgResponseTime: '< 15 min',
  coverageHours: '24/7',
};

// Threat severity distribution
const threatSeverityData = [
  { name: 'Critico', value: 8, color: '#ef4444' },
  { name: 'Alto', value: 24, color: '#f97316' },
  { name: 'Medio', value: 45, color: '#eab308' },
  { name: 'Basso', value: 50, color: '#22c55e' },
];

// Weekly threat trend
const weeklyThreatTrend = [
  { day: 'Lun', rilevati: 18, bloccati: 18, investigati: 15 },
  { day: 'Mar', rilevati: 24, bloccati: 24, investigati: 22 },
  { day: 'Mer', rilevati: 15, bloccati: 15, investigati: 14 },
  { day: 'Gio', rilevati: 32, bloccati: 31, investigati: 28 },
  { day: 'Ven', rilevati: 22, bloccati: 22, investigati: 20 },
  { day: 'Sab', rilevati: 8, bloccati: 8, investigati: 8 },
  { day: 'Dom', rilevati: 6, bloccati: 6, investigati: 6 },
];

// Detection categories
const detectionCategoriesData = [
  { category: 'Malware', count: 34 },
  { category: 'Phishing', count: 28 },
  { category: 'Suspicious Behavior', count: 22 },
  { category: 'Network Anomaly', count: 18 },
  { category: 'Credential Theft', count: 12 },
  { category: 'Ransomware', count: 8 },
  { category: 'Data Exfiltration', count: 5 },
];

// Real-time alerts
const realtimeAlerts = [
  {
    id: 'ALR-001',
    timestamp: '10:45:32',
    severity: 'Critico',
    type: 'Ransomware Detection',
    endpoint: 'WS-PC042',
    status: 'In Analisi',
    analyst: 'SOC Team',
  },
  {
    id: 'ALR-002',
    timestamp: '10:32:15',
    severity: 'Alto',
    type: 'Credential Dumping',
    endpoint: 'SRV-DC01',
    status: 'Mitigato',
    analyst: 'SOC Team',
  },
  {
    id: 'ALR-003',
    timestamp: '10:18:44',
    severity: 'Medio',
    type: 'Suspicious PowerShell',
    endpoint: 'WS-PC087',
    status: 'Risolto',
    analyst: 'SOC Team',
  },
  {
    id: 'ALR-004',
    timestamp: '09:55:22',
    severity: 'Alto',
    type: 'Lateral Movement',
    endpoint: 'SRV-FILE02',
    status: 'In Analisi',
    analyst: 'SOC Team',
  },
  {
    id: 'ALR-005',
    timestamp: '09:42:11',
    severity: 'Basso',
    type: 'Policy Violation',
    endpoint: 'WS-PC156',
    status: 'Risolto',
    analyst: 'SOC Team',
  },
];

// Endpoint protection status
const endpointStatusData = [
  {
    hostname: 'WS-PC001',
    ip: '192.168.10.101',
    os: 'Windows 11 Pro',
    status: 'Protetto',
    lastSeen: '2 min fa',
    threats: 0,
  },
  {
    hostname: 'WS-PC002',
    ip: '192.168.10.102',
    os: 'Windows 10 Enterprise',
    status: 'Protetto',
    lastSeen: '5 min fa',
    threats: 1,
  },
  {
    hostname: 'SRV-DC01',
    ip: '192.168.1.10',
    os: 'Windows Server 2022',
    status: 'Attenzione',
    lastSeen: '1 min fa',
    threats: 2,
  },
  {
    hostname: 'SRV-FILE02',
    ip: '192.168.1.20',
    os: 'Windows Server 2019',
    status: 'Protetto',
    lastSeen: '3 min fa',
    threats: 0,
  },
  {
    hostname: 'WS-MAC001',
    ip: '192.168.10.201',
    os: 'macOS Sonoma',
    status: 'Protetto',
    lastSeen: '8 min fa',
    threats: 0,
  },
  {
    hostname: 'WS-PC045',
    ip: '192.168.10.145',
    os: 'Windows 11 Pro',
    status: 'Offline',
    lastSeen: '2 ore fa',
    threats: 0,
  },
];

// SOC Activity log
const socActivityLog = [
  {
    time: '10:45',
    action: 'Analisi minaccia avviata',
    details: 'Ransomware detection su WS-PC042',
    analyst: 'SOC L2',
  },
  {
    time: '10:32',
    action: 'Threat contenuta',
    details: 'Credential dumping bloccato su SRV-DC01',
    analyst: 'SOC L2',
  },
  {
    time: '10:18',
    action: 'Alert chiuso',
    details: 'False positive - PowerShell legittimo',
    analyst: 'SOC L1',
  },
  {
    time: '10:05',
    action: 'Escalation a L2',
    details: 'Lateral movement rilevato',
    analyst: 'SOC L1',
  },
  {
    time: '09:55',
    action: 'Investigation avviata',
    details: 'Anomalia network su segmento DMZ',
    analyst: 'SOC L2',
  },
  {
    time: '09:42',
    action: 'Policy enforcement',
    details: 'USB non autorizzato bloccato',
    analyst: 'SOC L1',
  },
];

// Detection rules status
const detectionRulesData = [
  { category: 'Malware Detection', active: 156, updated: '2 ore fa' },
  { category: 'Behavioral Analysis', active: 89, updated: '1 ora fa' },
  { category: 'Network Monitoring', active: 67, updated: '30 min fa' },
  { category: 'Identity Protection', active: 45, updated: '4 ore fa' },
  { category: 'Data Protection', active: 34, updated: '1 giorno fa' },
];

// Hourly detection activity
const hourlyActivityData = [
  { hour: '00:00', detections: 2 },
  { hour: '02:00', detections: 1 },
  { hour: '04:00', detections: 0 },
  { hour: '06:00', detections: 3 },
  { hour: '08:00', detections: 8 },
  { hour: '10:00', detections: 12 },
  { hour: '12:00', detections: 6 },
  { hour: '14:00', detections: 9 },
  { hour: '16:00', detections: 15 },
  { hour: '18:00', detections: 7 },
  { hour: '20:00', detections: 4 },
  { hour: '22:00', detections: 2 },
];

const getSeverityBadge = (severity: string) => {
  switch (severity) {
    case 'Critico':
      return <Badge className="bg-red-500/20 text-red-500 border-red-500/30">Critico</Badge>;
    case 'Alto':
      return <Badge className="bg-orange-500/20 text-orange-500 border-orange-500/30">Alto</Badge>;
    case 'Medio':
      return <Badge className="bg-yellow-500/20 text-yellow-500 border-yellow-500/30">Medio</Badge>;
    case 'Basso':
      return <Badge className="bg-green-500/20 text-green-500 border-green-500/30">Basso</Badge>;
    default:
      return <Badge variant="outline">{severity}</Badge>;
  }
};

const getStatusBadge = (status: string) => {
  switch (status) {
    case 'Protetto':
      return <Badge className="bg-green-500/20 text-green-500 border-green-500/30">Protetto</Badge>;
    case 'Attenzione':
      return <Badge className="bg-orange-500/20 text-orange-500 border-orange-500/30">Attenzione</Badge>;
    case 'Offline':
      return <Badge className="bg-muted text-muted-foreground border-muted">Offline</Badge>;
    case 'In Analisi':
      return <Badge className="bg-blue-500/20 text-blue-500 border-blue-500/30">In Analisi</Badge>;
    case 'Mitigato':
      return <Badge className="bg-cyan-500/20 text-cyan-500 border-cyan-500/30">Mitigato</Badge>;
    case 'Risolto':
      return <Badge className="bg-green-500/20 text-green-500 border-green-500/30">Risolto</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
};

export const HiDetectDashboard: React.FC = () => {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">HiDetect - SOC as a Service</h1>
          <p className="text-muted-foreground">
            Monitoraggio continuo 24/7 con rilevamento e risposta gestita alle minacce
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge className="bg-green-500/20 text-green-500 border-green-500/30">
            <Activity className="w-3 h-3 mr-1" />
            SOC Attivo
          </Badge>
          <Badge variant="outline">
            <Clock className="w-3 h-3 mr-1" />
            Copertura 24/7
          </Badge>
        </div>
      </div>

      {/* Overview Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Card className="border-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Endpoint Totali</p>
                <p className="text-2xl font-bold">{overviewData.totalEndpoints}</p>
              </div>
              <Monitor className="w-8 h-8 text-primary" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Monitorati</p>
                <p className="text-2xl font-bold text-green-500">{overviewData.monitoredEndpoints}</p>
              </div>
              <Eye className="w-8 h-8 text-green-500" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Minacce (30gg)</p>
                <p className="text-2xl font-bold text-orange-500">{overviewData.threatsDetected}</p>
              </div>
              <Target className="w-8 h-8 text-orange-500" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Alert Oggi</p>
                <p className="text-2xl font-bold text-red-500">{overviewData.alertsToday}</p>
              </div>
              <Bell className="w-8 h-8 text-red-500" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Tempo Risposta</p>
                <p className="text-2xl font-bold text-cyan-500">{overviewData.avgResponseTime}</p>
              </div>
              <Zap className="w-8 h-8 text-cyan-500" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Copertura</p>
                <p className="text-2xl font-bold text-primary">{overviewData.coverageHours}</p>
              </div>
              <Shield className="w-8 h-8 text-primary" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Risk Scores */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <RiskScoreCard
          title="Detection Rate"
          level="Eccellente"
          levelColor="green"
          score={98}
          ringColor="#22c55e"
        />
        <RiskScoreCard
          title="Threat Coverage"
          level="Buono"
          levelColor="green"
          score={94}
          ringColor="#22c55e"
        />
        <RiskScoreCard
          title="Response SLA"
          level="Eccellente"
          levelColor="green"
          score={99}
          ringColor="#22c55e"
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Threat Severity Distribution */}
        <Card className="border-border">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              Distribuzione Severità Minacce
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={threatSeverityData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={2}
                    dataKey="value"
                    label={({ name, value }) => `${name}: ${value}`}
                  >
                    {threatSeverityData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Weekly Threat Trend */}
        <Card className="border-border">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              Trend Minacce Settimanale
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={weeklyThreatTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="day" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                    }}
                  />
                  <Legend />
                  <Area
                    type="monotone"
                    dataKey="rilevati"
                    stackId="1"
                    stroke="#ef4444"
                    fill="#ef4444"
                    fillOpacity={0.3}
                    name="Rilevati"
                  />
                  <Area
                    type="monotone"
                    dataKey="bloccati"
                    stackId="2"
                    stroke="#22c55e"
                    fill="#22c55e"
                    fillOpacity={0.3}
                    name="Bloccati"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Detection Categories & Hourly Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border-border">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Target className="w-4 h-4" />
              Categorie di Rilevamento
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={detectionCategoriesData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                  <YAxis
                    type="category"
                    dataKey="category"
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={11}
                    width={120}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                    }}
                  />
                  <Bar dataKey="count" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="w-4 h-4" />
              Attività Rilevamento (24h)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={hourlyActivityData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="hour" stroke="hsl(var(--muted-foreground))" fontSize={10} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="detections"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    dot={{ fill: 'hsl(var(--primary))' }}
                    name="Rilevamenti"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Real-time Alerts */}
      <Card className="border-border">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Bell className="w-4 h-4" />
            Alert in Tempo Reale
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Ora</TableHead>
                <TableHead>Severità</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Endpoint</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Assegnato</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {realtimeAlerts.map((alert) => (
                <TableRow key={alert.id}>
                  <TableCell className="font-mono text-xs">{alert.id}</TableCell>
                  <TableCell className="text-muted-foreground">{alert.timestamp}</TableCell>
                  <TableCell>{getSeverityBadge(alert.severity)}</TableCell>
                  <TableCell>{alert.type}</TableCell>
                  <TableCell className="font-mono text-xs">{alert.endpoint}</TableCell>
                  <TableCell>{getStatusBadge(alert.status)}</TableCell>
                  <TableCell className="text-muted-foreground">{alert.analyst}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Endpoint Status & SOC Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Endpoint Protection Status */}
        <Card className="border-border">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Monitor className="w-4 h-4" />
              Stato Protezione Endpoint
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Hostname</TableHead>
                  <TableHead>IP</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Ultimo Check</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {endpointStatusData.map((endpoint, index) => (
                  <TableRow key={index}>
                    <TableCell className="font-mono text-xs">{endpoint.hostname}</TableCell>
                    <TableCell className="text-muted-foreground text-xs">{endpoint.ip}</TableCell>
                    <TableCell>{getStatusBadge(endpoint.status)}</TableCell>
                    <TableCell className="text-muted-foreground text-xs">{endpoint.lastSeen}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* SOC Activity Log */}
        <Card className="border-border">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="w-4 h-4" />
              Attività SOC
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {socActivityLog.map((activity, index) => (
                <div
                  key={index}
                  className="flex items-start gap-3 p-3 rounded-lg bg-muted/30 border border-border"
                >
                  <div className="text-xs text-muted-foreground font-mono w-12">
                    {activity.time}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium">{activity.action}</p>
                    <p className="text-xs text-muted-foreground">{activity.details}</p>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {activity.analyst}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Detection Rules Status */}
      <Card className="border-border">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="w-4 h-4" />
            Regole di Rilevamento Attive
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            {detectionRulesData.map((rule, index) => (
              <div
                key={index}
                className="p-4 rounded-lg bg-muted/30 border border-border text-center"
              >
                <p className="text-2xl font-bold text-primary">{rule.active}</p>
                <p className="text-sm font-medium mt-1">{rule.category}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Aggiornato: {rule.updated}
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
