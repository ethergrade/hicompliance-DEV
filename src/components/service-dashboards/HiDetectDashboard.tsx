import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { RiskScoreCard } from './RiskScoreCard';
import { DemoDataBadge } from './DemoDataBadge';
import { useDetectDashboard } from '@/hooks/useDetect';
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

// Data provided by useDetectDashboard hook with mock fallback

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
          <DemoDataBadge show={isMock} />
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
