// Node renderer for SurfaceGraph — ported from Flowsint node-renderer.ts
import type { GraphNode, NodeShape } from '@/types/surface-graph';
import { CONSTANTS, GRAPH_COLORS } from '../utils/constants';
import { getCachedImage, getCachedFlagImage, getCachedIconByName, getCachedExternalImage } from '../utils/image-cache';
import { truncateText, calculateNodeSize } from '../utils/utils';
import { RenderContext, isInViewport, getDimmedColor } from '../utils/render-context';

const FLAG_COLORS: Record<string, { stroke: string; fill: string }> = {
  red:    { stroke: '#f87171', fill: '#fecaca' },
  orange: { stroke: '#fb923c', fill: '#fed7aa' },
  blue:   { stroke: '#60a5fa', fill: '#bfdbfe' },
  green:  { stroke: '#4ade80', fill: '#bbf7d0' },
  yellow: { stroke: '#facc15', fill: '#fef08a' },
};

const drawCirclePath = (ctx: CanvasRenderingContext2D, x: number, y: number, size: number) => { ctx.arc(x, y, size, 0, 2 * Math.PI); };
const drawSquarePath = (ctx: CanvasRenderingContext2D, x: number, y: number, size: number) => { ctx.rect(x - size, y - size, size * 2, size * 2); };
const HEX_COS = Array.from({ length: 6 }, (_, i) => Math.cos((Math.PI / 3) * i - Math.PI / 6));
const HEX_SIN = Array.from({ length: 6 }, (_, i) => Math.sin((Math.PI / 3) * i - Math.PI / 6));
const drawHexagonPath = (ctx: CanvasRenderingContext2D, x: number, y: number, size: number) => {
  ctx.moveTo(x + size * HEX_COS[0], y + size * HEX_SIN[0]);
  for (let i = 1; i < 6; i++) ctx.lineTo(x + size * HEX_COS[i], y + size * HEX_SIN[i]);
  ctx.closePath();
};
const SQRT3 = Math.sqrt(3);
const drawTrianglePath = (ctx: CanvasRenderingContext2D, x: number, y: number, size: number) => {
  const h = size * SQRT3;
  ctx.moveTo(x, y - h / 2);
  ctx.lineTo(x + size, y + h / 2);
  ctx.lineTo(x - size, y + h / 2);
  ctx.closePath();
};
const drawNodePath = (ctx: CanvasRenderingContext2D, x: number, y: number, size: number, shape: NodeShape) => {
  ctx.beginPath();
  switch (shape) {
    case 'square': drawSquarePath(ctx, x, y, size); break;
    case 'hexagon': drawHexagonPath(ctx, x, y, size); break;
    case 'triangle': drawTrianglePath(ctx, x, y, size); break;
    default: drawCirclePath(ctx, x, y, size);
  }
};

const getNodeVisual = (node: GraphNode, iconColor: string) => {
  if (node.nodeImage) {
    const img = getCachedExternalImage(node.nodeImage);
    if (img?.complete) return { image: img, isExternal: true };
  }
  if (node.nodeIcon) {
    const img = getCachedIconByName(node.nodeIcon, iconColor);
    if (img?.complete) return { image: img, isExternal: false };
  }
  if (node.nodeType) {
    const img = getCachedImage(node.nodeType, iconColor);
    if (img?.complete) return { image: img, isExternal: false };
  }
  return null;
};

export interface NodeRenderParams {
  node: GraphNode;
  ctx: CanvasRenderingContext2D;
  globalScale: number;
  forceSettings: any;
  showLabels: boolean;
  showIcons: boolean;
  isCurrent: (id: string) => boolean;
  isSelected: (id: string) => boolean;
  theme: string;
  highlightNodes: Set<string>;
  highlightLinks: Set<string>;
  hoverNode: string | null;
  rc: RenderContext;
}

export const renderNode = (params: NodeRenderParams) => {
  if (!isInViewport(params.node.x, params.node.y, params.ctx)) return;
  renderDotNode(params);
};

