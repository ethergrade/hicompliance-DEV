import { useState, useCallback } from 'react';

export function useHighlightState() {
  const [highlightNodes, setHighlightNodes] = useState<Set<string>>(new Set());
  const [highlightLinks, setHighlightLinks] = useState<Set<string>>(new Set());
  const [hoverNode, setHoverNode] = useState<string | null>(null);

  const handleNodeHover = useCallback((node: any) => {
    if (!node) {
      setHoverNode(null);
      setHighlightNodes(new Set());
      setHighlightLinks(new Set());
      return;
    }
    const nodeId = node.id;
    setHoverNode(nodeId);
    const nodes = new Set<string>([nodeId]);
    const links = new Set<string>();
    (node.neighbors || []).forEach((n: any) => nodes.add(n.id));
    (node.links || []).forEach((l: any) => links.add(`${l.source?.id ?? l.source}-${l.target?.id ?? l.target}`));
    setHighlightNodes(nodes);
    setHighlightLinks(links);
  }, []);

  const handleLinkHover = useCallback((link: any) => {
    if (!link) {
      setHighlightNodes(new Set());
      setHighlightLinks(new Set());
      return;
    }
    const src = typeof link.source === 'object' ? link.source.id : link.source;
    const tgt = typeof link.target === 'object' ? link.target.id : link.target;
    setHighlightNodes(new Set([src, tgt]));
    setHighlightLinks(new Set([`${src}-${tgt}`]));
  }, []);

  const clearHighlights = useCallback(() => {
    setHoverNode(null);
    setHighlightNodes(new Set());
    setHighlightLinks(new Set());
  }, []);

  return { highlightNodes, highlightLinks, hoverNode, handleNodeHover, handleLinkHover, clearHighlights };
}
