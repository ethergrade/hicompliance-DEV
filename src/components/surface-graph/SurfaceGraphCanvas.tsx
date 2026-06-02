// Main graph canvas — adapted from Flowsint graph/index.tsx
// Uses GRAPH_FORCE_SETTINGS constant (not a store getter) to avoid re-render loops.
import React, { useCallback, useMemo, useEffect, useState, useRef, lazy, Suspense } from 'react';
import { useSurfaceGraphStore } from '@/stores/surface-graph-store';
import { GRAPH_FORCE_SETTINGS } from '@/stores/surface-graph-store';
import { CONSTANTS } from './utils/constants';
import { renderNode } from './node/node-renderer';
import { renderLink } from './edge/link-renderer';
import { createRenderContext, RenderContext } from './utils/render-context';
import { transformGraphData } from './utils/graph-data-transformer';
import { useHighlightState } from './hooks/use-highlight-state';
import {
  preloadImage, preloadIconByName, preloadExternalImage, preloadFlagImage,
} from './utils/image-cache';
import type { GraphNode, GraphEdge } from '@/types/surface-graph';
import { Loader2 } from 'lucide-react';

// Polyfill ctx.roundRect for browsers that don't support it (Safari < 15.4, Firefox < 112)
if (typeof CanvasRenderingContext2D !== 'undefined' && !CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function (
    x: number, y: number, width: number, height: number, radii?: number | number[]
  ) {
    const r = typeof radii === 'number' ? radii : Array.isArray(radii) ? radii[0] ?? 0 : 0;
    const rr = Math.min(r, width / 2, height / 2);
    this.moveTo(x + rr, y);
    this.lineTo(x + width - rr, y);
    this.arcTo(x + width, y, x + width, y + rr, rr);
    this.lineTo(x + width, y + height - rr);
    this.arcTo(x + width, y + height, x + width - rr, y + height, rr);
    this.lineTo(x + rr, y + height);
    this.arcTo(x, y + height, x, y + height - rr, rr);
    this.lineTo(x, y + rr);
    this.arcTo(x, y, x + rr, y, rr);
    this.closePath();
  };
}

// Lazy-load react-force-graph-2d to avoid module-load-time browser API access
const ForceGraph2DLazy = lazy(() => import('react-force-graph-2d').then(m => ({ default: m.default ?? m })));

const FLAG_PRELOAD = [
  { stroke: '#f87171', fill: '#fecaca' },
  { stroke: '#fb923c', fill: '#fed7aa' },
  { stroke: '#60a5fa', fill: '#bfdbfe' },
  { stroke: '#4ade80', fill: '#bbf7d0' },
  { stroke: '#facc15', fill: '#fef08a' },
];

interface SurfaceGraphCanvasProps {
  investigationId: string;
  onNodeClick?: (node: GraphNode) => void;
  onNodeRightClick?: (node: GraphNode, event: MouseEvent) => void;
  onEdgeClick?: (edge: GraphEdge) => void;
  onBackgroundClick?: () => void;
  className?: string;
}

