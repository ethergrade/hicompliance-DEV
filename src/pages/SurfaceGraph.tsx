import React, { useState, useRef } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useSurfaceGraph } from '@/hooks/useSurfaceGraph';
import { useSurfaceGraphStore } from '@/stores/surface-graph-store';
import SurfaceGraphCanvas from '@/components/surface-graph/SurfaceGraphCanvas';
import { DetailsPanel } from '@/components/surface-graph/panels/DetailsPanel';
import { GraphToolbar } from '@/components/surface-graph/panels/GraphToolbar';
import { TypeFiltersPanel } from '@/components/surface-graph/panels/TypeFiltersPanel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Network, Plus, Trash2, Loader2, GitBranch, RefreshCw,
  ChevronRight, Search, X, AlertCircle,
} from 'lucide-react';
import { useUserRoles } from '@/hooks/useUserRoles';
import { Navigate } from 'react-router-dom';
import type { GraphNode } from '@/types/surface-graph';

const SurfaceGraph: React.FC = () => {
  const { isSuperAdmin, loading: rolesLoading } = useUserRoles();
  const graphRef = useRef<any>(null);

  const {
    organizationId,
    currentInvestigationId,
    setCurrentId,
    investigations,
    isLoadingInvestigations,
    isLoadingGraph,
    createInvestigation,
    deleteInvestigation,
    isCreating,
    runEnricher,
    isEnriching,
    seedFromScan,
    isSeedingFromScan,
  } = useSurfaceGraph();

  const nodesLength = useSurfaceGraphStore((s) => s.nodesLength);
  const edgesLength = useSurfaceGraphStore((s) => s.edgesLength);
  const setCurrentNodeId = useSurfaceGraphStore((s) => s.setCurrentNodeId);
  const getCurrentNode   = useSurfaceGraphStore((s) => s.getCurrentNode);
  const currentNodeId    = useSurfaceGraphStore((s) => s.currentNodeId);
  const enricherRuns     = useSurfaceGraphStore((s) => s.enricherRuns);

  const [newInvName, setNewInvName] = useState('');
  const [showNewInv, setShowNewInv] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [leftPanelOpen, setLeftPanelOpen] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const filteredNodes = useSurfaceGraphStore((s) => s.filteredNodes);

  const handleCreateInvestigation = () => {
    const name = newInvName.trim() || `Investigazione ${new Date().toLocaleDateString('it-IT')}`;
    createInvestigation(name);
    setNewInvName('');
    setShowNewInv(false);
  };

  const handleNodeClick = (node: GraphNode) => {
    setCurrentNodeId(node.id);
    setDetailsOpen(true);
  };

  const searchResults = searchTerm.length >= 2
    ? filteredNodes.filter((n) =>
        n.nodeLabel.toLowerCase().includes(searchTerm.toLowerCase()) ||
        n.nodeType.toLowerCase().includes(searchTerm.toLowerCase()) ||
        String(n.nodeProperties?.value || '').toLowerCase().includes(searchTerm.toLowerCase())
      ).slice(0, 20)
    : [];

  if (!rolesLoading && !isSuperAdmin) {
    // Allow all admins to access graph
  }

  if (rolesLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="flex flex-col h-[calc(100vh-80px)] -mx-6 -my-6">
        {/* ── Header bar ─────────────────────────────────────────────── */}
        <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border/50 bg-background/90 backdrop-blur-sm flex-shrink-0">
          <Network className="w-5 h-5 text-primary flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-semibold truncate">Attack Surface Intelligence Graph</h1>
            <p className="text-xs text-muted-foreground">OSINT knowledge graph — domini, IP, email, asset, credenziali</p>
          </div>
          {currentInvestigationId && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="secondary">{nodesLength} nodi</Badge>
              <Badge variant="outline">{edgesLength} archi</Badge>
            </div>
          )}
        </div>

        {/* ── Main area ──────────────────────────────────────────────── */}
        <div className="flex flex-1 min-h-0">
          {/* Left panel: investigations + filters */}
          <div className={`flex flex-col border-r border-border/50 bg-background transition-all duration-200 flex-shrink-0 ${leftPanelOpen ? 'w-60' : 'w-0 overflow-hidden'}`}>
            <div className="p-3 flex items-center justify-between border-b border-border/50 flex-shrink-0">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Investigazioni</span>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setShowNewInv(true)}>
                <Plus className="w-3.5 h-3.5" />
              </Button>
            </div>

            <ScrollArea className="flex-1">
              {isLoadingInvestigations ? (
                <div className="flex items-center justify-center py-8"><Loader2 className="w-4 h-4 animate-spin" /></div>
              ) : investigations.length === 0 ? (
                <div className="p-4 text-center">
                  <p className="text-xs text-muted-foreground mb-3">Nessuna investigazione</p>
                  <Button size="sm" className="h-7 text-xs" onClick={() => setShowNewInv(true)}>
                    <Plus className="w-3 h-3 mr-1" /> Nuova
                  </Button>
                </div>
              ) : (
                <div className="p-2 space-y-1">
                  {investigations.map((inv) => (
                    <button
                      key={inv.id}
                      onClick={() => setCurrentId(inv.id)}
                      className={`w-full text-left px-2.5 py-2 rounded-md transition-colors group ${currentInvestigationId === inv.id ? 'bg-primary/15 text-primary' : 'hover:bg-muted/50 text-muted-foreground'}`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium truncate">{inv.name}</p>
                          <p className="text-[10px] text-muted-foreground">{inv.node_count}n · {inv.edge_count}e</p>
                        </div>
                        <Button
                          variant="ghost" size="icon" className="h-5 w-5 opacity-0 group-hover:opacity-100 flex-shrink-0"
                          onClick={(e) => { e.stopPropagation(); deleteInvestigation(inv.id); }}
                        >
                          <Trash2 className="w-2.5 h-2.5" />
                        </Button>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </ScrollArea>

            {/* Search */}
            {currentInvestigationId && nodesLength > 0 && (
              <>
                <Separator />
                <div className="p-2">
                  <div className="relative">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                    <Input
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder="Cerca nodi..."
                      className="pl-7 h-7 text-xs"
                    />
                    {searchTerm && (
                      <button onClick={() => setSearchTerm('')} className="absolute right-2 top-1/2 -translate-y-1/2">
                        <X className="w-3 h-3 text-muted-foreground" />
                      </button>
                    )}
                  </div>
                  {searchResults.length > 0 && (
                    <div className="mt-1 space-y-0.5">
                      {searchResults.map((n) => (
                        <button
                          key={n.id}
                          onClick={() => { setCurrentNodeId(n.id); setSearchTerm(''); setDetailsOpen(true); }}
                          className="w-full text-left px-2 py-1 rounded text-xs hover:bg-muted/50 flex items-center gap-1.5"
                        >
                          <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: n.nodeColor || '#666' }} />
                          <span className="truncate">{n.nodeLabel}</span>
                          <span className="text-muted-foreground ml-auto flex-shrink-0">{n.nodeType}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Type filters */}
            {currentInvestigationId && <TypeFiltersPanel />}

            {/* Enricher runs */}
            {enricherRuns.length > 0 && (
              <>
                <Separator />
                <div className="p-2">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Enrichment recente</p>
                  <div className="space-y-1">
                    {enricherRuns.slice(0, 5).map((r) => (
                      <div key={r.id} className="flex items-center gap-1.5 text-[10px]">
                        {r.status === 'running' ? <Loader2 className="w-2.5 h-2.5 animate-spin text-blue-400" /> :
                         r.status === 'completed' ? <div className="w-2.5 h-2.5 rounded-full bg-green-400" /> :
                         <AlertCircle className="w-2.5 h-2.5 text-red-400" />}
                        <span className="truncate text-muted-foreground">{r.enricher_name}</span>
                        {r.status === 'completed' && <span className="ml-auto text-green-400">+{r.nodes_created}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Toggle left panel button */}
          <button
            onClick={() => setLeftPanelOpen(!leftPanelOpen)}
            className="flex-shrink-0 w-4 flex items-center justify-center bg-background border-r border-border/50 hover:bg-muted/30 transition-colors"
          >
            <ChevronRight className={`w-3 h-3 text-muted-foreground transition-transform ${leftPanelOpen ? 'rotate-180' : ''}`} />
          </button>

          {/* Main canvas area */}
          <div className="flex-1 flex flex-col min-w-0">
            {!organizationId ? (
              <div className="flex-1 flex items-center justify-center text-muted-foreground">
                <p>Seleziona un cliente per usare il grafo.</p>
              </div>
            ) : !currentInvestigationId ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center space-y-3">
                  <Network className="w-12 h-12 text-muted-foreground mx-auto" />
                  <p className="text-muted-foreground">Crea o seleziona un'investigazione</p>
                  <Button onClick={() => setShowNewInv(true)}>
                    <Plus className="w-4 h-4 mr-2" /> Nuova Investigazione
                  </Button>
                </div>
              </div>
            ) : isLoadingGraph ? (
              <div className="flex-1 flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : (
              <div className="flex-1 min-h-0" data-graph-container>
                <SurfaceGraphCanvas
                  investigationId={currentInvestigationId}
                  onNodeClick={handleNodeClick}
                  className="w-full h-full"
                />
              </div>
            )}

            {/* Toolbar at bottom */}
            {currentInvestigationId && (
              <GraphToolbar
                graphRef={graphRef}
                onSeedFromScan={seedFromScan}
                isSeedingFromScan={isSeedingFromScan}
              />
            )}
          </div>

          {/* Right details panel */}
          {detailsOpen && currentNodeId && (
            <div className="w-72 flex-shrink-0 flex flex-col border-l border-border/50 bg-background">
              <DetailsPanel
                onRunEnricher={(name, ids) => runEnricher(name, ids)}
                onClose={() => { setDetailsOpen(false); setCurrentNodeId(null); }}
              />
            </div>
          )}
        </div>
      </div>

      {/* New investigation dialog */}
      <Dialog open={showNewInv} onOpenChange={setShowNewInv}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Nuova Investigazione</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <Input
              placeholder="Nome investigazione"
              value={newInvName}
              onChange={(e) => setNewInvName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreateInvestigation()}
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              Un grafo vuoto sarà creato. Usa "Seed da Scan" per popolarlo con i dati di SurfaceScan360.
            </p>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setShowNewInv(false)}>Annulla</Button>
              <Button size="sm" onClick={handleCreateInvestigation} disabled={isCreating}>
                {isCreating && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />}
                Crea
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default SurfaceGraph;
