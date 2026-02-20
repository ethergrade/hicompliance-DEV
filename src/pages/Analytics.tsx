import React, { useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis
} from 'recharts';
import {
  TrendingUp,
  TrendingDown,
  BarChart3,
  Shield,
  AlertTriangle,
  CheckCircle2,
  Download
} from 'lucide-react';

// ── Time range — identical to RiskScoreMetricCard ─────────────────────────────
type TimeRange = '1d' | '7d' | '1m' | '3m' | '6m' | '1y';
const TIME_OPTIONS: TimeRange[] = ['1d', '7d', '1m', '3m', '6m', '1y'];
const RANGE_LABEL: Record<TimeRange, string> = {
  '1d': 'Ultimo giorno',
  '7d': 'Ultimi 7 giorni',
  '1m': 'Ultimo mese',
  '3m': 'Ultimi 3 mesi',
  '6m': 'Ultimi 6 mesi',
  '1y': 'Ultimo anno',
};

// ── KPI — riskScore aligned with RiskScoreMetricCard DATA percentages ─────────
const KPI_DATA: Record<TimeRange, {
  riskScore: number;
  compliance: number;
  threats: number;
  resolved: number;
  riskTrend: 'up' | 'down';
  threatsTrend: 'up' | 'down';
}> = {
  '1d': { riskScore: 74, compliance: 78, threats:  85, resolved:  72, riskTrend: 'up',   threatsTrend: 'up'   },
  '7d': { riskScore: 68, compliance: 75, threats: 110, resolved:  90, riskTrend: 'up',   threatsTrend: 'up'   },
  '1m': { riskScore: 61, compliance: 60, threats: 135, resolved:  86, riskTrend: 'down', threatsTrend: 'down' },
  '3m': { riskScore: 55, compliance: 58, threats: 155, resolved:  78, riskTrend: 'down', threatsTrend: 'down' },
  '6m': { riskScore: 47, compliance: 62, threats: 120, resolved:  94, riskTrend: 'down', threatsTrend: 'down' },
  '1y': { riskScore: 35, compliance: 45, threats: 280, resolved:  45, riskTrend: 'down', threatsTrend: 'up'   },
};

