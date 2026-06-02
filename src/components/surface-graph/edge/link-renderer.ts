// Edge/link renderer — ported from Flowsint link-renderer.ts
import { CONSTANTS, GRAPH_COLORS, tempPos, tempDimensions } from '../utils/constants';
import { getNodeEdgeDistance } from '../node/node-renderer';
import { RenderContext, isEdgeInViewport } from '../utils/render-context';

export interface LinkRenderParams {
  link: any;
  ctx: CanvasRenderingContext2D;
  globalScale: number;
  forceSettings: any;
  theme: string;
  highlightLinks: Set<string>;
  highlightNodes: Set<string>;
  selectedEdges: any[];
  currentEdge: any;
  autoColorLinksByNodeType?: boolean;
  rc: RenderContext;
}

export const renderLink = ({ link, ctx, forceSettings, highlightLinks, currentEdge, autoColorLinksByNodeType, rc }: LinkRenderParams) => {
  if (rc.globalScale < CONSTANTS.ZOOM_EDGE_DETAIL_THRESHOLD) return;
  const { source: start, target: end } = link;
  if (typeof start !== 'object' || typeof end !== 'object') return;
  if (!isEdgeInViewport(start.x, start.y, end.x, end.y, ctx)) return;

  const linkKey = `${start.id}-${end.id}`;
  const isHighlighted = highlightLinks.has(linkKey);
  const isSelected = rc.selectedEdgeIds.has(link.id);
  const isCurrent = currentEdge?.id === link.id;
  const linkWidthBase = forceSettings?.linkWidth?.value ?? 2;
  const linkWidth = rc.shouldRenderDetails ? linkWidthBase : linkWidthBase * CONSTANTS.ZOOMED_OUT_SIZE_MULTIPLIER;
  const targetNodeColor = autoColorLinksByNodeType ? end.nodeColor || GRAPH_COLORS.LINK_DEFAULT : GRAPH_COLORS.LINK_DEFAULT;

  let strokeStyle: string, lineWidth: number;
  if (isCurrent) { strokeStyle = 'rgba(59, 130, 246, 0.95)'; lineWidth = CONSTANTS.LINK_WIDTH * (linkWidth / 2.3); }
  else if (isSelected) { strokeStyle = autoColorLinksByNodeType ? targetNodeColor : GRAPH_COLORS.LINK_HIGHLIGHTED; lineWidth = CONSTANTS.LINK_WIDTH * (linkWidth / 2.5); }
  else if (isHighlighted) { strokeStyle = GRAPH_COLORS.LINK_HIGHLIGHTED; lineWidth = CONSTANTS.LINK_WIDTH * (linkWidth / 3); }
  else if (rc.hasAnyHighlight) { strokeStyle = GRAPH_COLORS.LINK_DIMMED; lineWidth = CONSTANTS.LINK_WIDTH * (linkWidth / 5); }
  else { strokeStyle = autoColorLinksByNodeType ? targetNodeColor : GRAPH_COLORS.LINK_DEFAULT; lineWidth = CONSTANTS.LINK_WIDTH * (linkWidth / 5); }

  const arrowLengthSetting = forceSettings?.linkDirectionalArrowLength?.value ?? 3.5;
  const arrowLength = rc.shouldRenderDetails ? arrowLengthSetting : arrowLengthSetting * CONSTANTS.ZOOMED_OUT_SIZE_MULTIPLIER;

  const curvature: number = link.curvature || 0;
  const dx = end.x - start.x, dy = end.y - start.y;
  const dist = Math.sqrt(dx * dx + dy * dy) || 1;
  const midX = (start.x + end.x) * 0.5, midY = (start.y + end.y) * 0.5;
  const nx = -dy / dist, ny = dx / dist;
  const offset = curvature * dist;
  const ctrlX = midX + nx * offset, ctrlY = midY + ny * offset;
  const isCurved = curvature !== 0;

  const stX = isCurved ? ctrlX - start.x : dx, stY = isCurved ? ctrlY - start.y : dy;
  const etX = isCurved ? end.x - ctrlX : dx, etY = isCurved ? end.y - ctrlY : dy;
  const stLen = Math.hypot(stX, stY) || 1, etLen = Math.hypot(etX, etY) || 1;
  const startAngle = Math.atan2(stY, stX), endAngle = Math.atan2(etY, etX);

  const startDist = getNodeEdgeDistance(start, startAngle, forceSettings, ctx, rc.shouldRenderDetails);
  const endDist = getNodeEdgeDistance(end, endAngle + Math.PI, forceSettings, ctx, rc.shouldRenderDetails);

  const asx = start.x + (stX / stLen) * startDist, asy = start.y + (stY / stLen) * startDist;
  const aex = end.x - (etX / etLen) * (endDist + arrowLength), aey = end.y - (etY / etLen) * (endDist + arrowLength);

  ctx.beginPath();
  ctx.moveTo(asx, asy);
  if (isCurved) ctx.quadraticCurveTo(ctrlX, ctrlY, aex, aey);
  else ctx.lineTo(aex, aey);
  ctx.strokeStyle = strokeStyle;
  ctx.lineWidth = lineWidth;
  ctx.stroke();

  if (arrowLength > 0) {
    const ex2 = isCurved ? 2 * (aex - ctrlX) : dx, ey2 = isCurved ? 2 * (aey - ctrlY) : dy;
    const angle = Math.atan2(ey2, ex2);
    ctx.save();
    ctx.translate(aex, aey);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.moveTo(arrowLength, 0);
    ctx.lineTo(0, -arrowLength * 0.5);
    ctx.lineTo(0, arrowLength * 0.5);
    ctx.closePath();
    ctx.fillStyle = strokeStyle;
    ctx.fill();
    ctx.restore();
  }

  if (!link.label || !isHighlighted || rc.globalScale <= CONSTANTS.ZOOM_EDGE_DETAIL_THRESHOLD) return;

  const lfs = CONSTANTS.LABEL_FONT_SIZE * ((forceSettings?.linkLabelFontSize?.value ?? 60) / 100);
  ctx.font = `${lfs}px Sans-Serif`;
  const metrics = ctx.measureText(link.label);
  const tw = metrics.width, pd = lfs * CONSTANTS.PADDING_RATIO;
  tempDimensions[0] = tw + pd; tempDimensions[1] = lfs + pd;
  const hW = tempDimensions[0] * 0.5, hH = tempDimensions[1] * 0.5;

  if (isCurved) {
    tempPos.x = 0.25 * asx + 0.5 * ctrlX + 0.25 * aex;
    tempPos.y = 0.25 * asy + 0.5 * ctrlY + 0.25 * aey;
  } else {
    tempPos.x = (asx + aex) * 0.5;
    tempPos.y = (asy + aey) * 0.5;
  }
  let textAngle = Math.atan2(aey - asy, aex - asx);
  if (textAngle > CONSTANTS.HALF_PI || textAngle < -CONSTANTS.HALF_PI) textAngle += textAngle > 0 ? -CONSTANTS.PI : CONSTANTS.PI;

  ctx.save();
  ctx.translate(tempPos.x, tempPos.y);
  ctx.rotate(textAngle);
  ctx.beginPath();
  ctx.roundRect(-hW, -hH, tempDimensions[0], tempDimensions[1], lfs * 0.1);
  ctx.fillStyle = rc.themeEdgeLabelBg;
  ctx.fill();
  ctx.fillStyle = GRAPH_COLORS.LINK_LABEL_HIGHLIGHTED;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(link.label, 0, metrics.actualBoundingBoxAscent * 0.5 - metrics.actualBoundingBoxDescent * 0.5);
  ctx.restore();
};