const renderDotNode = (params: NodeRenderParams) => {
  const { node, ctx, forceSettings, showLabels, showIcons, isCurrent, isSelected, theme, highlightNodes, hoverNode, rc } = params;
  const size = calculateNodeSize(node, forceSettings, rc.shouldRenderDetails, CONSTANTS.ZOOMED_OUT_SIZE_MULTIPLIER);
  const isHighlighted = highlightNodes.has(node.id) || isSelected(node.id) || isCurrent(node.id);
  const isHovered = hoverNode === node.id || isCurrent(node.id);
  const shape: NodeShape = node.nodeShape ?? 'circle';

  if (isHighlighted) {
    const border = 3 / rc.globalScale;
    drawNodePath(ctx, node.x, node.y, size + border, shape);
    ctx.fillStyle = isHovered ? GRAPH_COLORS.NODE_HIGHLIGHT_HOVER : GRAPH_COLORS.NODE_HIGHLIGHT_DEFAULT;
    ctx.fill();
  }

  const nodeColor = rc.hasAnyHighlight
    ? isHighlighted ? node.nodeColor! : getDimmedColor(rc, node.nodeColor!)
    : node.nodeColor!;

  const isOutlined = forceSettings?.nodeOutlined?.value ?? false;
  drawNodePath(ctx, node.x, node.y, size, shape);
  if (isOutlined) {
    ctx.fillStyle = rc.themeBgFill;
    ctx.fill();
    ctx.strokeStyle = nodeColor;
    ctx.lineWidth = Math.max(2, size * 0.02) / rc.globalScale;
    ctx.stroke();
  } else {
    ctx.fillStyle = nodeColor;
    ctx.fill();
    ctx.strokeStyle = rc.themeSubtleBorder;
    ctx.lineWidth = 0.3;
    ctx.stroke();
  }

  if (node.nodeFlag) {
    const fc = FLAG_COLORS[node.nodeFlag];
    if (fc) {
      const img = getCachedFlagImage(fc.stroke, fc.fill);
      if (img?.complete) {
        const fs = size * 0.8;
        const prev = ctx.globalAlpha;
        ctx.globalAlpha = 1;
        ctx.drawImage(img, node.x + 0.8 + size * 0.5 - fs / 2, node.y - 1.4 - size * 0.5 - fs / 2, fs, fs);
        ctx.globalAlpha = prev;
      }
    }
  }

  if (!rc.shouldRenderDetails) {
    const mw = 15, mh = 3, mx = node.x - mw / 2, my = node.y + size + mh * 0.5;
    ctx.beginPath();
    ctx.roundRect(mx, my, mw, mh, mh * 0.3);
    ctx.fillStyle = rc.themeMockLabelFill;
    ctx.fill();
    return;
  }

  if (showIcons) {
    const iconColor = isOutlined ? (theme === 'dark' ? '#FFFFFF' : '#000000') : '#FFFFFF';
    const visual = getNodeVisual(node, iconColor);
    if (visual) {
      const iconAlpha = rc.hasAnyHighlight && !isHighlighted ? 0.5 : 0.9;
      const prev = ctx.globalAlpha;
      ctx.globalAlpha = iconAlpha;
      if (visual.isExternal) {
        const is = size * 0.9;
        drawNodePath(ctx, node.x, node.y, is, shape);
        ctx.clip();
        ctx.drawImage(visual.image, node.x - is, node.y - is, is * 2, is * 2);
      } else {
        const is = size * 1.2;
        ctx.drawImage(visual.image, node.x - is / 2, node.y - is / 2, is, is);
      }
      ctx.globalAlpha = prev;
    }
  }

  if (showLabels) {
    const label = truncateText(node.nodeLabel || node.id, 58);
    if (!label) return;
    const fontSize = Math.max(CONSTANTS.MIN_FONT_SIZE, (CONSTANTS.NODE_FONT_SIZE * (size / 2)) / rc.globalScale + 2) * ((forceSettings?.nodeLabelFontSize?.value ?? 50) / 100);
    ctx.font = `${fontSize}px Sans-Serif`;
    const tw = ctx.measureText(label).width;
    const px = fontSize * 0.4, py = fontSize * 0.25;
    const bw = tw + px * 2, bh = fontSize + py * 2;
    const by = node.y + size / 2 + fontSize * 0.6, bx = node.x - bw / 2;
    ctx.beginPath();
    ctx.roundRect(bx, by, bw, bh, fontSize * 0.3);
    ctx.fillStyle = isHighlighted ? rc.themeLabelBgHighlighted : rc.themeLabelBg;
    ctx.fill();
    ctx.strokeStyle = rc.themeLabelBorder;
    ctx.lineWidth = 0.1;
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = isHighlighted ? rc.themeTextColor : `${rc.themeTextColor}CC`;
    const m = ctx.measureText(label);
    ctx.fillText(label, node.x, by + py + m.actualBoundingBoxAscent);
  }
};

// Shape edge distance for link/arrow positioning
const squareEdge = (a: number, s: number) => {
  const ac = Math.abs(Math.cos(a)), as_ = Math.abs(Math.sin(a));
  if (ac < 1e-6) return s;
  if (as_ < 1e-6) return s;
  return Math.min(s / ac, s / as_);
};
const hexEdge = (a: number, s: number) => {
  const apothem = (s * SQRT3) / 2;
  const aa = ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  const sc = Math.round(aa / (Math.PI / 3)) * (Math.PI / 3);
  return apothem / Math.cos(aa - sc);
};
const triEdge = (a: number, s: number) => {
  const h = s * SQRT3;
  const verts = [{ x: 0, y: -h / 2 }, { x: s, y: h / 2 }, { x: -s, y: h / 2 }];
  const dx = Math.cos(a), dy = Math.sin(a);
  let min = Infinity;
  for (let i = 0; i < 3; i++) {
    const v1 = verts[i], v2 = verts[(i + 1) % 3];
    const ex = v2.x - v1.x, ey = v2.y - v1.y;
    const d = dx * ey - dy * ex;
    if (Math.abs(d) < 1e-10) continue;
    const t = (v1.x * ey - v1.y * ex) / d;
    const ss = (v1.x * dy - v1.y * dx) / d;
    if (t > 0 && ss >= 0 && ss <= 1) min = Math.min(min, t);
  }
  return min === Infinity ? s : min;
};

export const getNodeEdgeDistance = (node: any, angle: number, forceSettings: any, _ctx: CanvasRenderingContext2D, shouldRenderDetails: boolean): number => {
  const size = calculateNodeSize(node, forceSettings, shouldRenderDetails, CONSTANTS.ZOOMED_OUT_SIZE_MULTIPLIER);
  const shape: NodeShape = node.nodeShape ?? 'circle';
  switch (shape) {
    case 'square': return squareEdge(angle, size);
    case 'hexagon': return hexEdge(angle, size);
    case 'triangle': return triEdge(angle, size);
    default: return size;
  }
};
