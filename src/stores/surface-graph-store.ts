// SurfaceGraph Zustand store — adapted from Flowsint graph-store.ts
// Manages graph state without TanStack Router; uses Supabase for persistence.
import { create } from 'zustand';
import type {
  GraphNode,
  GraphEdge,
  GraphInvestigation,
  GraphEnricherRun,
  FlagColor,
} from '@/types/surface-graph';
import { NODE_TYPE_COLORS } from '@/types/surface-graph';

interface GraphFilters {
  types: Array<{ type: string; checked: boolean; color: string }>;
}

interface SurfaceGraphState {
  // === Investigation ===
  investigations: GraphInvestigation[];
  currentInvestigationId: string | null;
  setInvestigations: (inv: GraphInvestigation[]) => void;
  setCurrentInvestigationId: (id: string | null) => void;
  addInvestigation: (inv: GraphInvestigation) => void;
  removeInvestigation: (id: string) => void;

  // === Graph data ===
  nodes: GraphNode[];
  edges: GraphEdge[];
  filteredNodes: GraphNode[];
  filteredEdges: GraphEdge[];
  nodesMapping: Map<string, GraphNode>;
  edgesMapping: Map<string, GraphEdge>;
  setNodes: (nodes: GraphNode[]) => void;
  setEdges: (edges: GraphEdge[]) => void;
  addNodes: (newNodes: GraphNode[]) => void;
  addEdges: (newEdges: GraphEdge[]) => void;
  updateNode: (id: string, updates: Partial<GraphNode>) => void;
  removeNodes: (ids: string[]) => void;
  removeEdges: (ids: string[]) => void;
  reset: () => void;

  // === Selection ===
  currentNodeId: string | null;
  currentEdgeId: string | null;
  selectedNodes: GraphNode[];
  selectedEdges: GraphEdge[];
  setCurrentNodeId: (id: string | null) => void;
  setCurrentEdgeId: (id: string | null) => void;
  clearSelectedNodes: () => void;
  clearSelectedEdges: () => void;
  toggleNodeSelection: (node: GraphNode, multi?: boolean) => void;
  toggleEdgeSelection: (edge: GraphEdge, multi?: boolean) => void;
  getCurrentNode: () => GraphNode | null;
  getCurrentEdge: () => GraphEdge | null;
  getNode: (id: string) => GraphNode | null;

  // === Highlights / path ===
  highlightedNodeIds: string[];
  setHighlightedNodes: (ids: string[]) => void;

  // === Filters ===
  filters: GraphFilters;
  setFilters: (f: GraphFilters) => void;
  rebuildFilters: (nodes: GraphNode[]) => void;

  // === Enricher runs ===
  enricherRuns: GraphEnricherRun[];
  activeEnricherNodeIds: Set<string>;
  addEnricherRun: (run: GraphEnricherRun) => void;
  updateEnricherRun: (id: string, updates: Partial<GraphEnricherRun>) => void;

  // === Dialogs ===
  openAddNodeDialog: boolean;
  setOpenAddNodeDialog: (v: boolean) => void;

  // === Node flag ===
  setNodeFlag: (nodeId: string, flag: FlagColor | null) => void;

  // === Stats ===
  nodesLength: number;
  edgesLength: number;
}

const computeFiltered = (nodes: GraphNode[], edges: GraphEdge[], filters: GraphFilters) => {
  const allToggled  = filters.types.every((t) => t.checked);
  const noneToggled = filters.types.every((t) => !t.checked);
  const filteredNodes = (allToggled || noneToggled)
    ? nodes
    : nodes.filter((n) => {
        const f = filters.types.find((t) => t.type === n.nodeType);
        return f ? f.checked : true;
      });
  const nodeIds = new Set(filteredNodes.map((n) => n.id));
  const filteredEdges = edges.filter((e) => {
    const src = typeof e.source === 'object' ? (e.source as any).id : e.source;
    const tgt = typeof e.target === 'object' ? (e.target as any).id : e.target;
    return nodeIds.has(src) && nodeIds.has(tgt);
  });
  return { filteredNodes, filteredEdges };
};

