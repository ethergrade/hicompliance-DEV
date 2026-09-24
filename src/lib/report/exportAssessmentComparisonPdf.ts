import jsPDF from 'jspdf';

export interface ComparisonRow {
  name: string;
  previous: number;
  current: number;
  delta: number;
}

export interface ComparisonReportInput {
  organizationName: string;
  fromTitle: string;
  toTitle: string;
  fromScore: number;
  toScore: number;
  rows: ComparisonRow[];
}

// Stessa palette della legenda a schermo
const GREY: [number, number, number] = [148, 153, 163];
const GREEN: [number, number, number] = [34, 197, 94];
const RED: [number, number, number] = [220, 38, 38];
const VIOLET: [number, number, number] = [99, 102, 241];
const TEXT: [number, number, number] = [30, 30, 40];
const MUTED: [number, number, number] = [110, 110, 120];

const colorFor = (d: number) => (d > 0 ? GREEN : d < 0 ? RED : VIOLET);
const statusFor = (d: number) => (d > 0 ? 'Migliorata' : d < 0 ? 'Peggiorata' : 'Stabile');
const signed = (d: number) => `${d > 0 ? '+' : ''}${d}`;

export function exportAssessmentComparisonPdf(input: ComparisonReportInput) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210, M = 16, H = 297;
  let y = M;

  const ensure = (h: number) => {
    if (y + h > H - M) { doc.addPage(); y = M; }
  };

  // Intestazione
  doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.setTextColor(...TEXT);
  doc.text('Report di confronto Assessment', M, y + 6); y += 14;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...MUTED);
  doc.text(`Cliente: ${input.organizationName}`, M, y); y += 5;
  doc.text(`Confronto: ${input.fromTitle}  ->  ${input.toTitle}`, M, y); y += 5;
  doc.text(`Generato il ${new Date().toLocaleDateString('it-IT')}`, M, y); y += 10;

  // Punteggio globale
  const delta = input.toScore - input.fromScore;
  doc.setDrawColor(220, 220, 228); doc.roundedRect(M, y, W - 2 * M, 22, 3, 3);
  doc.setFontSize(9); doc.setTextColor(...MUTED); doc.text('Punteggio globale', M + 5, y + 7);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.setTextColor(...TEXT);
  doc.text(`${input.toScore}/100`, M + 5, y + 17);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...MUTED);
  doc.text(`da ${input.fromScore}/100`, M + 36, y + 17);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.setTextColor(...colorFor(delta));
  doc.text(signed(delta), W - M - 5, y + 16, { align: 'right' });
  y += 30;

  // Legenda
  const legend: [string, [number, number, number]][] = [
    [`Partenza (${input.fromTitle})`, GREY], ['Migliorata', GREEN], ['Peggiorata', RED], ['Stabile', VIOLET],
  ];
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  let lx = M;
  legend.forEach(([label, c]) => {
    doc.setFillColor(...c); doc.rect(lx, y - 3, 4, 4, 'F');
    doc.setTextColor(...TEXT); doc.text(label, lx + 6, y);
    lx += doc.getTextWidth(label) + 14;
  });
  y += 10;

  // Grafico a barre
  doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(...TEXT);
  doc.text('Variazione per categoria', M, y); y += 7;
  const labelW = 58, chartX = M + labelW, chartW = W - M - chartX - 12;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
  input.rows.forEach((r) => {
    ensure(10);
    doc.setTextColor(...TEXT);
    const name = doc.splitTextToSize(r.name, labelW - 3)[0];
    doc.text(name, M, y + 3.5);
    doc.setFillColor(238, 238, 242); doc.rect(chartX, y, chartW, 2.6, 'F'); doc.rect(chartX, y + 3.4, chartW, 2.6, 'F');
    doc.setFillColor(...GREY); doc.rect(chartX, y, (chartW * r.previous) / 100, 2.6, 'F');
    doc.setFillColor(...colorFor(r.delta)); doc.rect(chartX, y + 3.4, (chartW * r.current) / 100, 2.6, 'F');
    doc.setTextColor(...colorFor(r.delta)); doc.text(signed(r.delta), W - M, y + 4.5, { align: 'right' });
    y += 9;
  });
  y += 6;

  // Tabella
  ensure(20);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(...TEXT);
  doc.text('Dettaglio per categoria', M, y); y += 7;
  const cols = [M, M + 92, M + 116, M + 140, M + 158];
  const header = () => {
    doc.setFillColor(243, 244, 248); doc.rect(M, y - 4.5, W - 2 * M, 7, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(...MUTED);
    ['Categoria', 'Da', 'A', 'Var.', 'Stato'].forEach((h, i) => doc.text(h, cols[i] + 1, y));
    y += 7;
  };
  header();
  doc.setFont('helvetica', 'normal');
  input.rows.forEach((r) => {
    const lines = doc.splitTextToSize(r.name, 88);
    const h = lines.length * 4 + 3;
    if (y + h > H - M) { doc.addPage(); y = M + 5; header(); doc.setFont('helvetica', 'normal'); }
    doc.setFontSize(8.5); doc.setTextColor(...TEXT);
    doc.text(lines, cols[0] + 1, y);
    doc.text(`${r.previous}`, cols[1] + 1, y);
    doc.text(`${r.current}`, cols[2] + 1, y);
    doc.setTextColor(...colorFor(r.delta));
    doc.text(signed(r.delta), cols[3] + 1, y);
    doc.text(statusFor(r.delta), cols[4] + 1, y);
    doc.setDrawColor(232, 232, 238); doc.line(M, y + h - 4, W - M, y + h - 4);
    y += h;
  });
  y += 6;

  // Miglioramenti e aree critiche
  const gains = [...input.rows].filter((r) => r.delta > 0).sort((a, b) => b.delta - a.delta).slice(0, 5);
  const critical = criticalAreas(input.rows).slice(0, 5);
  const list = (title: string, items: ComparisonRow[], empty: string, value: (r: ComparisonRow) => string) => {
    ensure(14 + items.length * 6);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...TEXT);
    doc.text(title, M, y); y += 6;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
    if (!items.length) { doc.setTextColor(...MUTED); doc.text(empty, M, y); y += 6; }
    items.forEach((r) => {
      doc.setTextColor(...TEXT); doc.text(doc.splitTextToSize(r.name, 140)[0], M, y);
      doc.setTextColor(...colorFor(r.delta)); doc.text(value(r), W - M, y, { align: 'right' });
      y += 6;
    });
    y += 4;
  };
  list('Migliori miglioramenti', gains, 'Nessuna categoria migliorata.', (r) => signed(r.delta));
  list('Aree critiche', critical, 'Nessuna area critica.', (r) => `${r.current}/100 (${signed(r.delta)})`);

  doc.setFontSize(7.5); doc.setTextColor(...MUTED);
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.text(`${input.organizationName} · Confronto assessment · pagina ${i}/${pages}`, W / 2, H - 8, { align: 'center' });
  }

  const safe = input.organizationName.replace(/[^a-z0-9]+/gi, '_');
  doc.save(`Confronto_Assessment_${safe}.pdf`);
}

/** Categorie peggiorate prima, poi quelle con punteggio più basso (< 50). */
export function criticalAreas(rows: ComparisonRow[]) {
  const worse = rows.filter((r) => r.delta < 0).sort((a, b) => a.delta - b.delta);
  const low = rows.filter((r) => r.delta >= 0 && r.current < 50).sort((a, b) => a.current - b.current);
  return [...worse, ...low];
}
