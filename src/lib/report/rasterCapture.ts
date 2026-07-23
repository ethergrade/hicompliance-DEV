import html2canvas from "html2canvas";

/**
 * Parametri di rasterizzazione dei blocchi report.
 *
 * È l'unico punto da toccare per il trade-off qualità/peso del PDF.
 * Il peso finale scala con `targetDpi²` (i pixel del canvas) e con `quality`.
 *
 * Riferimento sui default:
 *   - i blocchi sono larghi 900 px CSS e vengono piazzati su 186 mm (A4 meno i
 *     margini): a `scale: 2` la risoluzione effettiva era ~246 DPI, molto oltre
 *     il necessario per un report letto a schermo o stampato in ufficio;
 *   - PNG è lossless e su tabelle/grafici lunghi produce file enormi. JPEG con
 *     sfondo bianco opaco pesa circa 3-4× meno a parità di pixel.
 */
export const RASTER_DEFAULTS = {
  /** DPI effettivi dell'immagine una volta piazzata sulla pagina. 150 = qualità stampa ufficio. */
  targetDpi: 150,
  /** Limiti di sicurezza sul fattore di scala passato a html2canvas. */
  minScale: 1,
  maxScale: 2,
  /** "image/jpeg" (lossy, molto più leggero) oppure "image/png" (lossless). */
  mimeType: "image/jpeg" as "image/jpeg" | "image/png",
  /** Qualità JPEG 0-1. Ignorata se mimeType è png. 0.82 è il ginocchio della curva. */
  quality: 0.82,
  /**
   * Tetto ai pixel totali del canvas. Oltre ~268 MP Chrome/Safari restituiscono
   * un canvas vuoto senza errori: la scala viene ridotta per restare sotto.
   */
  maxCanvasPixels: 40_000_000,
};

export type RasterOptions = typeof RASTER_DEFAULTS;

export interface CapturedImage {
  /** Data URL pronta per doc.addImage. */
  data: string;
  /** Formato da passare come secondo argomento di doc.addImage. */
  format: "JPEG" | "PNG";
  width: number;
  height: number;
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

/**
 * Calcola il fattore di scala html2canvas per ottenere `targetDpi` una volta che
 * il blocco è disegnato largo `renderWidthMm` sulla pagina, rispettando il tetto
 * di pixel del canvas.
 */
export function computeCaptureScale(
  element: HTMLElement,
  renderWidthMm: number,
  options: RasterOptions = RASTER_DEFAULTS,
): number {
  const cssWidth = element.scrollWidth || element.offsetWidth || 900;
  const cssHeight = element.scrollHeight || element.offsetHeight || 1;

  const renderWidthInches = renderWidthMm / 25.4;
  const idealPixelWidth = options.targetDpi * renderWidthInches;

  let scale = clamp(idealPixelWidth / cssWidth, options.minScale, options.maxScale);

  const projectedPixels = cssWidth * scale * cssHeight * scale;
  if (projectedPixels > options.maxCanvasPixels) {
    scale = Math.max(0.5, scale * Math.sqrt(options.maxCanvasPixels / projectedPixels));
  }

  return scale;
}

/**
 * Cattura un elemento DOM come immagine pronta per jsPDF, con scala e
 * compressione calcolate dai parametri sopra.
 */
export async function captureElement(
  element: HTMLElement,
  renderWidthMm: number,
  options: RasterOptions = RASTER_DEFAULTS,
): Promise<CapturedImage> {
  const scale = computeCaptureScale(element, renderWidthMm, options);

  const canvas = await html2canvas(element, {
    scale,
    useCORS: true,
    // Sfondo opaco obbligatorio: JPEG non ha canale alpha e senza questo il
    // trasparente diventa nero.
    backgroundColor: "#ffffff",
    logging: false,
  });

  const isJpeg = options.mimeType === "image/jpeg";

  return {
    data: isJpeg
      ? canvas.toDataURL("image/jpeg", options.quality)
      : canvas.toDataURL("image/png"),
    format: isJpeg ? "JPEG" : "PNG",
    width: canvas.width,
    height: canvas.height,
  };
}
