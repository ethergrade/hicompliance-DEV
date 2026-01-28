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
import { Progress } from '@/components/ui/progress';
import {
  Smartphone,
  Tablet,
  Shield,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Lock,
  Wifi,
  Battery,
  MapPin,
  AppWindow,
  Users,
  Settings,
  RefreshCw,
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
} from 'recharts';

// Overview metrics
const overviewData = {
  totalDevices: 342,
  enrolledDevices: 328,
  compliantDevices: 298,
  nonCompliantDevices: 30,
  iOSDevices: 186,
  androidDevices: 142,
  pendingEnrollment: 14,
};

// Device OS distribution
const osDistributionData = [
  { name: 'iOS 17', value: 124, color: '#3b82f6' },
  { name: 'iOS 16', value: 62, color: '#60a5fa' },
  { name: 'Android 14', value: 78, color: '#22c55e' },
  { name: 'Android 13', value: 48, color: '#4ade80' },
  { name: 'Android 12', value: 16, color: '#86efac' },
];

// Compliance status
const complianceData = [
  { category: 'Encryption', compliant: 320, nonCompliant: 8 },
  { category: 'Passcode', compliant: 305, nonCompliant: 23 },
  { category: 'OS Aggiornato', compliant: 278, nonCompliant: 50 },
  { category: 'App Approvate', compliant: 312, nonCompliant: 16 },
  { category: 'VPN Attiva', compliant: 245, nonCompliant: 83 },
];

// Enrollment trend
const enrollmentTrend = [
  { month: 'Ago', enrolled: 280, active: 265 },
  { month: 'Set', enrolled: 295, active: 282 },
  { month: 'Ott', enrolled: 310, active: 298 },
  { month: 'Nov', enrolled: 320, active: 305 },
  { month: 'Dic', enrolled: 328, active: 312 },
  { month: 'Gen', enrolled: 342, active: 328 },
];

// Device inventory
const deviceInventory = [
  {
    id: 'MDM-001',
    deviceName: 'iPhone 15 Pro - Utente001',
    user: 'Mario Rossi',
    os: 'iOS 17.2',
    model: 'iPhone 15 Pro',
    status: 'Compliant',
    lastSeen: '2 min fa',
    battery: 85,
    encrypted: true,
  },
  {
    id: 'MDM-002',
    deviceName: 'Galaxy S24 - Utente002',
    user: 'Laura Bianchi',
    os: 'Android 14',
    model: 'Samsung Galaxy S24',
    status: 'Compliant',
    lastSeen: '5 min fa',
    battery: 72,
    encrypted: true,
  },
  {
    id: 'MDM-003',
    deviceName: 'iPad Pro - Utente003',
    user: 'Giuseppe Verdi',
    os: 'iPadOS 17.2',
    model: 'iPad Pro 12.9"',
    status: 'Non Compliant',
    lastSeen: '1 ora fa',
    battery: 45,
    encrypted: true,
  },
  {
    id: 'MDM-004',
    deviceName: 'Pixel 8 - Utente004',
    user: 'Anna Neri',
    os: 'Android 14',
    model: 'Google Pixel 8',
    status: 'Compliant',
    lastSeen: '10 min fa',
    battery: 92,
    encrypted: true,
  },
  {
    id: 'MDM-005',
    deviceName: 'iPhone 14 - Utente005',
    user: 'Marco Blu',
    os: 'iOS 16.7',
    model: 'iPhone 14',
    status: 'Non Compliant',
    lastSeen: '3 ore fa',
    battery: 23,
    encrypted: false,
  },
  {
    id: 'MDM-006',
    deviceName: 'Galaxy Tab S9 - Utente006',
    user: 'Elena Gialli',
    os: 'Android 13',
    model: 'Samsung Galaxy Tab S9',
    status: 'Compliant',
    lastSeen: '15 min fa',
    battery: 68,
    encrypted: true,
  },
];

// Security policies
const securityPolicies = [
  { name: 'Passcode Obbligatorio', status: 'active', devices: 328, compliance: 93 },
  { name: 'Crittografia Dispositivo', status: 'active', devices: 328, compliance: 98 },
  { name: 'Blocco Schermo (5 min)', status: 'active', devices: 328, compliance: 95 },
  { name: 'VPN Aziendale', status: 'active', devices: 245, compliance: 75 },
  { name: 'App Store Gestito', status: 'active', devices: 328, compliance: 89 },
  { name: 'Backup Automatico', status: 'active', devices: 312, compliance: 95 },
];

