import React, { useMemo } from 'react';
import { useSurfaceGraphStore } from '@/stores/surface-graph-store';
import { ENRICHER_REGISTRY, NODE_TYPE_COLORS } from '@/types/surface-graph';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Zap, X, Flag, ExternalLink } from 'lucide-react';

interface DetailsPanelProps {
  onRunEnricher: (enricherName: string, nodeIds: string[]) => void;
  onClose: () => void;
}

export const DetailsPanel: React.FC<DetailsPanelProps> = ({ onRunEnricher, onClose }) => {
  const getCurrentNode = useSurfaceGraphStore((s) => s.getCurrentNode);
  const currentEdgeId  = useSurfaceGraphStore((s) => s.currentEdgeId);
  const getCurrentEdge = useSurfaceGraphStore((s) => s.getCurrentEdge);
  const setNodeFlag    = useSurfaceGraphStore((s) => s.setNodeFlag);
  const activeEnricherNodeIds = useSurfaceGraphStore((s) => s.activeEnricherNodeIds);

  const currentNode = getCurrentNode();
  const currentEdge = currentEdgeId ? getCurrentEdge() : null;

  const availableEnrichers = useMemo(() => {
    if (!currentNode) return [];
    return ENRICHER_REGISTRY.filter((e) => e.inputTypes.includes(currentNode.nodeType));
  }, [currentNode?.nodeType]);

  if (!currentNode && !currentEdge) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm p-4">
        Seleziona un nodo o arco per i dettagli
      </div>
    );
  }

  if (currentEdge && !currentNode) {
    return (
      <div className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm">Relazione</h3>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}><X className="w-3.5 h-3.5" /></Button>
        </div>
        <Badge variant="outline" className="text-xs">{currentEdge.label}</Badge>
        <div className="text-xs text-muted-foreground space-y-1">
          <p>Da: <span className="text-foreground">{String(currentEdge.source).slice(0, 40)}</span></p>
          <p>A: <span className="text-foreground">{String(currentEdge.target).slice(0, 40)}</span></p>
          {currentEdge.confidence_level != null && <p>Confidence: <span className="text-foreground">{currentEdge.confidence_level}</span></p>}
          {currentEdge.date && <p>Data: <span className="text-foreground">{currentEdge.date}</span></p>}
        </div>
      </div>
    );
  }

  if (!currentNode) return null;
  const nodeColor = NODE_TYPE_COLORS[currentNode.nodeType] ?? NODE_TYPE_COLORS.default;
  const isEnriching = activeEnricherNodeIds.has(currentNode.id);

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 flex items-center justify-between border-b border-border/50">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: nodeColor }} />
          <div className="min-w-0">
            <p className="font-semibold text-sm truncate">{currentNode.nodeLabel}</p>
            <p className="text-xs text-muted-foreground">{currentNode.nodeType}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {/* Flag buttons */}
          {(['red','orange','blue','green','yellow'] as const).map((flag) => (
            <button
              key={flag}
              className={`w-4 h-4 rounded-full border-2 transition-transform ${currentNode.nodeFlag === flag ? 'scale-125 border-white' : 'border-transparent opacity-60 hover:opacity-100'}`}
              style={{ background: flag === 'red' ? '#f87171' : flag === 'orange' ? '#fb923c' : flag === 'blue' ? '#60a5fa' : flag === 'green' ? '#4ade80' : '#facc15' }}
              onClick={() => setNodeFlag(currentNode.id, currentNode.nodeFlag === flag ? null : flag)}
              title={`Flag ${flag}`}
            />
          ))}
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}><X className="w-3.5 h-3.5" /></Button>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-3 space-y-4">
          {/* Properties */}
          <div className="space-y-1.5">
            {Object.entries(currentNode.nodeProperties).map(([k, v]) => (
              <div key={k} className="flex justify-between gap-2 text-xs">
                <span className="text-muted-foreground capitalize">{k.replace(/_/g, ' ')}</span>
                <span className="text-foreground text-right break-all max-w-[60%]">{String(v ?? '—').slice(0, 80)}</span>
              </div>
            ))}
          </div>

          {availableEnrichers.length > 0 && (
            <>
              <Separator />
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                  <Zap className="w-3 h-3" /> Enrichers
                </p>
                {availableEnrichers.map((enricher) => (
                  <Button
                    key={enricher.id}
                    variant="outline"
                    size="sm"
                    className="w-full justify-start gap-2 h-8 text-xs"
                    disabled={isEnriching}
                    onClick={() => onRunEnricher(enricher.id, [currentNode.id])}
                  >
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: enricher.color }} />
                    {enricher.label}
                    {isEnriching && <span className="ml-auto text-xs text-muted-foreground animate-pulse">...</span>}
                  </Button>
                ))}
              </div>
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  );
};
