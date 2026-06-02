import React from 'react';
import { Button } from '@/components/ui/button';
import { useSurfaceGraphStore, useGraphSettingsStore } from '@/stores/surface-graph-store';
import { Download, ZoomIn, ZoomOut, Maximize, Filter, RefreshCw, Settings2, Play, Square } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';

interface GraphToolbarProps {
  graphRef: React.MutableRefObject<any>;
  onSeedFromScan: () => void;
  isSeedingFromScan: boolean;
}

export const GraphToolbar: React.FC<GraphToolbarProps> = ({ graphRef, onSeedFromScan, isSeedingFromScan }) => {
  const nodesLength  = useSurfaceGraphStore((s) => s.nodesLength);
  const edgesLength  = useSurfaceGraphStore((s) => s.edgesLength);
  const allowForces  = useGraphSettingsStore((s) => s.allowForces);
  const setAllowForces = useGraphSettingsStore((s) => s.setAllowForces);
  const showMinimap  = useGraphSettingsStore((s) => s.showMinimap);
  const setShowMinimap = useGraphSettingsStore((s) => s.setShowMinimap);

  const zoomIn  = () => graphRef.current?.zoom(1.5, 200);
  const zoomOut = () => graphRef.current?.zoom(0.7, 200);
  const fitAll  = () => graphRef.current?.zoomToFit(400);

  const exportPng = () => {
    if (!graphRef.current) return;
    const canvas = document.querySelector('[data-graph-container] canvas') as HTMLCanvasElement;
    if (!canvas) return;
    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `attack-surface-graph-${Date.now()}.png`;
    a.click();
  };

  return (
    <div className="flex items-center gap-2 px-3 py-2 border-t border-border/50 bg-background/80 backdrop-blur-sm flex-wrap">
      {/* Stats */}
      <div className="flex items-center gap-2 mr-2">
        <Badge variant="secondary" className="text-xs">{nodesLength} nodi</Badge>
        <Badge variant="outline" className="text-xs">{edgesLength} archi</Badge>
      </div>

      <div className="h-4 w-px bg-border" />

      {/* Zoom controls */}
      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={zoomOut} title="Zoom out"><ZoomOut className="w-3.5 h-3.5" /></Button>
      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={fitAll} title="Fit all"><Maximize className="w-3.5 h-3.5" /></Button>
      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={zoomIn} title="Zoom in"><ZoomIn className="w-3.5 h-3.5" /></Button>

      <div className="h-4 w-px bg-border" />

      {/* Physics toggle */}
      <div className="flex items-center gap-1.5">
        {allowForces ? <Play className="w-3 h-3 text-green-400" /> : <Square className="w-3 h-3 text-muted-foreground" />}
        <span className="text-xs text-muted-foreground">Fisica</span>
        <Switch checked={allowForces} onCheckedChange={setAllowForces} className="scale-75" />
      </div>

      <div className="ml-auto flex items-center gap-2">
        {/* Seed from scan */}
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs gap-1.5"
          onClick={onSeedFromScan}
          disabled={isSeedingFromScan}
        >
          {isSeedingFromScan ? <RefreshCw className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
          {isSeedingFromScan ? 'Caricando...' : 'Seed da Scan'}
        </Button>

        {/* Export */}
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={exportPng} title="Export PNG">
          <Download className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
};
