import React, { useState, useMemo, useCallback, useEffect } from 'react';
import jsPDF from 'jspdf';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Server, Shield, Users, Activity, Search, RefreshCw,
  Filter, HardDrive, Monitor, Usb, Power, Eye, EyeOff, FileText
} from 'lucide-react';
import { toast } from 'sonner';
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
const HISO_LOGO_PATH = '/lovable-uploads/ebc3b9f3-fce3-4df9-a7f9-b0b576887830.png';

interface AdvisoryRunbook {
  id: string;
  title: string;
  summary: string;
  runbookTitle: string;
  runbookSteps: string[];
}

const DEFAULT_HILOG_FILTERS: HiLogFilters = {
  globalSearch: '',
  severity: 'all',
  hostname: '',
  username: '',
  ip: '',
  period: 'all',
};

const loadImageAsDataUrl = async (path: string): Promise<string | null> => {
  try {
    const response = await fetch(path);
    if (!response.ok) return null;
    const blob = await response.blob();

    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
};

const parseDateTime = (value: unknown): Date | null => {
  if (typeof value !== 'string') return null;
  const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}):(\d{2}))?$/);
  if (!match) return null;

  const [, dd, mm, yyyy, hh = '00', min = '00', ss = '00'] = match;
  const parsed = new Date(
    Number(yyyy),
    Number(mm) - 1,
    Number(dd),
    Number(hh),
    Number(min),
    Number(ss)
  );

  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
};

const getPeriodThreshold = (anchor: Date, period: HiLogFilters['period']): Date | null => {
  if (period === 'all') return null;
  const threshold = new Date(anchor);

  if (period === '7d') {
    threshold.setDate(threshold.getDate() - 7);
    return threshold;
  }
  if (period === '1m') {
    threshold.setMonth(threshold.getMonth() - 1);
    return threshold;
  }
  if (period === '3m') {
    threshold.setMonth(threshold.getMonth() - 3);
    return threshold;
  }
  if (period === '6m') {
    threshold.setMonth(threshold.getMonth() - 6);
    return threshold;
  }

  return null;
};