// ── Risk trend chart — "overall" end-point equals riskScore ──────────────────
const RISK_TREND_DATA: Record<TimeRange, { month: string; critical: number; high: number; medium: number; low: number; overall: number }[]> = {
  '1d': [
    { month: '00:00', critical: 12, high: 28, medium: 40, low: 18, overall: 82 },
    { month: '06:00', critical: 13, high: 30, medium: 38, low: 17, overall: 78 },
    { month: '12:00', critical: 14, high: 32, medium: 36, low: 16, overall: 76 },
    { month: '18:00', critical: 15, high: 33, medium: 35, low: 15, overall: 74 },
  ],
  '7d': [
    { month: 'Lun', critical: 10, high: 25, medium: 42, low: 20, overall: 85 },
    { month: 'Mar', critical: 11, high: 26, medium: 43, low: 19, overall: 82 },
    { month: 'Mer', critical: 12, high: 27, medium: 42, low: 18, overall: 80 },
    { month: 'Gio', critical: 13, high: 28, medium: 41, low: 17, overall: 78 },
    { month: 'Ven', critical: 13, high: 29, medium: 40, low: 16, overall: 74 },
    { month: 'Sab', critical: 14, high: 30, medium: 38, low: 15, overall: 71 },
    { month: 'Dom', critical: 14, high: 30, medium: 38, low: 14, overall: 68 },
  ],
  '1m': [
    { month: 'Sett 1', critical: 10, high: 26, medium: 47, low: 30, overall: 75 },
    { month: 'Sett 2', critical:  9, high: 25, medium: 47, low: 31, overall: 70 },
    { month: 'Sett 3', critical:  8, high: 24, medium: 48, low: 32, overall: 65 },
    { month: 'Sett 4', critical:  8, high: 24, medium: 48, low: 32, overall: 61 },
  ],
  '3m': [
    { month: 'Ott', critical: 15, high: 32, medium: 45, low: 25, overall: 75 },
    { month: 'Nov', critical: 12, high: 28, medium: 46, low: 28, overall: 70 },
    { month: 'Dic', critical: 10, high: 26, medium: 47, low: 30, overall: 62 },
    { month: 'Gen', critical:  8, high: 24, medium: 48, low: 32, overall: 55 },
  ],
  '6m': [
    { month: 'Ago', critical: 18, high: 35, medium: 42, low: 22, overall: 75 },
    { month: 'Set', critical: 15, high: 32, medium: 45, low: 25, overall: 65 },
    { month: 'Ott', critical: 12, high: 28, medium: 46, low: 28, overall: 58 },
    { month: 'Nov', critical: 10, high: 26, medium: 47, low: 30, overall: 53 },
    { month: 'Dic', critical:  8, high: 24, medium: 48, low: 32, overall: 50 },
    { month: 'Gen', critical:  8, high: 24, medium: 48, low: 32, overall: 47 },
  ],
  '1y': [
    { month: 'Gen 2024', critical: 25, high: 45, medium: 35, low: 15, overall: 72 },
    { month: 'Mar 2024', critical: 22, high: 42, medium: 38, low: 18, overall: 65 },
    { month: 'Mag 2024', critical: 20, high: 38, medium: 42, low: 20, overall: 58 },
    { month: 'Lug 2024', critical: 18, high: 35, medium: 45, low: 22, overall: 52 },
    { month: 'Set 2024', critical: 15, high: 32, medium: 48, low: 25, overall: 46 },
    { month: 'Nov 2024', critical: 12, high: 28, medium: 45, low: 28, overall: 40 },
    { month: 'Gen 2025', critical:  8, high: 24, medium: 48, low: 32, overall: 35 },
  ],
};

// ── Assessment radar ──────────────────────────────────────────────────────────
const BASE_CATEGORIES = [
  'Business Continuity', 'Certificazioni', 'Crittografia', 'Gestione Identità',
  'Gest. Incidenti', 'Gest. Rischio', 'Gest. Risorse', 'Gest. Fornitori',
  'Governance', 'HR e Formazione', 'Igiene Informatica', 'Manutenzione',
  'Network Security', 'Sviluppo Software',
];
const COMPLIANCE_BY_RANGE: Record<TimeRange, number[]> = {
  '1d': [78, 88, 65, 28, 82, 70, 60, 35, 90, 75, 68, 40, 86, 45],
  '7d': [75, 86, 62, 27, 80, 68, 58, 33, 88, 73, 65, 38, 84, 43],
  '1m': [72, 85, 60, 25, 78, 65, 55, 30, 88, 70, 62, 35, 82, 40],
  '3m': [65, 80, 55, 23, 72, 60, 50, 28, 83, 65, 58, 33, 75, 38],
  '6m': [55, 70, 45, 20, 65, 50, 40, 25, 75, 55, 48, 30, 65, 35],
  '1y': [35, 45, 25, 10, 40, 30, 25, 15, 50, 35, 28, 20, 45, 20],
};
const getAssessmentData = (range: TimeRange) =>
  BASE_CATEGORIES.map((category, i) => ({
    category,
    compliance: COMPLIANCE_BY_RANGE[range][i],
    target: Math.min(COMPLIANCE_BY_RANGE[range][i] + 15, 100),
  }));

