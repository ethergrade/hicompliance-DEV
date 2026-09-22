import { describe, expect, it } from "vitest";
import jsPDF from "jspdf";
import {
  generateAssessmentPDF,
  type PreviousSnapshot,
} from "@/components/assessment/AssessmentReportGenerator";
import type {
  AssessmentCategory,
  AssessmentResponse,
} from "@/data/assessmentQuestions";

/**
 * La sezione di confronto anno su anno nel PDF.
 *
 * Il report si genera davvero e se ne legge il testo: un test che controllasse
 * solo "non ha lanciato eccezioni" non direbbe se la sezione è finita nel
 * documento, che è l'unica cosa che interessa a chi lo apre.
 */
const categorie: AssessmentCategory[] = [
  {
    name: "Governance",
    questions: [
      { id: 1, question: "Prima", priority: "ALTA" },
      { id: 2, question: "Seconda", priority: "MEDIA" },
    ],
  },
  {
    name: "Crittografia",
    questions: [{ id: 3, question: "Terza", priority: "ALTA" }],
  },
];

const risposte: Record<number, AssessmentResponse> = {
  1: "completato",
  2: "non_iniziato",
  3: "completato",
};

/** Il testo del PDF, pagina per pagina, come lo vede chi lo apre. */
function testoDelPdf(doc: jsPDF): string {
  // @ts-expect-error — getTextContent non è nei tipi, ma jsPDF tiene il testo
  // in chiaro dentro gli stream delle pagine: è l'unico modo per rileggerlo
  // senza un parser PDF completo.
  const interno = doc.internal as { pages: string[][] };
  return interno.pages.flat().join("\n");
}

function generaConConfronto(previousSnapshot?: PreviousSnapshot): string {
  const doc = new jsPDF();
  generateAssessmentPDF({
    responses: risposte,
    categories: categorie,
    companyName: "Cliente di prova",
    previousSnapshot,
    doc,
    save: false,
  });
  return testoDelPdf(doc);
}

describe("PDF assessment — confronto anno su anno", () => {
  it("non stampa nulla quando l'anno precedente non esiste", () => {
    const testo = generaConConfronto(undefined);

    expect(testo).not.toContain("Confronto");
    expect(testo).not.toContain("Variazione per categoria");
    // Il resto del report deve restare al suo posto.
    expect(testo).toContain("Riepilogo per Categoria");
  });

  it("stampa riepilogo e grafico quando lo snapshot precedente c'è", () => {
    const annoPrecedente = new Date().getFullYear() - 1;
    const testo = generaConConfronto({
      year: annoPrecedente,
      overallScore: 44,
      categoryScores: [
        { name: "Governance", score: 30 },
        { name: "Crittografia", score: 92 },
      ],
    });

    expect(testo).toContain("Confronto");
    expect(testo).toContain(String(annoPrecedente));
    expect(testo).toContain("Variazione per categoria");
    expect(testo).toContain("Migliori miglioramenti");
    expect(testo).toContain("Aree critiche");
    // Il punteggio dell'anno prima compare nel riepilogo.
    expect(testo).toContain("44/100");
  });

  it("salta le categorie che l'anno prima non esistevano", () => {
    const testo = generaConConfronto({
      year: new Date().getFullYear() - 1,
      overallScore: 50,
      categoryScores: [{ name: "Categoria sparita", score: 70 }],
    });

    // Nessuna categoria in comune: il confronto non ha nulla da dire e si tace,
    // invece di mostrare delta pari al punteggio attuale.
    expect(testo).not.toContain("Variazione per categoria");
  });
});