const loadPersistedState = () => {
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return {
        filters: { ...DEFAULT_HILOG_FILTERS, ...(parsed.filters || {}) },
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
    persisted?.filters || DEFAULT_HILOG_FILTERS
  );
  const [advancedFilter, setAdvancedFilter] = useState<AdvancedFilter>(
    persisted?.advancedFilter || createEmptyFilter()
  );
  const [advancedMode, setAdvancedMode] = useState(persisted?.advancedMode || false);
  const [expandedRunbooks, setExpandedRunbooks] = useState<Set<string>>(new Set());

  // Persist state on every change
  useEffect(() => {
    persistState(filters, advancedFilter, advancedMode);
  }, [filters, advancedFilter, advancedMode]);

  // Combined filter: basic + advanced
  const applyAllFilters = useCallback(<T extends Record<string, any>>(data: T[], extraFields?: { hostnameKey?: string; usernameKey?: string; ipKey?: string; severityKey?: string }): T[] => {
    let periodScopedData: T[] = data;

    if (filters.period !== 'all') {
      const datedItems = data
        .map((item) => ({ item, date: parseDateTime(item.datetime) }))
        .filter((entry): entry is { item: T; date: Date } => !!entry.date);

      if (datedItems.length > 0) {
        const anchorDate = datedItems.reduce((latest, entry) => (
          entry.date.getTime() > latest.getTime() ? entry.date : latest
        ), datedItems[0].date);

        const thresholdDate = getPeriodThreshold(anchorDate, filters.period);
        if (thresholdDate) {
          const thresholdTs = thresholdDate.getTime();
          periodScopedData = datedItems
            .filter((entry) => entry.date.getTime() >= thresholdTs)
            .map((entry) => entry.item);
        }
      }
    }

    if (advancedMode) {
      return evalAdvancedFilter(periodScopedData, advancedFilter);
    }
    return periodScopedData.filter(item => {
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

  const securityPrioritySummary = useMemo(() => {
    const severityTotals = securityEventsData.reduce(
      (acc, item) => {
        const key = item.name.toLowerCase();
        if (key in acc) acc[key as keyof typeof acc] += item.value;
        return acc;
      },
      { critical: 0, high: 0, medium: 0, low: 0 }
    );

    const categoryTotals = filteredSecurityEvents.reduce((acc: Record<string, number>, event) => {
      const category = event.category || 'Other';
      acc[category] = (acc[category] || 0) + 1;
      return acc;
    }, {});

    const topCategory = Object.entries(categoryTotals).sort((a, b) => (b[1] as number) - (a[1] as number))[0];
    const topCategoryLabel = topCategory ? `${topCategory[0]} (${topCategory[1]} eventi)` : 'Login';
    const urgentCount = severityTotals.critical + severityTotals.high;

    return {
      urgentCount,
      topCategoryLabel,
    };
  }, [filteredSecurityEvents]);

  const advisoryRunbooks = useMemo<AdvisoryRunbook[]>(() => ([
    {
      id: 'critical-triage',
      title: 'Gestire subito gli eventi critici e high',
      summary: `Sono presenti ${securityPrioritySummary.urgentCount} eventi ad alta urgenza (Critical/High) nelle ultime 24h. Si consiglia triage immediato, validazione IOC e chiusura degli alert con owner e scadenza.`,
      runbookTitle: 'Runbook operativo breve - Triage eventi Critical/High',
      runbookSteps: [
        'Filtrare subito gli eventi per severity Critical e High, assegnando owner e SLA (es. 30 min Critical, 2 ore High).',
        'Verificare IOC primari (IP sorgente, hash, utenza, host) e classificare ogni alert: true positive, benigno, da approfondire.',
        'Per eventi confermati: isolare host/utenza, bloccare indicatori su firewall/EDR e aprire ticket di incidente con evidenze.',
        'Chiudere solo con motivo documentato (causa, impatto, remediation, prevenzione) e aggiornare il registro incidenti.',
      ],
    },
    {
      id: 'top-category',
      title: "Mettere sotto controllo l'area piu esposta",
      summary: `La categoria con maggiore ricorrenza e ${securityPrioritySummary.topCategoryLabel}. E opportuno verificare pattern anomali, utenti coinvolti e host ripetuti.`,
      runbookTitle: 'Runbook operativo breve - Analisi area piu esposta',
      runbookSteps: [
        'Estrarre top 10 utenti e top 10 host coinvolti nella categoria dominante delle ultime 24/48h.',
        'Identificare sequenze ripetute (stesso utente-host-evento) e distinguere attivita attese da comportamenti anomali.',
        'Applicare regole di riduzione rumore (whitelist controllata, tuning query) senza perdere visibilita su pattern reali.',
        'Definire 2-3 controlli immediati di contenimento e pianificare revisione settimanale del trend.',
      ],
    },
    {
      id: 'identity-access',
      title: 'Rafforzare il perimetro identita e accessi',
      summary: 'Dare priorita a MFA, Conditional Access e blocco tentativi ripetuti su login remoti/RDP, con revisione degli account privilegiati.',
      runbookTitle: 'Runbook operativo breve - Hardening identita e accessi',
      runbookSteps: [
        'Verificare copertura MFA sugli account amministrativi e su tutti gli accessi remoti esposti.',
        'Abilitare o irrigidire Conditional Access su geolocalizzazioni, dispositivi non conformi e autenticazioni legacy.',
        'Impostare lockout progressivo e alert su tentativi ripetuti (brute force/spray) con automazione di risposta.',
        'Eseguire review account privilegiati: minimizzare privilegi, rimuovere utenze obsolete, abilitare audit continuo.',
      ],
    },
    {
      id: 'preventive-controls',
      title: 'Consolidare le misure preventive',
      summary: 'Pianificare hardening su endpoint critici (PowerShell, lateral movement, escalation) e verifica delle policy DLP per contenere rischio di esfiltrazione.',
      runbookTitle: 'Runbook operativo breve - Prevenzione endpoint e DLP',
      runbookSteps: [
        'Disabilitare o limitare script engine non necessari e applicare policy restrittive su PowerShell e macro.',
        'Verificare regole EDR su tecniche di lateral movement/escalation con test controllati in ambiente demo.',
        'Controllare policy DLP su canali sensibili (email, upload web, removable media) e validarne gli alert.',
        'Stabilire KPI minimi (tempo di rilevazione, tempo di contenimento, falsi positivi) e revisione quindicinale.',
      ],
    },
  ]), [securityPrioritySummary.urgentCount, securityPrioritySummary.topCategoryLabel]);

  const toggleRunbook = useCallback((id: string) => {
    setExpandedRunbooks((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const exportAdvisoryPdf = useCallback(async () => {
    try {
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 14;
      const usableWidth = pageWidth - margin * 2;
      const footerY = pageHeight - 7;
      const logoData = await loadImageAsDataUrl(HISO_LOGO_PATH);
      const generatedAt = new Date().toLocaleString('it-IT');
      let y = 24;

      const drawHeader = (withLogo = false) => {
        doc.setFillColor(10, 19, 40);
        doc.rect(0, 0, pageWidth, 18, 'F');
        let titleX = margin;

        if (withLogo && logoData) {
          doc.addImage(logoData, 'PNG', margin, 3, 11, 11);
          titleX += 14;
        }

        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.text('HiLog - Sintesi consulenziale prioritaria', titleX, 8.2);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(188, 200, 220);
        doc.text(`Remediation estese generate il ${generatedAt}`, titleX, 13.8);
      };

      const drawFooter = (pageNumber: number, totalPages: number) => {
        doc.setFillColor(10, 19, 40);
        doc.rect(0, pageHeight - 10, pageWidth, 10, 'F');
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(188, 200, 220);
        doc.text('HiSolution - Piano operativo remediation HiLog', margin, footerY);
        doc.text(`Pagina ${pageNumber}/${totalPages}`, pageWidth - margin - 20, footerY);
      };

      const ensureSpace = (needed: number) => {
        if (y + needed > pageHeight - 16) {
          doc.addPage();
          drawHeader(false);
          y = 24;
        }
      };

      drawHeader(true);

      advisoryRunbooks.forEach((item, index) => {
        ensureSpace(18);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.setTextColor(30, 41, 59);
        const headingLines = doc.splitTextToSize(item.title, usableWidth);
        doc.text(`${index + 1}. ${headingLines[0]}`, margin, y);
        y += 6;
        if (headingLines.length > 1) {
          const remainingHeading = headingLines.slice(1);
          remainingHeading.forEach((line) => {
            ensureSpace(5);
            doc.text(line, margin + 4, y);
            y += 4.6;
          });
        }

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9.2);
        doc.setTextColor(51, 65, 85);
        const summaryLines = doc.splitTextToSize(item.summary, usableWidth);
        summaryLines.forEach((line) => {
          ensureSpace(4.8);
          doc.text(line, margin, y);
          y += 4.5;
        });

        ensureSpace(8);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9.5);
        doc.setTextColor(15, 23, 42);
        doc.text(item.runbookTitle, margin, y + 1);
        y += 6;

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.8);
        item.runbookSteps.forEach((step) => {
          const stepLines = doc.splitTextToSize(step, usableWidth - 4);
          ensureSpace(stepLines.length * 4.5 + 2);
          doc.text(`- ${stepLines[0]}`, margin, y);
          y += 4.4;
          stepLines.slice(1).forEach((line) => {
            doc.text(line, margin + 4, y);
            y += 4.2;
          });
        });

        y += 3.5;
      });

      const totalPages = doc.getNumberOfPages();
      for (let i = 1; i <= totalPages; i += 1) {
        doc.setPage(i);
        drawFooter(i, totalPages);
      }

      doc.save(`hilog-remediation-runbook-${new Date().toISOString().slice(0, 10)}.pdf`);
      toast.success('PDF remediation esportato con successo');
    } catch (error) {
      console.error('Errore export remediation HiLog', error);
      toast.error("Errore durante l'export PDF delle remediation");
    }
  }, [advisoryRunbooks]);

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

        <Card className="border-border">
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle className="text-base">Sintesi consulenziale prioritaria</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  Azioni consigliate in ordine di priorita operativa per ridurre il rischio nelle prossime 24-48 ore.
                </p>
              </div>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={exportAdvisoryPdf}>
                <FileText className="w-4 h-4" />
                Esporta PDF remediation
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <ol className="space-y-3 text-sm">
              {advisoryRunbooks.map((advisory, index) => {
                const isExpanded = expandedRunbooks.has(advisory.id);
                return (
                  <li key={advisory.id} className="rounded-lg border border-border/70 bg-muted/20 px-3 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <p className="leading-6">
                        <span className="font-semibold">{index + 1}. {advisory.title}:</span>{' '}
                        {advisory.summary}
                      </p>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0"
                        onClick={() => toggleRunbook(advisory.id)}
                        aria-label={isExpanded ? 'Nascondi runbook tecnico' : 'Mostra runbook tecnico'}
                        title={isExpanded ? 'Nascondi runbook tecnico' : 'Mostra runbook tecnico'}
                      >
                        {isExpanded ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </Button>
                    </div>

                    {isExpanded && (
                      <div className="mt-3 rounded-md border border-border/70 bg-background/50 p-3">
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          {advisory.runbookTitle}
                        </p>
                        <ul className="space-y-1.5 text-sm">
                          {advisory.runbookSteps.map((step, stepIndex) => (
                            <li key={`${advisory.id}-step-${stepIndex}`} className="leading-6">
                              - {step}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
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
