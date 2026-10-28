import React, { useState, useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, Download, ExternalLink, Info, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { HipatchCveAsset } from '@/lib/api/hipatch';
import { nvdLink } from '@/lib/findingTaxonomy';
import { severityColors } from './vulnerabilitySeverity';
import { CveDetailDialog } from '@/components/surface-scan/CveDetailDialog';
import { assetOs, OS_NON_RILEVATO, OS_NON_RILEVATO_HINT } from '@/lib/hipatch/assetOs';
import { DEFAULT_CVE_FILTERS, filterCves, hasActiveCveFilters, type CveFilters } from '@/lib/hipatch/hipatchFilters';
import { exportCvesXlsx, type ExportCve } from '@/lib/hipatch/exportHipatchXlsx';

type Vulnerability = ExportCve;

interface VulnerabilitiesTableProps {
  vulnerabilities: Vulnerability[];
  pageSize?: number;
  /** Data del run, per il nome del file esportato. */
  runDate?: string | null;
}

/**
 * Apre la scheda pubblica della CVE. Solo per identificativi CVE veri: il
 * campo può contenere anche nomi di problemi senza CVE. L'etichetta non nomina
 * la sorgente.
 */
const isCveId = (id: string) => /^CVE-\d{4}-\d+$/i.test(id);

/**
 * L'identificativo della CVE: se è una CVE vera apre il dettaglio completo
 * (descrizione ufficiale, CVSS, EPSS, KEV, riferimenti), altrimenti è testo.
 */
export const CveIdButton: React.FC<{ id: string; onOpen: (id: string) => void }> = ({ id, onOpen }) =>
  isCveId(id) ? (
    <button
      type="button"
      className="text-left hover:text-primary hover:underline"
      title="Dettaglio della CVE"
      onClick={() => onOpen(id.toUpperCase())}
    >
      {id}
    </button>
  ) : (
    <>{id}</>
  );

export const CveLink: React.FC<{ id: string }> = ({ id }) =>
  isCveId(id) ? (
    <a
      href={nvdLink(id.toUpperCase())}
      target="_blank"
      rel="noopener noreferrer"
      title="Apri la scheda della CVE"
      aria-label={`Scheda CVE ${id}`}
      className="text-muted-foreground hover:text-primary shrink-0"
      onClick={(e) => e.stopPropagation()}
    >
      <ExternalLink className="w-4 h-4" />
    </a>
  ) : null;



const AssetsModal: React.FC<{ assets: HipatchCveAsset[]; title: string; open: boolean; onClose: () => void; onExport: () => void }> = ({ assets, title, open, onClose, onExport }) => (
  <Dialog open={open} onOpenChange={onClose}>
    <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
      <DialogHeader className="flex-row items-center justify-between gap-3 space-y-0 pr-8">
        <DialogTitle>Asset coinvolti — {title}</DialogTitle>
        <Button variant="outline" size="sm" className="gap-2 shrink-0" onClick={onExport}>
          <Download className="h-4 w-4" /> Esporta
        </Button>
      </DialogHeader>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>IP</TableHead>
            <TableHead>MAC</TableHead>
            <TableHead>OS</TableHead>
            <TableHead>Last ping</TableHead>
            <TableHead>Last discovered</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {assets.map((a, i) => (
            <TableRow key={i}>
              <TableCell>
                <div className="font-medium">{a['data.name'] ?? '-'}</div>
                {a['data.host_name'] && a['data.host_name'] !== a['data.name'] && (
                  <div className="text-xs text-muted-foreground">{a['data.host_name']}</div>
                )}
              </TableCell>
              <TableCell>{a['data.asset_type'] === 'other_asset' ? 'non riconosciuto' : a['data.asset_type'] || '-'}</TableCell>
              <TableCell>{a['data.ip'] ?? '-'}</TableCell>
              <TableCell>{a['data.mac'] ?? '-'}</TableCell>
              <TableCell>{assetOs(a) ?? <span className="text-muted-foreground" title={OS_NON_RILEVATO_HINT}>{OS_NON_RILEVATO}</span>}</TableCell>
              <TableCell>{a['data.last_ping_time'] ?? '-'}</TableCell>
              <TableCell>{a['data.last_discovered_time'] ?? '-'}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </DialogContent>
  </Dialog>
);

export const VulnerabilitiesTable: React.FC<VulnerabilitiesTableProps> = ({
  vulnerabilities,
  pageSize = 10,
  runDate,
}) => {
  const [page, setPage] = useState(0);
  const [modalVuln, setModalVuln] = useState<Vulnerability | null>(null);
  const [detailCve, setDetailCve] = useState<string | null>(null);
  const [filters, setFilters] = useState<CveFilters>(DEFAULT_CVE_FILTERS);

  // Build unique asset list from all CVEs that have assets
  const assetOptions = useMemo(() => {
    const map = new Map<string, string>();
    vulnerabilities.forEach(v =>
      (v.assets ?? []).forEach(a => {
        const id = a['data.id'];
        const name = a['data.name'] || a['data.ip'] || id;
        if (id && !map.has(id)) map.set(id, name);
      })
    );
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [vulnerabilities]);

  const filtered = useMemo(() => filterCves(vulnerabilities, filters), [vulnerabilities, filters]);
  const filtering = hasActiveCveFilters(filters);
  const affectedAssets = useMemo(
    () => new Set(filtered.flatMap(v => (v.assets ?? []).map(a => a['data.id']))).size,
    [filtered],
  );

  const totalPages = Math.ceil(filtered.length / pageSize);
  const slice = filtered.slice(page * pageSize, (page + 1) * pageSize);

  const set = (patch: Partial<CveFilters>) => {
    setFilters(f => ({ ...f, ...patch }));
    setPage(0);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={filters.query}
            onChange={(e) => set({ query: e.target.value })}
            placeholder="Cerca CVE, descrizione, asset o IP…"
            className="h-8 pl-8 text-sm"
          />
        </div>
        <Select value={filters.severity} onValueChange={(v) => set({ severity: v as CveFilters['severity'] })}>
          <SelectTrigger className="w-36 h-8 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutte le severity</SelectItem>
            <SelectItem value="Critical">Critical</SelectItem>
            <SelectItem value="High">High</SelectItem>
            <SelectItem value="Medium">Medium</SelectItem>
            <SelectItem value="Low">Low</SelectItem>
          </SelectContent>
        </Select>
        {assetOptions.length > 0 && (
          <Select value={filters.asset} onValueChange={(v) => set({ asset: v })}>
            <SelectTrigger className="w-56 h-8 text-sm"><SelectValue placeholder="Tutti gli asset" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutti gli asset</SelectItem>
              {assetOptions.map(([id, name]) => (
                <SelectItem key={id} value={id}>{name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Select value={filters.sort} onValueChange={(v) => set({ sort: v as CveFilters['sort'] })}>
          <SelectTrigger className="w-52 h-8 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="severity">Ordina per severity</SelectItem>
            <SelectItem value="assets">Ordina per asset coinvolti</SelectItem>
            <SelectItem value="epss">Ordina per EPSS</SelectItem>
          </SelectContent>
        </Select>
        {filtering && (
          <Button variant="ghost" size="sm" className="h-8" onClick={() => set({ query: '', severity: 'all', asset: 'all' })}>
            Azzera filtri
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-2 sm:ml-auto"
          disabled={filtered.length === 0}
          title="Le CVE che vedi, con un foglio CVE per asset da filtrare in Excel"
          onClick={() => exportCvesXlsx(filtered, { runDate, filtered: filtering })}
        >
          <Download className="h-4 w-4" /> Esporta Excel
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        {filtering ? `${filtered.length} di ${vulnerabilities.length} CVE` : `${filtered.length} CVE`}
        {affectedAssets > 0 && ` · ${affectedAssets} asset coinvolti`}
      </p>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[50%]">Title</TableHead>
            <TableHead>EPSS Score</TableHead>
            <TableHead>Severity</TableHead>
            <TableHead>Assets</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.length === 0 && (
            <TableRow>
              <TableCell colSpan={4} className="text-center text-sm text-muted-foreground py-6">
                Nessuna CVE corrisponde ai filtri.
              </TableCell>
            </TableRow>
          )}
          {slice.map((vuln) => (
            <TableRow key={vuln.id}>
              <TableCell className="font-medium">
                <div className="flex items-center gap-2">
                  <CveIdButton id={vuln.id} onOpen={setDetailCve} />
                  <CveLink id={vuln.id} />
                  {vuln.description && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="w-4 h-4 text-muted-foreground cursor-help shrink-0" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <p>{vuln.description}</p>
                      </TooltipContent>
                    </Tooltip>
                  )}
                </div>
              </TableCell>
              <TableCell>{Number(vuln.score).toFixed(4)}</TableCell>
              <TableCell>
                <Badge className={cn("font-medium", severityColors[vuln.severity])}>
                  {vuln.severity}
                </Badge>
              </TableCell>
              <TableCell>
                {vuln.assets && vuln.assets.length > 0 ? (
                  <Button variant="outline" size="sm" onClick={() => setModalVuln(vuln)}>
                    {vuln.assets.length} asset
                  </Button>
                ) : (
                  <span className="text-muted-foreground">-</span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{page * pageSize + 1}–{Math.min((page + 1) * pageSize, filtered.length)} di {filtered.length}</span>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setPage(p => p - 1)} disabled={page === 0}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="px-2">{page + 1} / {totalPages}</span>
            <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setPage(p => p + 1)} disabled={page === totalPages - 1}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {modalVuln && (
        <AssetsModal
          open={!!modalVuln}
          assets={modalVuln.assets ?? []}
          title={modalVuln.id}
          onClose={() => setModalVuln(null)}
          onExport={() => exportCvesXlsx([modalVuln], { runDate, filtered: false, name: `hipatch-${modalVuln.id.toLowerCase()}-asset.xlsx` })}
        />
      )}
      <CveDetailDialog cveId={detailCve} open={!!detailCve} onOpenChange={(open) => !open && setDetailCve(null)} />
    </div>
  );
};