export const useSurfaceGraphStore = create<SurfaceGraphState>()((set, get) => ({
  // === Investigation ===
  investigations: [],
  currentInvestigationId: null,
  setInvestigations: (investigations) => set({ investigations }),
  setCurrentInvestigationId: (id) => set({ currentInvestigationId: id }),
  addInvestigation: (inv) => set((s) => ({ investigations: [...s.investigations, inv] })),
  removeInvestigation: (id) => set((s) => ({
    investigations: s.investigations.filter((i) => i.id !== id),
    currentInvestigationId: s.currentInvestigationId === id ? null : s.currentInvestigationId,
  })),

  // === Graph data ===
  nodes: [],
  edges: [],
  filteredNodes: [],
  filteredEdges: [],
  nodesMapping: new Map(),
  edgesMapping: new Map(),
  nodesLength: 0,
  edgesLength: 0,

  setNodes: (nodes) => set((s) => {
    const nodesMapping = new Map(nodes.map((n) => [n.id, n]));
    const { filteredNodes, filteredEdges } = computeFiltered(nodes, s.edges, s.filters);
    return { nodes, nodesMapping, filteredNodes, filteredEdges, nodesLength: nodes.length };
  }),

  setEdges: (edges) => set((s) => {
    const edgesMapping = new Map(edges.map((e) => [e.id, e]));
    const { filteredNodes, filteredEdges } = computeFiltered(s.nodes, edges, s.filters);
    return { edges, edgesMapping, filteredEdges, edgesLength: edges.length };
  }),

  addNodes: (newNodes) => set((s) => {
    const existing = new Set(s.nodes.map((n) => n.id));
    const fresh = newNodes.filter((n) => !existing.has(n.id));
    if (!fresh.length) return {};
    const nodes = [...s.nodes, ...fresh];
    const nodesMapping = new Map([...s.nodesMapping, ...fresh.map((n) => [n.id, n] as [string, GraphNode])]);
    const { filteredNodes, filteredEdges } = computeFiltered(nodes, s.edges, s.filters);
    const updatedFilters = rebuildFiltersFromNodes(nodes, s.filters);
    return { nodes, nodesMapping, filteredNodes, filteredEdges, nodesLength: nodes.length, filters: updatedFilters };
  }),

  addEdges: (newEdges) => set((s) => {
    const existingIds = new Set(s.edges.map((e) => e.id));
    const fresh = newEdges.filter((e) => !existingIds.has(e.id));
    if (!fresh.length) return {};
    const edges = [...s.edges, ...fresh];
    const edgesMapping = new Map([...s.edgesMapping, ...fresh.map((e) => [e.id, e] as [string, GraphEdge])]);
    const { filteredEdges } = computeFiltered(s.nodes, edges, s.filters);
    return { edges, edgesMapping, filteredEdges, edgesLength: edges.length };
  }),

  updateNode: (id, updates) => set((s) => {
    const nodes = s.nodes.map((n) => n.id === id ? { ...n, ...updates } : n);
    const nodesMapping = new Map(s.nodesMapping);
    const existing = nodesMapping.get(id);
    if (existing) nodesMapping.set(id, { ...existing, ...updates });
    const { filteredNodes } = computeFiltered(nodes, s.edges, s.filters);
    return { nodes, nodesMapping, filteredNodes };
  }),

  removeNodes: (ids) => set((s) => {
    const idSet = new Set(ids);
    const nodes = s.nodes.filter((n) => !idSet.has(n.id));
    const edges = s.edges.filter((e) => {
      const src = typeof e.source === 'object' ? (e.source as any).id : e.source;
      const tgt = typeof e.target === 'object' ? (e.target as any).id : e.target;
      return !idSet.has(src) && !idSet.has(tgt);
    });
    const nodesMapping = new Map(nodes.map((n) => [n.id, n]));
    const edgesMapping = new Map(edges.map((e) => [e.id, e]));
    const { filteredNodes, filteredEdges } = computeFiltered(nodes, edges, s.filters);
    return { nodes, edges, nodesMapping, edgesMapping, filteredNodes, filteredEdges, nodesLength: nodes.length, edgesLength: edges.length };
  }),

  removeEdges: (ids) => set((s) => {
    const idSet = new Set(ids);
    const edges = s.edges.filter((e) => !idSet.has(e.id));
    const edgesMapping = new Map(edges.map((e) => [e.id, e]));
    const { filteredEdges } = computeFiltered(s.nodes, edges, s.filters);
    return { edges, edgesMapping, filteredEdges, edgesLength: edges.length };
  }),

  reset: () => set({
    nodes: [], edges: [], filteredNodes: [], filteredEdges: [],
    nodesMapping: new Map(), edgesMapping: new Map(),
    currentNodeId: null, currentEdgeId: null,
    selectedNodes: [], selectedEdges: [], nodesLength: 0, edgesLength: 0,
  }),

  // === Selection ===
  currentNodeId:  null,
  currentEdgeId:  null,
  selectedNodes:  [],
  selectedEdges:  [],

  setCurrentNodeId: (id) => set({ currentNodeId: id }),
  setCurrentEdgeId: (id) => set({ currentEdgeId: id }),
  clearSelectedNodes: () => set({ selectedNodes: [] }),
  clearSelectedEdges: () => set({ selectedEdges: [] }),

  toggleNodeSelection: (node, multi = false) => set((s) => {
    if (multi) {
      const exists = s.selectedNodes.some((n) => n.id === node.id);
      return { selectedNodes: exists ? s.selectedNodes.filter((n) => n.id !== node.id) : [...s.selectedNodes, node] };
    }
    return { selectedNodes: [node] };
  }),

  toggleEdgeSelection: (edge, multi = false) => set((s) => {
    if (multi) {
      const exists = s.selectedEdges.some((e) => e.id === edge.id);
      return { selectedEdges: exists ? s.selectedEdges.filter((e) => e.id !== edge.id) : [...s.selectedEdges, edge] };
    }
    return { selectedEdges: [edge] };
  }),

  getCurrentNode: () => {
    const s = get();
    return s.currentNodeId ? (s.nodesMapping.get(s.currentNodeId) ?? null) : null;
  },
  getCurrentEdge: () => {
    const s = get();
    return s.currentEdgeId ? (s.edgesMapping.get(s.currentEdgeId) ?? null) : null;
  },
  getNode: (id) => get().nodesMapping.get(id) ?? null,

  // === Highlights ===
  highlightedNodeIds: [],
  setHighlightedNodes: (ids) => set({ highlightedNodeIds: ids }),

  // === Filters ===
  filters: { types: [] },
  setFilters: (filters) => set((s) => {
    const { filteredNodes, filteredEdges } = computeFiltered(s.nodes, s.edges, filters);
    return { filters, filteredNodes, filteredEdges };
  }),
  rebuildFilters: (nodes) => set((s) => {
    const updatedFilters = rebuildFiltersFromNodes(nodes, s.filters);
    return { filters: updatedFilters };
  }),

  // === Enricher runs ===
  enricherRuns: [],
  activeEnricherNodeIds: new Set(),

  addEnricherRun: (run) => set((s) => {
    const nodeIdSet = new Set([...s.activeEnricherNodeIds, ...run.input_node_ids]);
    return { enricherRuns: [run, ...s.enricherRuns.slice(0, 49)], activeEnricherNodeIds: nodeIdSet };
  }),

  updateEnricherRun: (id, updates) => set((s) => {
    const enricherRuns = s.enricherRuns.map((r) => r.id === id ? { ...r, ...updates } : r);
    // Recalculate active node IDs from still-running runs
    const activeEnricherNodeIds = new Set<string>(
      enricherRuns
        .filter((r) => r.status === 'running')
        .flatMap((r) => r.input_node_ids)
    );
    return { enricherRuns, activeEnricherNodeIds };
  }),

  // === Dialogs ===
  openAddNodeDialog: false,
  setOpenAddNodeDialog: (v) => set({ openAddNodeDialog: v }),

  // === Node flag ===
  setNodeFlag: (nodeId, flag) => set((s) => {
    const nodes = s.nodes.map((n) => n.id === nodeId ? { ...n, nodeFlag: flag } : n);
    const nodesMapping = new Map(nodes.map((n) => [n.id, n]));
    return { nodes, nodesMapping };
  }),
}));

