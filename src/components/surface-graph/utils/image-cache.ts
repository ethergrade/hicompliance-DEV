// Simplified image cache for surface-graph icons
// Uses Lucide icon names to generate SVG data URLs

import { NODE_TYPE_ICONS, NODE_TYPE_COLORS } from '@/types/surface-graph';

const imageCache = new Map<string, HTMLImageElement>();
const loadPromises = new Map<string, Promise<HTMLImageElement>>();

// Map Lucide icon names to simple SVG paths
const ICON_PATHS: Record<string, string> = {
  Globe:        '<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
  Globe2:       '<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
  Link:         '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  Server:       '<rect x="2" y="2" width="20" height="8" rx="2" ry="2"/><rect x="2" y="14" width="20" height="8" rx="2" ry="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/>',
  Network:      '<rect x="16" y="16" width="6" height="6" rx="1"/><rect x="2" y="16" width="6" height="6" rx="1"/><rect x="9" y="2" width="6" height="6" rx="1"/><path d="M5 16v-3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3"/><line x1="12" y1="12" x2="12" y2="8"/>',
  Mail:         '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
  Plug:         '<path d="M12 22v-5"/><path d="M9 8V2"/><path d="M15 8V2"/><path d="M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8z"/>',
  Shield:       '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  ShieldAlert:  '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>',
  FileText:     '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>',
  Key:          '<circle cx="7.5" cy="15.5" r="5.5"/><path d="M21 2 9 14"/><path d="m15 8 3 3"/>',
  AlertTriangle:'<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
  Droplets:     '<path d="M7 16.3c2.2 0 4-1.83 4-4.05 0-1.16-.57-2.26-1.71-3.19S7.29 6.75 7 5.3c-.29 1.45-1.14 2.84-2.29 3.76S3 11.1 3 12.25c0 2.22 1.8 4.05 4 4.05z"/><path d="M12.56 6.6A10.97 10.97 0 0 0 14 3.02c.5 2.5 2 4.9 4 6.5s3 3.5 3 5.5a6.98 6.98 0 0 1-11.91 4.97"/>',
  Building2:    '<path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/><line x1="10" y1="6" x2="10" y2="6.01"/><line x1="14" y1="6" x2="14" y2="6.01"/><line x1="10" y1="10" x2="10" y2="10.01"/><line x1="14" y1="10" x2="14" y2="10.01"/><line x1="10" y1="14" x2="10" y2="14.01"/><line x1="14" y1="14" x2="14" y2="14.01"/>',
  MapPin:       '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
  Bug:          '<rect x="8" y="6" width="8" height="14" rx="4"/><path d="m19 7-3 2"/><path d="m5 7 3 2"/><path d="m19 19-3-2"/><path d="m5 19 3-2"/><path d="M20 13h-4"/><path d="M4 13h4"/><path d="m10 4 1 2"/><path d="m14 4-1 2"/>',
  Cpu:          '<rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/><line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/><line x1="20" y1="9" x2="23" y2="9"/><line x1="20" y1="14" x2="23" y2="14"/><line x1="1" y1="9" x2="4" y2="9"/><line x1="1" y1="14" x2="4" y2="14"/>',
  Circle:       '<circle cx="12" cy="12" r="10"/>',
};

function svgDataUrl(iconName: string, color: string): string {
  const path = ICON_PATHS[iconName] || ICON_PATHS.Circle;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
  const b64 = btoa(unescape(encodeURIComponent(svg)));
  return `data:image/svg+xml;base64,${b64}`;
}

function loadImage(src: string, key: string): Promise<HTMLImageElement> {
  if (imageCache.has(key)) return Promise.resolve(imageCache.get(key)!);
  if (loadPromises.has(key)) return loadPromises.get(key)!;
  const p = new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => { imageCache.set(key, img); loadPromises.delete(key); resolve(img); };
    img.onerror = () => { loadPromises.delete(key); reject(new Error(`Failed: ${key}`)); };
    img.src = src;
  });
  loadPromises.set(key, p);
  return p;
}

export const preloadImage = (nodeType: string, color = '#FFFFFF'): Promise<HTMLImageElement> => {
  const iconName = NODE_TYPE_ICONS[nodeType] ?? 'Circle';
  return loadImage(svgDataUrl(iconName, color), `${nodeType}-${color}`);
};

export const getCachedImage = (nodeType: string, color = '#FFFFFF'): HTMLImageElement | undefined =>
  imageCache.get(`${nodeType}-${color}`);

export const preloadIconByName = (iconName: string, color = '#FFFFFF'): Promise<HTMLImageElement> =>
  loadImage(svgDataUrl(iconName, color), `icon-${iconName}-${color}`);

export const getCachedIconByName = (iconName: string, color = '#FFFFFF'): HTMLImageElement | undefined =>
  imageCache.get(`icon-${iconName}-${color}`);

export const preloadExternalImage = (url: string): Promise<HTMLImageElement> => {
  const key = `ext-${url}`;
  if (imageCache.has(key)) return Promise.resolve(imageCache.get(key)!);
  if (loadPromises.has(key)) return loadPromises.get(key)!;
  const p = new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => { imageCache.set(key, img); loadPromises.delete(key); resolve(img); };
    img.onerror = () => { loadPromises.delete(key); reject(); };
    img.src = url;
  });
  loadPromises.set(key, p);
  return p;
};

export const getCachedExternalImage = (url: string): HTMLImageElement | undefined =>
  imageCache.get(`ext-${url}`);

const FLAG_SVG = (stroke: string, fill: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" fill="${fill}" stroke="${stroke}"/><line x1="4" x2="4" y1="22" y2="15" stroke="${stroke}" fill="none"/></svg>`;

export const preloadFlagImage = (stroke: string, fill: string): Promise<HTMLImageElement> => {
  const key = `flag-${stroke}-${fill}`;
  const b64 = btoa(unescape(encodeURIComponent(FLAG_SVG(stroke, fill))));
  return loadImage(`data:image/svg+xml;base64,${b64}`, key);
};

export const getCachedFlagImage = (stroke: string, fill: string): HTMLImageElement | undefined =>
  imageCache.get(`flag-${stroke}-${fill}`);
