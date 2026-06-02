import type { GraphNode, GraphEdge } from '@/types/surface-graph';
import { NODE_TYPE_COLORS } from '@/types/surface-graph';

interface TransformInput {
  nodes: GraphNode[];
  edges: GraphEdge[];
  nodeColors?: Record<string, string>;
}

export function transformGraphData({ nodes, edges, nodeColors = {} }: TransformInput) {
  const nodeMap = new Map<string, any>();

  const transformedNodes = nodes.map((node) => {
    const color = nodeColors[node.nodeType] ?? node.nodeColor ?? NODE_TYPE_COLORS[node.nodeType] ?? NODE_TYPE_COLORS.default;
    const enriched = { ...node, nodeColor: color, val: node.nodeSize, neighbors: [] as any[], links: [] as any[] };
    nodeMap.set(node.id, enriched);
    return enriched;
  });

  // Multi-edge curvature: group edges by source-target pair
  const edgePairs = new Map<string, number>();
  const transformedEdges = edges.map((edge) => {
    const key = [edge.source, edge.target].sort().join('--');
    const count = (edgePairs.get(key) ?? 0) + 1;
    edgePairs.set(key, count);
    const curvature = count > 1 ? 0.2 * Math.floor(count / 2) * (count % 2 === 0 ? 1 : -1) : 0;
    return { ...edge, curvature };
  });

  // Populate neighbors and links
  transformedEdges.forEach((edge) => {
    const srcId = typeof edge.source === 'object' ? (edge.source as any).id : edge.source;
    const tgtId = typeof edge.target === 'object' ? (edge.target as any).id : edge.target;
    const src = nodeMap.get(srcId);
    const tgt = nodeMap.get(tgtId);
    if (src && tgt) {
      src.neighbors.push(tgt);
      tgt.neighbors.push(src);
      src.links.push(edge);
      tgt.links.push(edge);
    }
  });

  return { nodes: transformedNodes, links: transformedEdges };
}