// Rebuild type filters from current nodes (add new types, preserve checked state)
function rebuildFiltersFromNodes(nodes: GraphNode[], current: GraphFilters): GraphFilters {
  const typeSet = new Set(nodes.map((n) => n.nodeType));
  const existingTypes = new Map(current.types.map((t) => [t.type, t.checked]));
  const types = Array.from(typeSet).map((type) => ({
    type,
    checked: existingTypes.has(type) ? existingTypes.get(type)! : true,
    color: NODE_TYPE_COLORS[type] ?? NODE_TYPE_COLORS.default,
  }));
  return { types };
}

// Settings store (simplified — no persist needed for MVP)
interface GraphSettingsState {
  dotStyle:              boolean;
  nodeOutlined:          boolean;
  nodeSize:              number;
  linkWidth:             number;
  showMinimap:           boolean;
  showBackground:        boolean;
  autoColorLinks:        boolean;
  allowForces:           boolean;
  linkDirectionalArrowLength: number;
  cooldownTicks:         number;
  cooldownTime:          number;
  warmupTicks:           number;
  d3AlphaDecay:          number;
  d3AlphaMin:            number;
  d3VelocityDecay:       number;
  dagLevelDistance:      number;
  nodeLabelFontSize:     number;
  linkLabelFontSize:     number;
  linkLabelHorizontal:   boolean;
  nodeWeightMultiplierSize: number;
  setDotStyle:           (v: boolean) => void;
  setShowMinimap:        (v: boolean) => void;
  setAllowForces:        (v: boolean) => void;
  getSettingValue:       (category: string, key: string) => any;
  forceSettings:         Record<string, { value: any }>;
  setImportModalOpen:    (v: boolean) => void;
}