// App inventory
const appInventory = [
  { name: 'Microsoft 365', category: 'Produttività', installed: 315, status: 'Approvata' },
  { name: 'Slack', category: 'Comunicazione', installed: 298, status: 'Approvata' },
  { name: 'Salesforce', category: 'CRM', installed: 156, status: 'Approvata' },
  { name: 'Zoom', category: 'Meeting', installed: 287, status: 'Approvata' },
  { name: 'Chrome', category: 'Browser', installed: 142, status: 'Approvata' },
  { name: 'WhatsApp', category: 'Messaggistica', installed: 45, status: 'Limitata' },
];

// Security events
const securityEvents = [
  { time: '10:45', event: 'Tentativo jailbreak rilevato', device: 'iPhone 14 - Utente005', severity: 'Critico' },
  { time: '10:32', event: 'App non autorizzata installata', device: 'Galaxy S24 - Utente002', severity: 'Alto' },
  { time: '10:18', event: 'VPN disconnessa', device: 'iPad Pro - Utente003', severity: 'Medio' },
  { time: '09:55', event: 'Password policy violata', device: 'Pixel 8 - Utente004', severity: 'Alto' },
  { time: '09:42', event: 'Geolocalizzazione disabilitata', device: 'iPhone 15 Pro - Utente001', severity: 'Basso' },
];

