import jsPDF from 'jspdf';
import {
  ASSESSMENT_CATEGORIES,
  AssessmentResponse,
  calculateCategoryScore,
  getRiskFromScore,
  RESPONSE_LABELS,
  CATEGORY_DESCRIPTIONS,
} from '@/data/assessmentQuestions';

interface AssessmentReportData {
  responses: Record<number, AssessmentResponse>;
  companyName?: string;
}

export const generateAssessmentPDF = ({ responses, companyName }: AssessmentReportData) => {
  const doc = new jsPDF();
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
  const totalQuestions = ASSESSMENT_CATEGORIES.reduce((s, c) => s + c.questions.length, 0);
  const totalAnswered = Object.keys(responses).filter(k => responses[Number(k)] !== null).length;
  const globalProgress = Math.round((totalAnswered / totalQuestions) * 100);

  // Compute per-category data
  const catData = ASSESSMENT_CATEGORIES.map(cat => {
    const score = calculateCategoryScore(cat.questions, responses);
    const risk = getRiskFromScore(score);
    const counts = { completato: 0, pianificato_in_corso: 0, non_iniziato: 0, non_applicabile: 0, unanswered: 0 };
    cat.questions.forEach(q => {
      const r = responses[q.id];
      if (r && r in counts) counts[r as keyof typeof counts]++;
      else counts.unanswered++;
    });
    const answered = counts.completato + counts.pianificato_in_corso + counts.non_iniziato + counts.non_applicabile;
    return { name: cat.name, score, risk, counts, answered, total: cat.questions.length };
  });

  const catsWithAnswers = catData.filter(c => c.answered > 0);
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

  // ── DETAILED CATEGORIES WITH QUESTIONS ──
  doc.addPage();
  y = 20;
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 30, 30);
  doc.text('Dettaglio Risposte per Categoria', margin, y);
  y += 10;

  ASSESSMENT_CATEGORIES.forEach(cat => {
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

    // Questions
    cat.questions.forEach((q, qi) => {
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
      const bc = response && badgeColors[response] ? badgeColors[response] : [148, 163, 184];
      doc.setTextColor(...bc);
      doc.setFont('helvetica', 'bold');
      doc.text(responseLabel, pageWidth - margin - 2, y + 5, { align: 'right' });

      y += 8;
    });

    y += 6;
  });

  // ── FOOTER on all pages ──
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFillColor(15, 23, 42);
    doc.rect(0, 282, pageWidth, 15, 'F');
    doc.setFontSize(7);
    doc.setTextColor(100, 150, 180);
    doc.text('Assessment NIS2/NIST/ISO — HiCompliance', margin, 289);
    doc.text(`Pagina ${i}/${totalPages}`, pageWidth - margin - 20, 289);
  }

  doc.save(`Assessment_Report_${new Date().toISOString().slice(0, 10)}.pdf`);
};
