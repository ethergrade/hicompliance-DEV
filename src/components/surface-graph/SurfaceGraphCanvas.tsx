// Main graph canvas — adapted from Flowsint graph/index.tsx
// Wraps react-force-graph-2d with our stores and renderers.
import React, { useCallback, useMemo, useEffect, useState, useRef } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import { useSurfaceGraphStore, useGraphSettingsStore } from '@/stores/surface-graph-store';
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

interface SurfaceGraphCanvasProps {
  investigationId: string;
  onNodeClick?: (node: GraphNode) => void;
  onNodeRightClick?: (node: GraphNode, event: MouseEvent) => void;
  onEdgeClick?: (edge: GraphEdge) => void;
  onBackgroundClick?: () => void;
  className?: string;
}

const FLAG_COLORS = [
  { stroke: '#f87171', fill: '#fecaca' },
  { stroke: '#fb923c', fill: '#fed7aa' },
  { stroke: '#60a5fa', fill: '#bfdbfe' },
  { stroke: '#4ade80', fill: '#bbf7d0' },
  { stroke: '#facc15', fill: '#fef08a' },
];

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

  const forceSettings = useGraphSettingsStore((s) => s.forceSettings);
  const showMinimap   = useGraphSettingsStore((s) => s.showMinimap);
  const autoColorLinks = useGraphSettingsStore((s) => s.autoColorLinks);
  const allowForces   = useGraphSettingsStore((s) => s.allowForces);

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

  // Reset zoom on investigation change
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
    FLAG_COLORS.forEach(({ stroke, fill }) => preloadFlagImage(stroke, fill).catch(() => {}));
  }, [filteredNodes]);

  const graphData = useMemo(() => transformGraphData({ nodes: filteredNodes, edges: filteredEdges }), [filteredNodes, filteredEdges]);
  const edgeMap   = useMemo(() => new Map(filteredEdges.map((e) => [e.id, e])), [filteredEdges]);

  const { highlightNodes, highlightLinks, hoverNode, handleNodeHover, handleLinkHover, clearHighlights } = useHighlightState();
  useEffect(() => { clearHighlights(); }, [filteredNodes.length, filteredEdges.length]);

  // Current node persistent highlight
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

  // Render context (per-frame cache)
  const rcRef = useRef<{ rc: RenderContext | null; key: string }>({ rc: null, key: '' });
  const rcVersion = useMemo(() => JSON.stringify([mergedHighlightNodes.size, mergedHighlightLinks.size, selectedEdges.length]), [mergedHighlightNodes, mergedHighlightLinks, selectedEdges]);

  const getOrCreateRC = useCallback((globalScale: number): RenderContext => {
    const key = `${globalScale}:${rcVersion}`;
    if (rcRef.current.key !== key || !rcRef.current.rc) {
      rcRef.current.rc = createRenderContext(globalScale, mergedHighlightNodes, mergedHighlightLinks, selectedEdges, 'dark');
      rcRef.current.key = key;
    }
    return rcRef.current.rc!;
  }, [mergedHighlightNodes, mergedHighlightLinks, selectedEdges, rcVersion]);

  const currentEdge = useMemo(() => getCurrentEdge(), [getCurrentEdge, filteredEdges]);

  const renderNodeCb = useCallback((node: any, ctx: CanvasRenderingContext2D, gs: number) => {
    renderNode({ node, ctx, globalScale: gs, forceSettings, showLabels: true, showIcons: true,
      isCurrent: (id) => id === currentNodeId, isSelected: () => false,
      theme: 'dark', highlightNodes: mergedHighlightNodes, highlightLinks: mergedHighlightLinks,
      hoverNode, rc: getOrCreateRC(gs) });
  }, [forceSettings, currentNodeId, mergedHighlightNodes, mergedHighlightLinks, hoverNode, getOrCreateRC]);

  const renderLinkCb = useCallback((link: any, ctx: CanvasRenderingContext2D, gs: number) => {
    renderLink({ link, ctx, globalScale: gs, forceSettings, theme: 'dark',
      highlightLinks: mergedHighlightLinks, highlightNodes: mergedHighlightNodes,
      selectedEdges, currentEdge, autoColorLinksByNodeType: autoColorLinks, rc: getOrCreateRC(gs) });
  }, [forceSettings, mergedHighlightLinks, mergedHighlightNodes, selectedEdges, currentEdge, autoColorLinks, getOrCreateRC]);

  const handleNodeClick = useCallback((node: any, ev: MouseEvent) => {
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
      graphRef.current.zoomToFit?.(400);
    }
  }, []);

  if (!filteredNodes.length) {
    return (
      <div ref={containerRef} className={`flex items-center justify-center h-full ${className}`} style={{ background: '#0f172a' }}>
        <div className="text-center text-muted-foreground space-y-2">
          <p className="text-lg font-medium">Grafo vuoto</p>
          <p className="text-sm">Aggiungi nodi o usa "Seed from Scan" per popolare il grafo.</p>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className={`relative w-full h-full ${className}`} style={{ background: '#0f172a' }}>
      {containerSize.width > 0 && (
        <ForceGraph2D
          ref={graphRef}
          width={containerSize.width}
          height={containerSize.height}
          graphData={graphData}
          maxZoom={CONSTANTS.MAX_ZOOM}
          minZoom={CONSTANTS.MIN_ZOOM}
          nodeLabel={() => ''}
          nodeRelSize={3}
          onNodeClick={handleNodeClick}
          onNodeRightClick={(node, ev) => onNodeRightClick?.(node as GraphNode, ev)}
          onBackgroundClick={handleBackgroundClick}
          onLinkClick={handleEdgeClick}
          nodeCanvasObject={renderNodeCb}
          linkCanvasObject={renderLinkCb}
          onEngineStop={handleEngineStop}
          cooldownTicks={allowForces ? (forceSettings.cooldownTicks?.value ?? 100) : 0}
          cooldownTime={forceSettings.cooldownTime?.value ?? 3000}
          d3AlphaDecay={forceSettings.d3AlphaDecay?.value ?? 0.0228}
          d3AlphaMin={forceSettings.d3AlphaMin?.value ?? 0}
          d3VelocityDecay={forceSettings.d3VelocityDecay?.value ?? 0.4}
          warmupTicks={forceSettings.warmupTicks?.value ?? 0}
          dagLevelDistance={forceSettings.dagLevelDistance?.value ?? 50}
          backgroundColor="transparent"
          linkCurvature={(link: any) => link.curvature || 0}
          enableNodeDrag={true}
          autoPauseRedraw={true}
          onNodeHover={handleNodeHover}
          onLinkHover={handleLinkHover}
        />
      )}
    </div>
  );
};

export default SurfaceGraphCanvas;