// ── Severity distribution ─────────────────────────────────────────────────────
const SEVERITY_DATA: Record<TimeRange, { name: string; value: number; color: string }[]> = {
  '1d': [
    { name: 'Critiche', value: 20, color: '#DC2626' },
    { name: 'Elevate',  value: 35, color: '#EA580C' },
    { name: 'Medie',    value: 30, color: '#EAB308' },
    { name: 'Basse',    value: 15, color: '#16A34A' },
  ],
  '7d': [
    { name: 'Critiche', value: 22, color: '#DC2626' },
    { name: 'Elevate',  value: 36, color: '#EA580C' },
    { name: 'Medie',    value: 28, color: '#EAB308' },
    { name: 'Basse',    value: 20, color: '#16A34A' },
  ],
  '1m': [
    { name: 'Critiche', value: 18, color: '#DC2626' },
    { name: 'Elevate',  value: 32, color: '#EA580C' },
    { name: 'Medie',    value: 40, color: '#EAB308' },
    { name: 'Basse',    value: 32, color: '#16A34A' },
  ],
  '3m': [
    { name: 'Critiche', value: 22, color: '#DC2626' },
    { name: 'Elevate',  value: 35, color: '#EA580C' },
    { name: 'Medie',    value: 38, color: '#EAB308' },
    { name: 'Basse',    value: 30, color: '#16A34A' },
  ],
  '6m': [
    { name: 'Critiche', value: 15, color: '#DC2626' },
    { name: 'Elevate',  value: 28, color: '#EA580C' },
    { name: 'Medie',    value: 42, color: '#EAB308' },
    { name: 'Basse',    value: 35, color: '#16A34A' },
  ],
  '1y': [
    { name: 'Critiche', value: 35, color: '#DC2626' },
    { name: 'Elevate',  value: 45, color: '#EA580C' },
    { name: 'Medie',    value: 28, color: '#EAB308' },
    { name: 'Basse',    value: 22, color: '#16A34A' },
  ],
};