export const useGraphSettingsStore = create<GraphSettingsState>()((set, get) => ({
  dotStyle:              true,
  nodeOutlined:          false,
  nodeSize:              30,
  linkWidth:             0.8,
  showMinimap:           true,
  showBackground:        true,
  autoColorLinks:        true,
  allowForces:           true,
  linkDirectionalArrowLength: 3.5,
  cooldownTicks:         100,
  cooldownTime:          3000,
  warmupTicks:           0,
  d3AlphaDecay:          0.0228,
  d3AlphaMin:            0,
  d3VelocityDecay:       0.4,
  dagLevelDistance:      50,
  nodeLabelFontSize:     60,
  linkLabelFontSize:     60,
  linkLabelHorizontal:   false,
  nodeWeightMultiplierSize: 1.2,

  setDotStyle:    (v) => set({ dotStyle: v }),
  setShowMinimap: (v) => set({ showMinimap: v }),
  setAllowForces: (v) => set({ allowForces: v }),
  setImportModalOpen: () => {},

  getSettingValue: (category, key) => {
    const s = get();
    const map: Record<string, Record<string, any>> = {
      general: {
        autoZoomOnCurrentNode: true,
        showMinimap: s.showMinimap,
        showBackground: s.showBackground,
        autoColorLinksByNodeType: s.autoColorLinks,
      },
    };
    return map[category]?.[key] ?? null;
  },

  get forceSettings() {
    const s = get();
    return {
      dotStyle:                  { value: s.dotStyle },
      nodeOutlined:              { value: s.nodeOutlined },
      nodeSize:                  { value: s.nodeSize },
      nodeWeightMultiplierSize:  { value: s.nodeWeightMultiplierSize },
      linkWidth:                 { value: s.linkWidth },
      linkDirectionalArrowLength:{ value: s.linkDirectionalArrowLength },
      cooldownTicks:             { value: s.cooldownTicks },
      cooldownTime:              { value: s.cooldownTime },
      warmupTicks:               { value: s.warmupTicks },
      d3AlphaDecay:              { value: s.d3AlphaDecay },
      d3AlphaMin:                { value: s.d3AlphaMin },
      d3VelocityDecay:           { value: s.d3VelocityDecay },
      dagLevelDistance:          { value: s.dagLevelDistance },
      nodeLabelFontSize:         { value: s.nodeLabelFontSize },
      linkLabelFontSize:         { value: s.linkLabelFontSize },
      linkLabelHorizontal:       { value: s.linkLabelHorizontal },
    };
  },
}));