const getStatusBadge = (status: string) => {
  switch (status) {
    case 'Compliant':
      return <Badge className="bg-green-500/20 text-green-500 border-green-500/30">Conforme</Badge>;
    case 'Non Compliant':
      return <Badge className="bg-red-500/20 text-red-500 border-red-500/30">Non Conforme</Badge>;
    case 'Approvata':
      return <Badge className="bg-green-500/20 text-green-500 border-green-500/30">Approvata</Badge>;
    case 'Limitata':
      return <Badge className="bg-yellow-500/20 text-yellow-500 border-yellow-500/30">Limitata</Badge>;
    case 'active':
      return <Badge className="bg-green-500/20 text-green-500 border-green-500/30">Attiva</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
};

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

export const HiMobileDashboard: React.FC = () => {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">HiMobile - Mobile Device Management</h1>
          <p className="text-muted-foreground">
            Gestione centralizzata e sicurezza per dispositivi mobili aziendali
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge className="bg-green-500/20 text-green-500 border-green-500/30">
            <CheckCircle className="w-3 h-3 mr-1" />
            MDM Attivo
          </Badge>
          <Badge variant="outline">
            <RefreshCw className="w-3 h-3 mr-1" />
            Sync: 2 min fa
          </Badge>
        </div>
      </div>

      {/* Overview Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
        <Card className="border-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Dispositivi Totali</p>
                <p className="text-2xl font-bold">{overviewData.totalDevices}</p>
              </div>
              <Smartphone className="w-8 h-8 text-primary" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Registrati</p>
                <p className="text-2xl font-bold text-green-500">{overviewData.enrolledDevices}</p>
              </div>
              <CheckCircle className="w-8 h-8 text-green-500" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Conformi</p>
                <p className="text-2xl font-bold text-green-500">{overviewData.compliantDevices}</p>
              </div>
              <Shield className="w-8 h-8 text-green-500" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Non Conformi</p>
                <p className="text-2xl font-bold text-red-500">{overviewData.nonCompliantDevices}</p>
              </div>
              <AlertTriangle className="w-8 h-8 text-red-500" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">iOS</p>
                <p className="text-2xl font-bold text-blue-500">{overviewData.iOSDevices}</p>
              </div>
              <Smartphone className="w-8 h-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Android</p>
                <p className="text-2xl font-bold text-green-500">{overviewData.androidDevices}</p>
              </div>
              <Smartphone className="w-8 h-8 text-green-500" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">In Attesa</p>
                <p className="text-2xl font-bold text-yellow-500">{overviewData.pendingEnrollment}</p>
              </div>
              <RefreshCw className="w-8 h-8 text-yellow-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Risk Scores */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <RiskScoreCard
          title="Compliance Rate"
          level="Buono"
          levelColor="green"
          score={91}
          ringColor="#22c55e"
        />
        <RiskScoreCard
          title="Encryption Coverage"
          level="Eccellente"
          levelColor="green"
          score={98}
          ringColor="#22c55e"
        />
        <RiskScoreCard
          title="Policy Enforcement"
          level="Buono"
          levelColor="green"
          score={89}
          ringColor="#22c55e"
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* OS Distribution */}
        <Card className="border-border">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Smartphone className="w-4 h-4" />
              Distribuzione Sistemi Operativi
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={osDistributionData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={2}
                    dataKey="value"
                    label={({ name, value }) => `${name}: ${value}`}
                  >
                    {osDistributionData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Enrollment Trend */}
        <Card className="border-border">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="w-4 h-4" />
              Trend Registrazioni
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={enrollmentTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                    }}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="enrolled"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    name="Registrati"
                  />
                  <Line
                    type="monotone"
                    dataKey="active"
                    stroke="#22c55e"
                    strokeWidth={2}
                    name="Attivi"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Compliance Chart */}
      <Card className="border-border">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="w-4 h-4" />
            Stato Compliance per Categoria
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={complianceData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <YAxis
                  type="category"
                  dataKey="category"
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={12}
                  width={100}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                  }}
                />
                <Legend />
                <Bar dataKey="compliant" fill="#22c55e" name="Conformi" stackId="a" />
                <Bar dataKey="nonCompliant" fill="#ef4444" name="Non Conformi" stackId="a" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Security Events */}
      <Card className="border-border">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            Eventi di Sicurezza Recenti
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {securityEvents.map((event, index) => (
              <div
                key={index}
                className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border"
              >
                <div className="flex items-center gap-4">
                  <span className="text-xs text-muted-foreground font-mono w-12">{event.time}</span>
                  <div>
                    <p className="text-sm font-medium">{event.event}</p>
                    <p className="text-xs text-muted-foreground">{event.device}</p>
                  </div>
                </div>
                {getSeverityBadge(event.severity)}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Tabs for Device Inventory, Policies, Apps */}
      <Tabs defaultValue="devices" className="space-y-4">
        <TabsList>
          <TabsTrigger value="devices">Dispositivi</TabsTrigger>
          <TabsTrigger value="policies">Policy di Sicurezza</TabsTrigger>
          <TabsTrigger value="apps">Gestione App</TabsTrigger>
        </TabsList>

        <TabsContent value="devices">
          <Card className="border-border">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Smartphone className="w-4 h-4" />
                Inventario Dispositivi
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Dispositivo</TableHead>
                    <TableHead>Utente</TableHead>
                    <TableHead>Modello</TableHead>
                    <TableHead>OS</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Batteria</TableHead>
                    <TableHead>Crittografia</TableHead>
                    <TableHead>Ultimo Contatto</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {deviceInventory.map((device) => (
                    <TableRow key={device.id}>
                      <TableCell className="font-medium">{device.deviceName}</TableCell>
                      <TableCell>{device.user}</TableCell>
                      <TableCell className="text-muted-foreground text-xs">{device.model}</TableCell>
                      <TableCell className="text-xs">{device.os}</TableCell>
                      <TableCell>{getStatusBadge(device.status)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Battery className={`w-4 h-4 ${device.battery > 50 ? 'text-green-500' : device.battery > 20 ? 'text-yellow-500' : 'text-red-500'}`} />
                          <span className="text-xs">{device.battery}%</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {device.encrypted ? (
                          <Lock className="w-4 h-4 text-green-500" />
                        ) : (
                          <XCircle className="w-4 h-4 text-red-500" />
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">{device.lastSeen}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="policies">
          <Card className="border-border">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Settings className="w-4 h-4" />
                Policy di Sicurezza Attive
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {securityPolicies.map((policy, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-4 rounded-lg bg-muted/30 border border-border"
                  >
                    <div className="flex items-center gap-4">
                      <Shield className="w-5 h-5 text-primary" />
                      <div>
                        <p className="font-medium">{policy.name}</p>
                        <p className="text-xs text-muted-foreground">
                          Applicata a {policy.devices} dispositivi
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="w-32">
                        <div className="flex justify-between text-xs mb-1">
                          <span>Compliance</span>
                          <span>{policy.compliance}%</span>
                        </div>
                        <Progress 
                          value={policy.compliance} 
                          className="h-2"
                          indicatorClassName={policy.compliance >= 90 ? 'bg-green-500' : policy.compliance >= 70 ? 'bg-yellow-500' : 'bg-red-500'}
                        />
                      </div>
                      {getStatusBadge(policy.status)}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="apps">
          <Card className="border-border">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <AppWindow className="w-4 h-4" />
                App Aziendali Gestite
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Applicazione</TableHead>
                    <TableHead>Categoria</TableHead>
                    <TableHead>Installazioni</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {appInventory.map((app, index) => (
                    <TableRow key={index}>
                      <TableCell className="font-medium">{app.name}</TableCell>
                      <TableCell className="text-muted-foreground">{app.category}</TableCell>
                      <TableCell>{app.installed}</TableCell>
                      <TableCell>{getStatusBadge(app.status)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};
