import jsPDF from 'jspdf';
import {
  ASSESSMENT_CATEGORIES,
  AssessmentCategory,
  AssessmentResponse,
  calculateCategoryScore,
  getRiskFromScore,
  RESPONSE_LABELS,
  CATEGORY_DESCRIPTIONS,
} from '@/data/assessmentQuestions';

interface AssessmentReportData {
  responses: Record<number, AssessmentResponse>;
  companyName?: string;
  /** v2Categories from the backend — used instead of the static ASSESSMENT_CATEGORIES
   *  so question counts and visibility logic match the view exactly. */
  categories?: AssessmentCategory[];
  /** Se fornito, compone dentro questo doc invece di crearne uno nuovo
   *  (usato dal report completo per unire assessment + altre sezioni). */
  doc?: jsPDF;
  /** Default true: applica footer e salva/scarica. Impostare false in composizione. */
  save?: boolean;
  /**
   * Snapshot dell'anno precedente per la sezione di confronto.
   *
   * Arriva solo lo snapshot vecchio: i valori attuali li calcola già questo
   * generatore dalle risposte, e riusarli è l'unico modo perché il confronto non
   * contraddica le pagine accanto. Assente quando l'anno prima non esiste, e in
   * quel caso la sezione non viene stampata affatto.
   */
  previousSnapshot?: PreviousSnapshot;
}

export interface PreviousSnapshot {
  year: number;
  overallScore: number;
  categoryScores: { name: string; score: number }[];
}

// Mirror of Assessment.tsx isQuestionVisible — questions with a dependency are hidden
// unless their parent is answered with 'pianificato_in_corso' or 'completato'.
function isQuestionVisible(
  q: { id: number; dependency?: string },
  responses: Record<number, AssessmentResponse>,
  allCategoryQuestions: { id: number }[],
): boolean {
  const dep = q.dependency;
  if (!dep) return true;
  const depIdx = parseInt(dep, 10);
  if (isNaN(depIdx) || depIdx < 1 || depIdx === q.id) return true;
  const parentQ = allCategoryQuestions.find(pq => pq.id === depIdx);
  if (!parentQ) return true;
  const parentStatus = responses[parentQ.id] ?? null;
  return parentStatus === 'pianificato_in_corso' || parentStatus === 'completato';
}

/** Verde se migliora, rosso se peggiora, indaco se resta uguale. */
function coloreDelta(delta: number): [number, number, number] {
  if (delta > 0) return [34, 197, 94];
  if (delta < 0) return [220, 38, 38];
  return [99, 102, 241];
}

/** Un punteggio fuori scala non deve disegnare una barra più lunga del grafico. */
function clamp(valore: number): number {
  return Math.max(0, Math.min(100, valore));
}

