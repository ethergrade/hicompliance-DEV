import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Search, ExternalLink, Download } from 'lucide-react';
import type { ShodanAsset } from '@/hooks/useShodanScan';
import { cn } from '@/lib/utils';

interface Props {
  shodanAssets: ShodanAsset[];
}

interface Row {
  cve: string;
  asset: string;
  ip: string;
  ports: string;
  severity: 'high' | 'medium' | 'low';
  description: string;
  product?: string;
}

const sevColor = (s: string) =>
  s === 'high' ? 'bg-red-500/15 text-red-500 border-red-500/30'
  : s === 'medium' ? 'bg-orange-500/15 text-orange-500 border-orange-500/30'
  : 'bg-green-500/15 text-green-500 border-green-500/30';

const sevLabel = (s: string) => s === 'high' ? 'Critica' : s === 'medium' ? 'Media' : 'Bassa';

export const AllCvesTab: React.FC<Props> = ({ shodanAssets }) => {
  const [q, setQ] = useState('');
  const [sev, setSev] = useState<'all' | 'high' | 'medium' | 'low'>('all');

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    for (const a of shodanAssets) {
      const ports = (a.ports ?? []).join(', ');
      const product = (a.banners ?? []).map(b => [b.product, b.version].filter(Boolean).join(' ')).filter(Boolean).join(' · ');
      for (const c of (a.cves ?? [])) {
        out.push({
          cve: c.id,
          asset: a.hostname || a.ip,
          ip: a.ip,
          ports,
          severity: c.severity,
          description: c.description || '',
          product,
        });
      }
    }
    return out.sort((a, b) => {
      const order = { high: 0, medium: 1, low: 2 } as const;
      return order[a.severity] - order[b.severity] || a.cve.localeCompare(b.cve);
    });
  }, [shodanAssets]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return rows.filter(r => {
      if (sev !== 'all' && r.severity !== sev) return false;
      if (!term) return true;
      return r.cve.toLowerCase().includes(term)
        || r.asset.toLowerCase().includes(term)
        || r.ip.toLowerCase().includes(term)
        || r.ports.includes(term)
        || (r.product ?? '').toLowerCase().includes(term);
    });
  }, [rows, q, sev]);

  const counts = useMemo(() => ({
    total: rows.length,
    high: rows.filter(r => r.severity === 'high').length,
    medium: rows.filter(r => r.severity === 'medium').length,
    low: rows.filter(r => r.severity === 'low').length,
  }), [rows]);

  const exportCsv = () => {
    const header = ['CVE', 'Asset', 'IP', 'Porte', 'Severity', 'Prodotto', 'Descrizione'];
    const lines = [header.join(',')];
    for (const r of filtered) {
      const esc = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
      lines.push([r.cve, r.asset, r.ip, r.ports, sevLabel(r.severity), r.product ?? '', r.description].map(esc).join(','));
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `tutti-cve-${new Date().toISOString().slice(0,10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <CardTitle>Tutti i CVE rilevati</CardTitle>
            <CardDescription>
              Vista esplosa per asset · {counts.total} occorrenze totali ·
              <span className="text-red-500"> {counts.high} critiche</span> ·
              <span className="text-orange-500"> {counts.medium} medie</span> ·
              <span className="text-green-500"> {counts.low} basse</span>
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={!filtered.length}>
            <Download className="w-4 h-4 mr-2" /> Esporta CSV
          </Button>
        </div>
        <div className="flex gap-2 mt-4 flex-wrap">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Cerca CVE, asset, IP, porta, prodotto…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={sev} onValueChange={(v: any) => setSev(v)}>
            <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutte le severità</SelectItem>
              <SelectItem value="high">Solo critiche</SelectItem>
              <SelectItem value="medium">Solo medie</SelectItem>
              <SelectItem value="low">Solo basse</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        {filtered.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            {rows.length === 0
              ? 'Nessun CVE rilevato per gli asset monitorati. Esegui una scansione per popolare i dati.'
              : 'Nessun CVE corrisponde ai filtri.'}
          </div>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>CVE</TableHead>
                  <TableHead>Asset</TableHead>
                  <TableHead>IP</TableHead>
                  <TableHead>Porte</TableHead>
                  <TableHead>Prodotto</TableHead>
                  <TableHead>Severity</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.slice(0, 500).map((r, i) => (
                  <TableRow key={`${r.cve}-${r.ip}-${i}`}>
                    <TableCell className="font-mono text-sm">
                      <a
                        href={`https://nvd.nist.gov/vuln/detail/${r.cve}`}
                        target="_blank" rel="noopener noreferrer"
                        className="text-primary hover:underline inline-flex items-center gap-1"
                      >
                        {r.cve} <ExternalLink className="w-3 h-3" />
                      </a>
                    </TableCell>
                    <TableCell className="max-w-[220px] truncate" title={r.asset}>{r.asset}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{r.ip}</TableCell>
                    <TableCell className="font-mono text-xs max-w-[180px] truncate" title={r.ports}>{r.ports || '—'}</TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate" title={r.product}>{r.product || '—'}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn('font-medium', sevColor(r.severity))}>
                        {sevLabel(r.severity)}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {filtered.length > 500 && (
              <div className="text-center text-xs text-muted-foreground py-3 border-t">
                Visualizzati 500 di {filtered.length} · usa la ricerca o esporta in CSV
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