// ── Threats by source ─────────────────────────────────────────────────────────
const THREATS_DATA: Record<TimeRange, { week: string; surfaceScan: number; darkRisk: number; hiFirewall: number; hiEndpoint: number; hiMail: number }[]> = {
  '1d': [
    { week: '00:00', surfaceScan:  8, darkRisk:  6, hiFirewall:  9, hiEndpoint: 5, hiMail: 4 },
    { week: '06:00', surfaceScan: 10, darkRisk:  8, hiFirewall: 11, hiEndpoint: 6, hiMail: 5 },
    { week: '12:00', surfaceScan: 12, darkRisk:  9, hiFirewall: 13, hiEndpoint: 7, hiMail: 6 },
    { week: '18:00', surfaceScan: 14, darkRisk: 11, hiFirewall: 14, hiEndpoint: 8, hiMail: 6 },
  ],
  '7d': [
    { week: 'Lun', surfaceScan: 10, darkRisk:  8, hiFirewall: 11, hiEndpoint: 6, hiMail: 5 },
    { week: 'Mar', surfaceScan: 12, darkRisk:  9, hiFirewall: 13, hiEndpoint: 7, hiMail: 6 },
    { week: 'Mer', surfaceScan: 14, darkRisk: 11, hiFirewall: 14, hiEndpoint: 8, hiMail: 6 },
    { week: 'Gio', surfaceScan: 16, darkRisk: 12, hiFirewall: 16, hiEndpoint: 9, hiMail: 7 },
    { week: 'Ven', surfaceScan: 18, darkRisk: 14, hiFirewall: 17, hiEndpoint:10, hiMail: 7 },
    { week: 'Sab', surfaceScan: 14, darkRisk: 12, hiFirewall: 15, hiEndpoint: 8, hiMail: 6 },
    { week: 'Dom', surfaceScan: 12, darkRisk: 10, hiFirewall: 13, hiEndpoint: 7, hiMail: 6 },
  ],
  '1m': [
    { week: 'Sett 1', surfaceScan: 18, darkRisk: 14, hiFirewall: 16, hiEndpoint: 10, hiMail: 7 },
    { week: 'Sett 2', surfaceScan: 16, darkRisk: 13, hiFirewall: 15, hiEndpoint:  9, hiMail: 7 },
    { week: 'Sett 3', surfaceScan: 15, darkRisk: 12, hiFirewall: 14, hiEndpoint:  8, hiMail: 6 },
    { week: 'Sett 4', surfaceScan: 14, darkRisk: 12, hiFirewall: 14, hiEndpoint:  8, hiMail: 6 },
  ],
  '3m': [
    { week: 'Ott', surfaceScan: 25, darkRisk: 20, hiFirewall: 22, hiEndpoint: 14, hiMail: 10 },
    { week: 'Nov', surfaceScan: 20, darkRisk: 16, hiFirewall: 18, hiEndpoint: 12, hiMail:  8 },
    { week: 'Dic', surfaceScan: 18, darkRisk: 14, hiFirewall: 16, hiEndpoint: 10, hiMail:  7 },
    { week: 'Gen', surfaceScan: 14, darkRisk: 12, hiFirewall: 14, hiEndpoint:  8, hiMail:  6 },
  ],
  '6m': [
    { week: 'Ago', surfaceScan: 35, darkRisk: 28, hiFirewall: 30, hiEndpoint: 18, hiMail: 14 },
    { week: 'Set', surfaceScan: 28, darkRisk: 22, hiFirewall: 25, hiEndpoint: 15, hiMail: 12 },
    { week: 'Ott', surfaceScan: 22, darkRisk: 18, hiFirewall: 20, hiEndpoint: 12, hiMail:  9 },
    { week: 'Nov', surfaceScan: 18, darkRisk: 15, hiFirewall: 16, hiEndpoint: 10, hiMail:  8 },
    { week: 'Dic', surfaceScan: 16, darkRisk: 12, hiFirewall: 14, hiEndpoint:  9, hiMail:  7 },
    { week: 'Gen', surfaceScan: 14, darkRisk: 12, hiFirewall: 14, hiEndpoint:  8, hiMail:  6 },
  ],
  '1y': [
    { week: 'Gen 2024', surfaceScan: 45, darkRisk: 35, hiFirewall: 40, hiEndpoint: 25, hiMail: 20 },
    { week: 'Mar 2024', surfaceScan: 42, darkRisk: 32, hiFirewall: 38, hiEndpoint: 22, hiMail: 18 },
    { week: 'Mag 2024', surfaceScan: 38, darkRisk: 28, hiFirewall: 35, hiEndpoint: 20, hiMail: 16 },
    { week: 'Lug 2024', surfaceScan: 35, darkRisk: 25, hiFirewall: 30, hiEndpoint: 18, hiMail: 14 },
    { week: 'Set 2024', surfaceScan: 28, darkRisk: 22, hiFirewall: 25, hiEndpoint: 15, hiMail: 12 },
    { week: 'Nov 2024', surfaceScan: 22, darkRisk: 18, hiFirewall: 20, hiEndpoint: 12, hiMail:  9 },
    { week: 'Gen 2025', surfaceScan: 14, darkRisk: 12, hiFirewall: 16, hiEndpoint:  8, hiMail:  6 },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────

const Analytics: React.FC = () => {
  const [timeRange, setTimeRange] = useState<TimeRange>('6m');
  const [chartsTimeRange, setChartsTimeRange] = useState<TimeRange>('6m');

  const currentData = KPI_DATA[timeRange];
  const riskTrendData = RISK_TREND_DATA[timeRange];
  const assessmentComplianceData = getAssessmentData(chartsTimeRange);
  const threatsTimeData = THREATS_DATA[timeRange];
  const severityDistribution = SEVERITY_DATA[chartsTimeRange];

  const exportReport = () => console.log('Exporting analytics report...');

  const tooltipStyle = {
    contentStyle: {
      backgroundColor: '#1F2937',
      border: '1px solid #374151',
      color: '#F9FAFB',
      borderRadius: '6px',
    },
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">

        {/* ── Header ── */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Analisi & Trend</h1>
            <p className="text-muted-foreground">
              Monitoraggio dei trend di rischio, conformità NIS2 e minacce nel tempo
            </p>
          </div>
          <div className="flex items-center gap-3 flex-wrap justify-end">
            {/* Pill selector — identical style to RiskScoreMetricCard */}
            <div className="flex items-center gap-1 flex-wrap">
              {TIME_OPTIONS.map((opt) => (
                <button
                  key={opt}
                  onClick={() => setTimeRange(opt)}
                  className={`px-2.5 py-0.5 rounded-full text-xs font-semibold transition-all duration-200 ${
                    timeRange === opt
                      ? 'bg-primary text-primary-foreground'
                      : 'border border-border text-muted-foreground hover:bg-muted/50'
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
            <Button onClick={exportReport} className="bg-primary text-primary-foreground">
              <Download className="w-4 h-4 mr-2" />
              Esporta Report
            </Button>
          </div>
        </div>

        {/* ── KPI Cards ── */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <Card className="border-border bg-card">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Score Rischio</p>
                  <p className="text-2xl font-bold text-foreground">{currentData.riskScore}</p>
                  <div className="flex items-center mt-1">
                    {currentData.riskTrend === 'up'
                      ? <TrendingUp className="w-4 h-4 text-red-500 mr-1" />
                      : <TrendingDown className="w-4 h-4 text-green-500 mr-1" />}
                    <span className={`text-sm ${currentData.riskTrend === 'up' ? 'text-red-500' : 'text-green-500'}`}>
                      {currentData.riskTrend === 'up' ? '+' : '-'}
                      {RANGE_LABEL[timeRange]}
                    </span>
                  </div>
                </div>
                <BarChart3 className="w-8 h-8 text-primary" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-border bg-card">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Conformità Assessment Media</p>
                  <p className="text-2xl font-bold text-foreground">
                    {Math.round(assessmentComplianceData.reduce((acc, cat) => acc + cat.compliance, 0) / assessmentComplianceData.length)}%
                  </p>
                  <Badge variant="secondary" className="mt-1">
                    Target: {Math.round(assessmentComplianceData.reduce((acc, cat) => acc + cat.target, 0) / assessmentComplianceData.length)}%
                  </Badge>
                </div>
                <Shield className="w-8 h-8 text-blue-500" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-border bg-card">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Minacce Totali</p>
                  <p className="text-2xl font-bold text-foreground">{currentData.threats}</p>
                  <div className="flex items-center mt-1">
                    {currentData.threatsTrend === 'up'
                      ? <TrendingUp className="w-4 h-4 text-red-500 mr-1" />
                      : <TrendingDown className="w-4 h-4 text-green-500 mr-1" />}
                    <span className={`text-sm ${currentData.threatsTrend === 'up' ? 'text-red-500' : 'text-green-500'}`}>
                      {currentData.threatsTrend === 'up' ? '+25%' : '-35%'} vs periodo prec.
                    </span>
                  </div>
                </div>
                <AlertTriangle className="w-8 h-8 text-orange-500" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-border bg-card">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Minacce Risolte</p>
                  <p className="text-2xl font-bold text-foreground">{currentData.resolved}</p>
                  <Badge variant="default" className="mt-1 bg-green-600">
                    {Math.round((currentData.resolved / currentData.threats) * 100)}% Risolte
                  </Badge>
                </div>
                <CheckCircle2 className="w-8 h-8 text-green-500" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ── Trend di Rischio nel Tempo ── */}
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-foreground">
              Trend di Rischio nel Tempo
              <span className="text-sm text-muted-foreground ml-2">({RANGE_LABEL[timeRange]})</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={riskTrendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="month" stroke="#9CA3AF" />
                  <YAxis stroke="#9CA3AF" />
                  <Tooltip {...tooltipStyle} />
                  <Legend />
                  <Area type="monotone" dataKey="critical" stackId="1" stroke="#DC2626" fill="#DC2626" name="Critiche" />
                  <Area type="monotone" dataKey="high"     stackId="1" stroke="#EA580C" fill="#EA580C" name="Elevate" />
                  <Area type="monotone" dataKey="medium"   stackId="1" stroke="#EAB308" fill="#EAB308" name="Medie" />
                  <Area type="monotone" dataKey="low"      stackId="1" stroke="#16A34A" fill="#16A34A" name="Basse" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* ── Minacce per Sorgente ── */}
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-foreground">
              Minacce per Sorgente nel Tempo
              <span className="text-sm text-muted-foreground ml-2">({RANGE_LABEL[timeRange]})</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={threatsTimeData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="week" stroke="#9CA3AF" />
                  <YAxis stroke="#9CA3AF" />
                  <Tooltip {...tooltipStyle} />
                  <Legend />
                  <Line type="monotone" dataKey="surfaceScan" stroke="#8B5CF6" strokeWidth={2} name="SurfaceScan" />
                  <Line type="monotone" dataKey="darkRisk"    stroke="#EF4444" strokeWidth={2} name="DarkRisk" />
                  <Line type="monotone" dataKey="hiFirewall"  stroke="#3B82F6" strokeWidth={2} name="HiFirewall" />
                  <Line type="monotone" dataKey="hiEndpoint"  stroke="#10B981" strokeWidth={2} name="HiEndpoint" />
                  <Line type="monotone" dataKey="hiMail"      stroke="#F59E0B" strokeWidth={2} name="HiMail" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* ── Assessment & Distribuzione Severità ── */}
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-foreground">Analisi Assessment e Minacce</h2>
          {/* Pill selector for radar/pie charts */}
          <div className="flex items-center gap-1 flex-wrap">
            {TIME_OPTIONS.map((opt) => (
              <button
                key={opt}
                onClick={() => setChartsTimeRange(opt)}
                className={`px-2.5 py-0.5 rounded-full text-xs font-semibold transition-all duration-200 ${
                  chartsTimeRange === opt
                    ? 'bg-primary text-primary-foreground'
                    : 'border border-border text-muted-foreground hover:bg-muted/50'
                }`}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Conformità Assessment */}
          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="text-foreground">
                Assessment NIS2/NIST/ISO — 14 Categorie
                <span className="text-sm text-muted-foreground ml-2">({RANGE_LABEL[chartsTimeRange]})</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-96">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={assessmentComplianceData} margin={{ top: 40, right: 40, bottom: 40, left: 40 }}>
                    <PolarGrid stroke="#374151" />
                    <PolarAngleAxis
                      dataKey="category"
                      tick={{ fontSize: 9, fill: '#9CA3AF' }}
                      tickFormatter={(v) => v.length > 12 ? v.substring(0, 10) + '…' : v}
                    />
                    <PolarRadiusAxis angle={0} domain={[0, 100]} tick={{ fontSize: 10, fill: '#9CA3AF' }} tickCount={5} />
                    <Tooltip {...tooltipStyle} />
                    <Radar name="Conformità Attuale" dataKey="compliance" stroke="#3B82F6" fill="#3B82F6" fillOpacity={0.3} strokeWidth={2} />
                    <Radar name="Target"              dataKey="target"     stroke="#10B981" fill="transparent"  strokeWidth={2} strokeDasharray="5 5" />
                    <Legend />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Distribuzione Severità */}
          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="text-foreground">
                Distribuzione Severità Minacce
                <span className="text-sm text-muted-foreground ml-2">({RANGE_LABEL[chartsTimeRange]})</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={severityDistribution}
                      cx="50%"
                      cy="50%"
                      outerRadius={100}
                      dataKey="value"
                      label={({ name, value }) => `${name}: ${value}`}
                    >
                      {severityDistribution.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip {...tooltipStyle} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>

      </div>
    </DashboardLayout>
  );
};

export default Analytics;
