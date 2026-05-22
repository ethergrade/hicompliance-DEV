import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ExternalLink, Loader2, ChevronDown, ChevronRight, AlertTriangle, Shield, Zap } from 'lucide-react';
import { useCveIntel } from '@/hooks/useCveIntel';
import { nvdLink, cweLink } from '@/lib/findingTaxonomy';

interface CveDetailDialogProps {
  cveId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const severityColor = (sev?: string | null) => {
  switch ((sev || '').toUpperCase()) {
    case 'CRITICAL': return 'bg-red-100 text-red-800 border-red-200';
    case 'HIGH': return 'bg-orange-100 text-orange-800 border-orange-200';
    case 'MEDIUM': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    case 'LOW': return 'bg-green-100 text-green-800 border-green-200';
    default: return 'bg-muted text-muted-foreground';
  }
};

export const CveDetailDialog: React.FC<CveDetailDialogProps> = ({ cveId, open, onOpenChange }) => {
  const { data: intel, isLoading } = useCveIntel(open ? cveId : null);
  const [openRefs, setOpenRefs] = useState(false);
  const [openCpe, setOpenCpe] = useState(false);
  const [openExploits, setOpenExploits] = useState(false);

  useEffect(() => {
    if (!open) return;
    setOpenRefs(false);
    setOpenCpe(false);
    setOpenExploits(false);
  }, [open, cveId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5" />
            {cveId}
            {intel?.cisa_kev && (
              <Badge variant="destructive" className="ml-2 gap-1">
                <Zap className="w-3 h-3" /> CISA KEV
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            Dettagli NVD + EPSS + CISA Known Exploited Vulnerabilities
          </DialogDescription>
        </DialogHeader>

        {isLoading || !intel ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {intel === null ? 'Arricchimento in coda, attendi...' : 'Caricamento...'}
            </p>
          </div>
        ) : (
          <ScrollArea className="max-h-[65vh] pr-4">
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="p-3 rounded-lg border bg-muted/20">
                  <div className="text-xs text-muted-foreground">CVSS v3</div>
                  <div className="text-lg font-bold">{intel.cvss_v3_score ?? '—'}</div>
                  {intel.cvss_v3_severity && (
                    <Badge variant="outline" className={severityColor(intel.cvss_v3_severity)}>
                      {intel.cvss_v3_severity}
                    </Badge>
                  )}
                </div>
                <div className="p-3 rounded-lg border bg-muted/20">
                  <div className="text-xs text-muted-foreground">EPSS Score</div>
                  <div className="text-lg font-bold">
                    {intel.epss_score != null ? `${(intel.epss_score * 100).toFixed(2)}%` : '—'}
                  </div>
                  {intel.epss_percentile != null && (
                    <div className="text-xs text-muted-foreground">
                      Perc. {(intel.epss_percentile * 100).toFixed(1)}
                    </div>
                  )}
                </div>
                <div className="p-3 rounded-lg border bg-muted/20">
                  <div className="text-xs text-muted-foreground">CISA KEV</div>
                  <div className="text-lg font-bold">{intel.cisa_kev ? 'Sì' : 'No'}</div>
                  {intel.kev_date_added && (
                    <div className="text-xs text-muted-foreground">
                      {new Date(intel.kev_date_added).toLocaleDateString('it-IT')}
                    </div>
                  )}
                </div>
                <div className="p-3 rounded-lg border bg-muted/20">
                  <div className="text-xs text-muted-foreground">Pubblicata</div>
                  <div className="text-sm font-medium">
                    {intel.published_at ? new Date(intel.published_at).toLocaleDateString('it-IT') : '—'}
                  </div>
                </div>
              </div>

              {intel.cvss_v3_vector && (
                <div className="text-xs font-mono p-2 rounded bg-muted/30 break-all">
                  {intel.cvss_v3_vector}
                </div>
              )}

              {intel.cwe_ids?.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {intel.cwe_ids.map((c) => (
                    <a key={c} href={cweLink(c)} target="_blank" rel="noopener noreferrer">
                      <Badge variant="secondary" className="gap-1">
                        {c} <ExternalLink className="w-3 h-3" />
                      </Badge>
                    </a>
                  ))}
                </div>
              )}

              <div>
                <h4 className="font-semibold mb-1">Descrizione</h4>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                  {intel.description ?? 'Non disponibile'}
                </p>
              </div>

              {intel.kev_required_action && (
                <div className="p-3 rounded-lg border border-red-200 bg-red-50/40">
                  <div className="flex items-center gap-2 font-semibold text-red-700 mb-1">
                    <AlertTriangle className="w-4 h-4" /> Azione richiesta CISA
                  </div>
                  <p className="text-sm">{intel.kev_required_action}</p>
                  {intel.kev_due_date && (
                    <p className="text-xs mt-1 text-red-700">
                      Scadenza: {new Date(intel.kev_due_date).toLocaleDateString('it-IT')}
                    </p>
                  )}
                </div>
              )}

              {intel.exploit_links?.length > 0 && (
                <Collapsible open={openExploits} onOpenChange={setOpenExploits}>
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" size="sm" className="w-full justify-start">
                      {openExploits ? <ChevronDown className="w-4 h-4 mr-1" /> : <ChevronRight className="w-4 h-4 mr-1" />}
                      Exploit / PoC ({intel.exploit_links.length})
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="pl-6 space-y-1">
                    {intel.exploit_links.map((r, i) => (
                      <a key={i} href={r.url} target="_blank" rel="noopener noreferrer"
                         className="block text-xs text-primary hover:underline break-all">
                        {r.url}
                      </a>
                    ))}
                  </CollapsibleContent>
                </Collapsible>
              )}

              {intel.references_json?.length > 0 && (
                <Collapsible open={openRefs} onOpenChange={setOpenRefs}>
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" size="sm" className="w-full justify-start">
                      {openRefs ? <ChevronDown className="w-4 h-4 mr-1" /> : <ChevronRight className="w-4 h-4 mr-1" />}
                      References ({intel.references_json.length})
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="pl-6 space-y-1">
                    {intel.references_json.map((r, i) => (
                      <div key={i} className="text-xs">
                        <a href={r.url} target="_blank" rel="noopener noreferrer"
                           className="text-primary hover:underline break-all">{r.url}</a>
                        {r.tags && r.tags.length > 0 && (
                          <span className="ml-2 text-muted-foreground">[{r.tags.join(', ')}]</span>
                        )}
                      </div>
                    ))}
                  </CollapsibleContent>
                </Collapsible>
              )}

              {intel.cpe_json?.length > 0 && (
                <Collapsible open={openCpe} onOpenChange={setOpenCpe}>
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" size="sm" className="w-full justify-start">
                      {openCpe ? <ChevronDown className="w-4 h-4 mr-1" /> : <ChevronRight className="w-4 h-4 mr-1" />}
                      CPE affette ({intel.cpe_json.length})
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="pl-6 space-y-1 font-mono text-xs max-h-48 overflow-auto">
                    {intel.cpe_json.map((c, i) => (
                      <div key={i} className={c.vulnerable ? 'text-red-600' : 'text-muted-foreground'}>
                        {c.criteria}
                      </div>
                    ))}
                  </CollapsibleContent>
                </Collapsible>
              )}

              <div className="pt-2 border-t flex items-center justify-between">
                <a href={nvdLink(intel.cve_id)} target="_blank" rel="noopener noreferrer">
                  <Button variant="outline" size="sm" className="gap-1">
                    Apri su NVD <ExternalLink className="w-3 h-3" />
                  </Button>
                </a>
                <span className="text-xs text-muted-foreground">
                  Aggiornato: {new Date(intel.refreshed_at).toLocaleString('it-IT')}
                </span>
              </div>
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
};
