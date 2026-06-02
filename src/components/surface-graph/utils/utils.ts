import { CONSTANTS } from './constants';

export function truncateText(text: string, limit = 16): string {
  if (text.length <= limit) return text;
  return text.substring(0, limit) + '...';
}

export function calculateNodeSize(
  node: any,
  forceSettings: any,
  shouldRenderDetails: boolean,
  zoomedOutMultiplier = 0.6,
): number {
  const nodeSizeValue = forceSettings?.nodeSize?.value ?? 1;
  const nodeWeightMultiplierSize = forceSettings?.nodeWeightMultiplierSize?.value ?? 1.5;
  const sizeMultiplier = nodeSizeValue / 100 + 0.2;
  const neighborBonus = Math.min((node.neighbors?.length || 0) / 5, 8) * nodeWeightMultiplierSize;
  const baseSize = (node.nodeSize + neighborBonus) * sizeMultiplier;
  return shouldRenderDetails ? baseSize : baseSize * zoomedOutMultiplier;
}