export const generateAssessmentPDF = ({ responses, companyName, categories, doc: providedDoc, save = true, previousSnapshot }: AssessmentReportData) => {
  // Use backend categories when available — matches the view's question set exactly
  const effectiveCats = categories && categories.length > 0 ? categories : ASSESSMENT_CATEGORIES;
  const allCatQuestions = effectiveCats.flatMap(c => c.questions);

  // In composizione si riceve un doc esterno (il generatore inizia sulla pagina corrente).
  const doc = providedDoc ?? new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 18;
  const maxWidth = pageWidth - margin * 2;
  let y = 0;

  const checkPage = (needed: number) => {
    if (y + needed > 275) {
      doc.addPage();
      y = 20;
    }
  };

  // ── HEADER ──
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageWidth, 48, 'F');
  doc.setTextColor(100, 210, 255);
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text('Assessment NIS2 / NIST / ISO', margin, 22);
  doc.setFontSize(10);
  doc.setTextColor(150, 180, 200);
  doc.text(companyName || 'Report di Conformità', margin, 32);
  doc.text(`Generato il: ${new Date().toLocaleString('it-IT')}`, margin, 40);
  y = 58;

  // ── GLOBAL SUMMARY ──
  // Count only visible questions (same logic as the Assessment view)
  const totalQuestions = effectiveCats.reduce(
    (s, c) => s + c.questions.filter(q => isQuestionVisible(q, responses, allCatQuestions)).length,
    0,
  );
  const totalAnswered = effectiveCats.reduce((s, c) => {
    return s + c.questions.filter(q => {
      if (!isQuestionVisible(q, responses, allCatQuestions)) return false;
      const r = responses[q.id];
      return !!r;
    }).length;
  }, 0);
  const globalProgress = totalQuestions > 0 ? Math.round((totalAnswered / totalQuestions) * 100) : 0;

  // Compute per-category data using only visible questions
  const catData = effectiveCats.map(cat => {
    const visibleQs = cat.questions.filter(q => isQuestionVisible(q, responses, allCatQuestions));
    const score = calculateCategoryScore(cat.questions, responses);
    const risk = getRiskFromScore(score);
    const counts = { completato: 0, pianificato_in_corso: 0, non_iniziato: 0, non_applicabile: 0, unanswered: 0 };
    visibleQs.forEach(q => {
      const r = responses[q.id];
      if (r && r in counts) counts[r as keyof typeof counts]++;
      else counts.unanswered++;
    });
    const answered = counts.completato + counts.pianificato_in_corso + counts.non_iniziato + counts.non_applicabile;
    // Mirror Assessment.tsx: a category is N/A when all visible answers are non_applicabile
    const isNotApplicable = counts.non_applicabile > 0
      && counts.completato === 0
      && counts.pianificato_in_corso === 0
      && counts.non_iniziato === 0;
    return { name: cat.name, score, risk, counts, answered, total: visibleQs.length, isNotApplicable };
  });

  // Mirror Assessment.tsx overallScore: exclude isNotApplicable categories
  const catsWithAnswers = catData.filter(c => c.answered > 0 && !c.isNotApplicable);
  const overallScore = catsWithAnswers.length > 0
    ? Math.round(catsWithAnswers.reduce((a, c) => a + c.score, 0) / catsWithAnswers.length)
    : 0;
  const overallRisk = getRiskFromScore(overallScore);

  // Summary box
  doc.setFillColor(30, 41, 59);
  doc.roundedRect(margin, y, maxWidth, 32, 3, 3, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');

  const col = maxWidth / 4;
  const labels = ['Progresso', 'Punteggio', 'Rischio', 'Domande'];
  const values = [`${globalProgress}%`, `${overallScore}/100`, overallRisk.label, `${totalAnswered}/${totalQuestions}`];
  labels.forEach((lbl, i) => {
    const x = margin + col * i + col / 2;
    doc.setFontSize(8);
    doc.setTextColor(150, 180, 200);
    doc.text(lbl, x, y + 12, { align: 'center' });
    doc.setFontSize(14);
    doc.setTextColor(255, 255, 255);
    doc.text(values[i], x, y + 24, { align: 'center' });
  });
  y += 42;

  // ── CATEGORY SUMMARY TABLE ──
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 30, 30);
  doc.text('Riepilogo per Categoria', margin, y);
  y += 8;

  // Table header
  const colWidths = [70, 25, 25, 28, 26];
  const headers = ['Categoria', 'Punteggio', 'Rischio', 'Risposte', 'Progresso'];
  doc.setFillColor(241, 245, 249);
  doc.rect(margin, y, maxWidth, 8, 'F');
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(71, 85, 105);
  let xPos = margin + 2;
  headers.forEach((h, i) => {
    doc.text(h, xPos, y + 5.5);
    xPos += colWidths[i];
  });
  y += 10;

  // Table rows
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  catData.forEach((cat, idx) => {
    checkPage(8);
    if (idx % 2 === 0) {
      doc.setFillColor(248, 250, 252);
      doc.rect(margin, y, maxWidth, 7, 'F');
    }
    xPos = margin + 2;
    doc.setTextColor(30, 30, 30);
    const truncName = cat.name.length > 38 ? cat.name.substring(0, 36) + '…' : cat.name;
    doc.text(truncName, xPos, y + 5);
    xPos += colWidths[0];

    doc.text(`${cat.score}/100`, xPos, y + 5);
    xPos += colWidths[1];

    // Risk with color
    const riskColors: Record<string, [number, number, number]> = {
      'Altissimo': [220, 38, 38], 'Alto': [234, 88, 12], 'Moderato': [234, 179, 8],
      'Basso': [34, 197, 94], 'Molto basso': [16, 185, 129],
    };
    const rc = riskColors[cat.risk.label] || [100, 100, 100];
    doc.setTextColor(...rc);
    doc.text(cat.risk.label, xPos, y + 5);
    xPos += colWidths[2];

    doc.setTextColor(30, 30, 30);
    doc.text(`${cat.answered}/${cat.total}`, xPos, y + 5);
    xPos += colWidths[3];

    const pct = cat.total > 0 ? Math.round((cat.answered / cat.total) * 100) : 0;
    doc.text(`${pct}%`, xPos, y + 5);

    y += 7;
  });

  y += 10;

  // ── CONFRONTO CON L'ANNO PRECEDENTE ──
  // Stampata solo se esiste lo snapshot dell'anno prima: senza un termine di
  // paragone un "confronto" mostrerebbe delta pari al punteggio attuale, cioè
  // un miglioramento inventato. In quel caso il report resta com'era.
  if (previousSnapshot) {
    const annoCorrente = new Date().getFullYear();

    // Le categorie si appaiano per nome, come nella schermata di gap analysis.
    // Una categoria senza corrispondente nello snapshot viene saltata: non è un
    // miglioramento da zero, è una categoria che l'anno prima non esisteva.
    const confronto = catData
      .map(cat => {
        const prima = previousSnapshot.categoryScores.find(p => p.name === cat.name);
        if (!prima) return null;
        return { name: cat.name, prima: prima.score, adesso: cat.score, delta: cat.score - prima.score };
      })
      .filter((v): v is { name: string; prima: number; adesso: number; delta: number } => v !== null);

    if (confronto.length > 0) {
      checkPage(60);
      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(30, 30, 30);
      doc.text(`Confronto ${previousSnapshot.year} - ${annoCorrente}`, margin, y);
      y += 8;

      // ── Riepilogo: punteggio globale prima/adesso e variazione ──
      const deltaGlobale = overallScore - previousSnapshot.overallScore;
      doc.setFillColor(30, 41, 59);
      doc.roundedRect(margin, y, maxWidth, 26, 3, 3, 'F');
      const colonna = maxWidth / 3;
      const vociRiepilogo: [string, string, [number, number, number]][] = [
        [`Punteggio ${previousSnapshot.year}`, `${previousSnapshot.overallScore}/100`, [255, 255, 255]],
        [`Punteggio ${annoCorrente}`, `${overallScore}/100`, [255, 255, 255]],
        ['Variazione', `${deltaGlobale > 0 ? '+' : ''}${deltaGlobale}`, coloreDelta(deltaGlobale)],
      ];
      vociRiepilogo.forEach(([etichetta, valore, colore], i) => {
        const x = margin + colonna * i + colonna / 2;
        doc.setFontSize(8);
        doc.setTextColor(150, 180, 200);
        doc.text(etichetta, x, y + 10, { align: 'center' });
        doc.setFontSize(13);
        doc.setTextColor(...colore);
        doc.text(valore, x, y + 20, { align: 'center' });
      });
      y += 34;

      // ── Migliori miglioramenti e aree critiche, come nella schermata ──
      const perDelta = [...confronto].sort((a, b) => b.delta - a.delta);
      const migliori = perDelta.slice(0, 3);
      const peggiori = [...perDelta].reverse().slice(0, 3);

      checkPage(40);
      const larghezzaMeta = (maxWidth - 6) / 2;
      const yElenchi = y;
      ([
        ['Migliori miglioramenti', migliori, margin],
        ['Aree critiche', peggiori, margin + larghezzaMeta + 6],
      ] as [string, typeof migliori, number][]).forEach(([titolo, voci, x]) => {
        let yLocale = yElenchi;
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(71, 85, 105);
        doc.text(titolo, x, yLocale);
        yLocale += 5;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        voci.forEach(voce => {
          // La colonna è mezza pagina: troncare a 30 caratteri sprecava spazio e
          // rendeva indistinguibili categorie con lo stesso inizio.
          const nome = voce.name.length > 44 ? voce.name.substring(0, 42) + '...' : voce.name;
          doc.setTextColor(30, 30, 30);
          doc.text(nome, x, yLocale);
          doc.setTextColor(...coloreDelta(voce.delta));
          doc.text(`${voce.delta > 0 ? '+' : ''}${voce.delta}`, x + larghezzaMeta - 2, yLocale, { align: 'right' });
          yLocale += 5;
        });
      });
      y = yElenchi + 5 + Math.max(migliori.length, peggiori.length) * 5 + 8;

      // ── Grafico: due barre per categoria, anno prima e anno corrente ──
      checkPage(30);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(30, 30, 30);
      doc.text('Variazione per categoria', margin, y);
      y += 6;

      // Legenda: il colore della barra corrente dice il verso della variazione,
      // quindi va spiegato, altrimenti sembra una categoria "rossa".
      const legenda: [string, [number, number, number]][] = [
        [String(previousSnapshot.year), [148, 163, 184]],
        ['migliorata', [34, 197, 94]],
        ['peggiorata', [220, 38, 38]],
        ['stabile', [99, 102, 241]],
      ];
      let xLegenda = margin;
      doc.setFontSize(6.5);
      doc.setFont('helvetica', 'normal');
      legenda.forEach(([testo, colore]) => {
        doc.setFillColor(...colore);
        doc.rect(xLegenda, y - 2.4, 3, 3, 'F');
        doc.setTextColor(71, 85, 105);
        doc.text(testo, xLegenda + 4.2, y);
        xLegenda += 4.2 + doc.getTextWidth(testo) + 6;
      });
      y += 6;

      const larghezzaEtichetta = 52;
      const larghezzaBarre = maxWidth - larghezzaEtichetta - 12; // spazio per i valori
      const xBarre = margin + larghezzaEtichetta;
      const altezzaRiga = 9;

      confronto.forEach(voce => {
        checkPage(altezzaRiga + 4);

        doc.setFontSize(6.5);
        doc.setTextColor(30, 30, 30);
        const nome = voce.name.length > 34 ? voce.name.substring(0, 32) + '...' : voce.name;
        doc.text(nome, margin, y + 4);

        // Fondo scala 0-100: le barre sono confrontabili fra categorie diverse.
        doc.setFillColor(241, 245, 249);
        doc.rect(xBarre, y, larghezzaBarre, 6.4, 'F');

        doc.setFillColor(148, 163, 184);
        doc.rect(xBarre, y, (larghezzaBarre * clamp(voce.prima)) / 100, 2.8, 'F');

        doc.setFillColor(...coloreDelta(voce.delta));
        doc.rect(xBarre, y + 3.6, (larghezzaBarre * clamp(voce.adesso)) / 100, 2.8, 'F');

        doc.setFontSize(6);
        doc.setTextColor(71, 85, 105);
        doc.text(`${voce.prima} -> ${voce.adesso}`, xBarre + larghezzaBarre + 2, y + 4.4);

        y += altezzaRiga;
      });

      y += 6;
    }
  }

  // ── DETAILED CATEGORIES WITH QUESTIONS ──
  doc.addPage();
  y = 20;
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 30, 30);
  doc.text('Dettaglio Risposte per Categoria', margin, y);
  y += 10;

  effectiveCats.forEach(cat => {
    checkPage(20);

    // Category title bar
    const catInfo = catData.find(c => c.name === cat.name)!;
    doc.setFillColor(15, 23, 42);
    doc.roundedRect(margin, y, maxWidth, 10, 2, 2, 'F');
    doc.setTextColor(100, 210, 255);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text(`${cat.name}  —  Punteggio: ${catInfo.score}/100  |  Rischio: ${catInfo.risk.label}`, margin + 3, y + 7);
    y += 14;

    // Questions — only visible ones (mirrors the view's dependency logic)
    const visibleCatQs = cat.questions.filter(q => isQuestionVisible(q, responses, allCatQuestions));
    visibleCatQs.forEach((q, qi) => {
      checkPage(12);
      const response = responses[q.id];
      const responseLabel = response ? (RESPONSE_LABELS[response] || '—') : 'Nessuna risposta';

      // Alternating rows
      if (qi % 2 === 0) {
        doc.setFillColor(248, 250, 252);
        doc.rect(margin, y, maxWidth, 8, 'F');
      }

      doc.setFontSize(6.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 116, 139);
      doc.text(`${qi + 1}.`, margin + 2, y + 5);

      doc.setTextColor(30, 30, 30);
      const qText = q.question.length > 90 ? q.question.substring(0, 88) + '…' : q.question;
      doc.text(qText, margin + 9, y + 5);

      // Response badge
      const badgeColors: Record<string, [number, number, number]> = {
        completato: [34, 197, 94],
        pianificato_in_corso: [234, 179, 8],
        non_iniziato: [220, 38, 38],
        non_applicabile: [148, 163, 184],
      };
    const bc: [number, number, number] = response && badgeColors[response] ? badgeColors[response] : [148, 163, 184];
      doc.setTextColor(bc[0], bc[1], bc[2]);
      doc.setFont('helvetica', 'bold');
      doc.text(responseLabel, pageWidth - margin - 2, y + 5, { align: 'right' });

      y += 8;
    });

    y += 6;
  });

  // In composizione (save=false) footer e salvataggio li gestisce l'orchestratore.
  if (!save) {
    return doc;
  }

  // ── FOOTER on all pages ──
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFillColor(15, 23, 42);
    doc.rect(0, 282, pageWidth, 15, 'F');
    doc.setFontSize(7);
    doc.setTextColor(100, 150, 180);
    doc.text('Assessment NIS2/NIST/ISO — HiConsole', margin, 289);
    doc.text(`Pagina ${i}/${totalPages}`, pageWidth - margin - 20, 289);
  }

  doc.save(`Assessment_Report_${new Date().toISOString().slice(0, 10)}.pdf`);
  return doc;
};
