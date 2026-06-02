import { CONSTANTS, GRAPH_COLORS } from './constants';

export interface RenderContext {
  hasAnyHighlight: boolean;
  shouldRenderDetails: boolean;
  globalScale: number;
  selectedEdgeIds: Set<string>;
  themeBgFill: string;
  themeSubtleBorder: string;
  themeMockLabelFill: string;
  themeLabelBg: string;
  themeLabelBgHighlighted: string;
  themeLabelBorder: string;
  themeTextColor: string;
  themeEdgeLabelBg: string;
  dimmedColorCache: Map<string, string>;
}

export const createRenderContext = (
  globalScale: number,
  highlightNodes: Set<string>,
  highlightLinks: Set<string>,
  selectedEdges: { id: string }[],
  theme: string,
): RenderContext => {
  const isLight = theme === 'light';
  return {
    hasAnyHighlight: highlightNodes.size > 0 || highlightLinks.size > 0,
    shouldRenderDetails: globalScale > CONSTANTS.ZOOM_NODE_DETAIL_THRESHOLD,
    globalScale,
    selectedEdgeIds: new Set(selectedEdges.map((e) => e.id)),
    themeBgFill: isLight ? '#FFFFFF' : '#1a1a1a',
    themeSubtleBorder: isLight ? 'rgba(44,44,44,0.19)' : 'rgba(222,222,222,0.13)',
    themeMockLabelFill: isLight ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.15)',
    themeLabelBg: isLight ? 'rgba(255,255,255,0.75)' : 'rgba(32,32,32,0.75)',
    themeLabelBgHighlighted: isLight ? 'rgba(255,255,255,0.95)' : 'rgba(32,32,32,0.95)',
    themeLabelBorder: isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)',
    themeTextColor: isLight ? GRAPH_COLORS.TEXT_LIGHT : GRAPH_COLORS.TEXT_DARK,
    themeEdgeLabelBg: isLight ? 'rgba(255,255,255,0.95)' : 'rgba(32,32,32,0.95)',
    dimmedColorCache: new Map(),
  };
};

export const getDimmedColor = (rc: RenderContext, color: string): string => {
  let d = rc.dimmedColorCache.get(color);
  if (!d) { d = `${color}7D`; rc.dimmedColorCache.set(color, d); }
  return d;
};

export const isInViewport = (x: number, y: number, ctx: CanvasRenderingContext2D, margin = 80): boolean => {
  const t = ctx.getTransform();
  const sx = x * t.a + t.e;
  const sy = y * t.d + t.f;
  return sx >= -margin && sx <= ctx.canvas.width + margin && sy >= -margin && sy <= ctx.canvas.height + margin;
};

export const isEdgeInViewport = (
  sx: number, sy: number, ex: number, ey: number,
  ctx: CanvasRenderingContext2D, margin = 80,
): boolean => {
  const t = ctx.getTransform();
  const cw = ctx.canvas.width, ch = ctx.canvas.height;
  const screenSX = sx * t.a + t.e, screenSY = sy * t.d + t.f;
  if (screenSX >= -margin && screenSX <= cw + margin && screenSY >= -margin && screenSY <= ch + margin) return true;
  const screenEX = ex * t.a + t.e, screenEY = ey * t.d + t.f;
  if (screenEX >= -margin && screenEX <= cw + margin && screenEY >= -margin && screenEY <= ch + margin) return true;
  const minX = Math.min(screenSX, screenEX), maxX = Math.max(screenSX, screenEX);
  const minY = Math.min(screenSY, screenEY), maxY = Math.max(screenSY, screenEY);
  return !(maxX < -margin || minX > cw + margin || maxY < -margin || minY > ch + margin);
};