const SurfaceGraphCanvas: React.FC<SurfaceGraphCanvasProps> = ({
  investigationId, onNodeClick, onNodeRightClick, onEdgeClick, onBackgroundClick, className = '',
}) => {
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const graphRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hasZoomedRef = useRef(false);

  const filteredNodes    = useSurfaceGraphStore((s) => s.filteredNodes);
  const filteredEdges    = useSurfaceGraphStore((s) => s.filteredEdges);
  const selectedEdges    = useSurfaceGraphStore((s) => s.selectedEdges);
  const currentNodeId    = useSurfaceGraphStore((s) => s.currentNodeId);
  const highlightedNodeIds = useSurfaceGraphStore((s) => s.highlightedNodeIds);
  const setCurrentNodeId = useSurfaceGraphStore((s) => s.setCurrentNodeId);
  const setCurrentEdgeId = useSurfaceGraphStore((s) => s.setCurrentEdgeId);
  const getCurrentEdge   = useSurfaceGraphStore((s) => s.getCurrentEdge);
  const toggleEdgeSel    = useSurfaceGraphStore((s) => s.toggleEdgeSelection);
  const clearSelEdges    = useSurfaceGraphStore((s) => s.clearSelectedEdges);

  // Use stable settings constant — never causes re-renders
  const forceSettings = GRAPH_FORCE_SETTINGS;
  const allowForces = true;
  const autoColorLinks = true;

  // Container size
  useEffect(() => {
    const update = () => {
      if (!containerRef.current) return;
      const r = containerRef.current.getBoundingClientRect();
      setContainerSize({ width: r.width, height: r.height });
    };
    update();
    const ro = new ResizeObserver(update);
    if (containerRef.current) ro.observe(containerRef.current);
    window.addEventListener('resize', update);
    return () => { ro.disconnect(); window.removeEventListener('resize', update); };
  }, []);

  useEffect(() => { hasZoomedRef.current = false; }, [investigationId]);

  // Preload icons
  useEffect(() => {
    filteredNodes.forEach((n) => {
      if (n.nodeImage) preloadExternalImage(n.nodeImage).catch(() => {});
      else if (n.nodeIcon) {
        preloadIconByName(n.nodeIcon, '#FFFFFF').catch(() => {});
        preloadIconByName(n.nodeIcon, '#000000').catch(() => {});
      } else if (n.nodeType) {
        preloadImage(n.nodeType, '#FFFFFF').catch(() => {});
        preloadImage(n.nodeType, '#000000').catch(() => {});
      }
    });
    FLAG_PRELOAD.forEach(({ stroke, fill }) => preloadFlagImage(stroke, fill).catch(() => {}));
  }, [filteredNodes]);

  const graphData = useMemo(
    () => transformGraphData({ nodes: filteredNodes, edges: filteredEdges }),
    [filteredNodes, filteredEdges],
  );
  const edgeMap = useMemo(() => new Map(filteredEdges.map((e) => [e.id, e])), [filteredEdges]);

  const { highlightNodes, highlightLinks, hoverNode, handleNodeHover, handleLinkHover, clearHighlights } = useHighlightState();
  useEffect(() => { clearHighlights(); }, [filteredNodes.length, filteredEdges.length]);

  const currentNodeHighlights = useMemo(() => {
    const nodes = new Set<string>(), links = new Set<string>();
    if (!currentNodeId) return { nodes, links };
    nodes.add(currentNodeId);
    filteredEdges.forEach((e) => {
      const src = typeof e.source === 'object' ? (e.source as any).id : e.source;
      const tgt = typeof e.target === 'object' ? (e.target as any).id : e.target;
      if (src === currentNodeId) { nodes.add(tgt); links.add(`${src}-${tgt}`); }
      else if (tgt === currentNodeId) { nodes.add(src); links.add(`${src}-${tgt}`); }
    });
    return { nodes, links };
  }, [currentNodeId, filteredEdges]);

  const mergedHighlightNodes = useMemo(() => {
    if (hoverNode) return highlightNodes;
    const m = new Set<string>(currentNodeHighlights.nodes);
    highlightedNodeIds.forEach((id) => m.add(id));
    return m;
  }, [hoverNode, highlightNodes, currentNodeHighlights.nodes, highlightedNodeIds]);

  const mergedHighlightLinks = useMemo(() => {
    if (hoverNode) return highlightLinks;
    return new Set<string>(currentNodeHighlights.links);
  }, [hoverNode, highlightLinks, currentNodeHighlights.links]);

  const rcRef = useRef<{ rc: RenderContext | null; key: string }>({ rc: null, key: '' });

  const getOrCreateRC = useCallback((globalScale: number): RenderContext => {
    const key = `${globalScale}:${mergedHighlightNodes.size}:${mergedHighlightLinks.size}:${selectedEdges.length}`;
    if (rcRef.current.key !== key || !rcRef.current.rc) {
      rcRef.current.rc = createRenderContext(globalScale, mergedHighlightNodes, mergedHighlightLinks, selectedEdges, 'dark');
      rcRef.current.key = key;
    }
    return rcRef.current.rc!;
  }, [mergedHighlightNodes, mergedHighlightLinks, selectedEdges]);

  const currentEdge = useMemo(() => getCurrentEdge(), [getCurrentEdge, filteredEdges.length]);

  const renderNodeCb = useCallback((node: any, ctx: CanvasRenderingContext2D, gs: number) => {
    renderNode({
      node, ctx, globalScale: gs, forceSettings,
      showLabels: true, showIcons: true,
      isCurrent: (id) => id === currentNodeId,
      isSelected: () => false,
      theme: 'dark',
      highlightNodes: mergedHighlightNodes, highlightLinks: mergedHighlightLinks,
      hoverNode, rc: getOrCreateRC(gs),
    });
  }, [currentNodeId, mergedHighlightNodes, mergedHighlightLinks, hoverNode, getOrCreateRC]);

  const renderLinkCb = useCallback((link: any, ctx: CanvasRenderingContext2D, gs: number) => {
    renderLink({
      link, ctx, globalScale: gs, forceSettings, theme: 'dark',
      highlightLinks: mergedHighlightLinks, highlightNodes: mergedHighlightNodes,
      selectedEdges, currentEdge, autoColorLinksByNodeType: autoColorLinks,
      rc: getOrCreateRC(gs),
    });
  }, [mergedHighlightLinks, mergedHighlightNodes, selectedEdges, currentEdge, getOrCreateRC]);

  const handleNodeClick = useCallback((node: any) => {
    setCurrentNodeId(node.id);
    clearSelEdges();
    onNodeClick?.(node as GraphNode);
  }, [setCurrentNodeId, clearSelEdges, onNodeClick]);

  const handleEdgeClick = useCallback((link: any) => {
    const edge = edgeMap.get(link.id);
    if (edge) { setCurrentEdgeId(edge.id); toggleEdgeSel(edge); onEdgeClick?.(edge); }
  }, [edgeMap, setCurrentEdgeId, toggleEdgeSel, onEdgeClick]);

  const handleBackgroundClick = useCallback(() => {
    setCurrentNodeId(null);
    clearSelEdges();
    onBackgroundClick?.();
  }, [setCurrentNodeId, clearSelEdges, onBackgroundClick]);

  const handleEngineStop = useCallback(() => {
    if (!hasZoomedRef.current && graphRef.current) {
      hasZoomedRef.current = true;
      try { graphRef.current.zoomToFit?.(400); } catch { /* ignore */ }
    }
  }, []);

  if (!filteredNodes.length) {
    return (
      <div ref={containerRef} className={`flex items-center justify-center h-full ${className}`} style={{ background: '#0f172a' }}>
        <div className="text-center text-muted-foreground space-y-3 p-8">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
            <svg className="w-8 h-8 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M3 12h3m12 0h3M12 3v3m0 12v3M5.64 5.64l2.12 2.12m8.48 8.48 2.12 2.12M5.64 18.36l2.12-2.12m8.48-8.48 2.12-2.12"/></svg>
          </div>
          <p className="font-medium">Grafo vuoto</p>
          <p className="text-sm">Clicca <strong>Seed da Scan</strong> nella toolbar per popolare il grafo con i dati di SurfaceScan360.</p>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className={`relative w-full h-full ${className}`} style={{ background: '#0f172a' }}>
      {containerSize.width > 0 && (
        <Suspense fallback={
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        }>
          <ForceGraph2DLazy
            ref={graphRef}
            width={containerSize.width}
            height={containerSize.height}
            graphData={graphData}
            maxZoom={CONSTANTS.MAX_ZOOM}
            minZoom={CONSTANTS.MIN_ZOOM}
            nodeLabel={() => ''}
            nodeRelSize={3}
            onNodeClick={handleNodeClick}
            onNodeRightClick={(node: any, ev: MouseEvent) => onNodeRightClick?.(node as GraphNode, ev)}
            onBackgroundClick={handleBackgroundClick}
            onLinkClick={handleEdgeClick}
            nodeCanvasObject={renderNodeCb}
            linkCanvasObject={renderLinkCb}
            onEngineStop={handleEngineStop}
            cooldownTicks={allowForces ? 100 : 0}
            cooldownTime={3000}
            d3AlphaDecay={0.0228}
            d3AlphaMin={0}
            d3VelocityDecay={0.4}
            warmupTicks={0}
            dagLevelDistance={50}
            backgroundColor="transparent"
            linkCurvature={(link: any) => link.curvature ?? 0}
            enableNodeDrag={true}
            autoPauseRedraw={true}
            onNodeHover={handleNodeHover}
            onLinkHover={handleLinkHover}
          />
        </Suspense>
      )}
    </div>
  );
};

export default SurfaceGraphCanvas;
