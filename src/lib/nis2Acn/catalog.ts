import rawCatalog from '@/data/nis2Acn/catalog.json';

export const NIS2_RULES_VERSION = '2026.11';

export type Nis2Profile = 'ess' | 'imp' | 'base';
export type AcnStatus = 'implementato' | 'parziale' | 'non_implementato' | 'deroga';

export interface AcnRequirement {
  code: string;
  profiles: string[];
  flags: string[];
  type: 'documento' | 'procedura' | 'tecnico' | null;
  policy: string | null;
  question: string;
  acnText: string;
  notes?: string[];
}

export interface AcnMeasure {
  code: string;
  title: string;
  function: 'GV' | 'ID' | 'PR' | 'DE' | 'RS' | 'RC';
  profiles: string[];
  phase: number;
  order: number;
  weight: number;
  art24: string | null;
  dependsOn: string[];
  outcome?: string;
  guideQuestion?: string;
  simple?: string;
  evidence?: string;
  remediation?: string;
  requirements: AcnRequirement[];
}

export const ACN_CATALOG = rawCatalog as unknown as AcnMeasure[];

export const ACN_FUNCTIONS: Record<AcnMeasure['function'], string> = {
  GV: 'Governo', ID: 'Identificazione', PR: 'Protezione', DE: 'Rilevamento', RS: 'Risposta', RC: 'Ripristino',
};

export const ACN_PHASES: Record<number, string> = {
  1: 'Perimetro, governance e politiche',
  2: 'Rischio e vulnerabilità',
  3: 'Catena di approvvigionamento',
  4: 'Persone e formazione',
  5: 'Protezione tecnica',
  6: 'Log, monitoraggio e antimalware',
  7: 'Incidenti, continuità e ripristino',
  8: 'Piano di adeguamento',
};

export const ACN_STATUS_LABELS: Record<AcnStatus, string> = {
  implementato: 'Implementato',
  parziale: 'Parziale / In corso',
  non_implementato: 'Non implementato',
  deroga: 'Deroga',
};

export const ACN_FLAG_LABELS: Record<string, string> = {
  R: 'R · solo sistemi rilevanti',
  V: 'V · in base alla valutazione del rischio',
  D: 'D · deroga ammessa',
  F: 'F · fornitori',
  T2: 'T2 · misure compensative',
  'T2(solo ESS)': 'T2 · misure compensative (solo essenziali)',
  '✔ Organi': 'Da approvare dagli organi',
};

/** Measures applicable to a profile, ordered by wizard phase/order. Base uses 1 question per measure. */
export function measuresForProfile(profile: Nis2Profile): AcnMeasure[] {
  return ACN_CATALOG.filter((m) => m.profiles.includes(profile))
    .map((m) => ({
      ...m,
      requirements: profile === 'base' ? m.requirements : m.requirements.filter((r) => r.profiles.includes(profile)),
    }))
    .sort((a, b) => a.phase - b.phase || a.order - b.order);
}

/** Codes that must be answered for a profile. Base answers at measure level (code = measure code). */
export function answerCodesForProfile(profile: Nis2Profile): string[] {
  const ms = measuresForProfile(profile);
  return profile === 'base' ? ms.map((m) => m.code) : ms.flatMap((m) => m.requirements.map((r) => r.code));
}

export function statusValue(s: AcnStatus | undefined, compensativeValid = true): number | null {
  switch (s) {
    case 'implementato': return 1;
    case 'parziale': return 0.5;
    case 'non_implementato': return 0;
    case 'deroga': return compensativeValid ? 1 : 0;
    default: return null;
  }
}

export interface AcnScore { score: number | null; answered: number; total: number }

/**
 * Measure score = average of its requirement values (unanswered count as 0 once at least one is answered).
 * Overall = weighted average of answered measures by measure weight. Values 0-100.
 */
export function scoreMeasure(m: AcnMeasure, answers: Record<string, AcnStatus>, profile: Nis2Profile): AcnScore {
  const codes = profile === 'base' ? [m.code] : m.requirements.map((r) => r.code);
  const vals = codes.map((c) => statusValue(answers[c]));
  const answered = vals.filter((v) => v !== null).length;
  if (answered === 0) return { score: null, answered, total: codes.length };
  const sum = vals.reduce<number>((a, v) => a + (v ?? 0), 0);
  return { score: Math.round((sum / codes.length) * 100), answered, total: codes.length };
}

export function scoreOverall(measures: AcnMeasure[], answers: Record<string, AcnStatus>, profile: Nis2Profile): AcnScore {
  let wsum = 0, w = 0, answered = 0, total = 0;
  for (const m of measures) {
    const s = scoreMeasure(m, answers, profile);
    answered += s.answered; total += s.total;
    if (s.score !== null) { wsum += s.score * m.weight; w += m.weight; }
  }
  return { score: w ? Math.round(wsum / w) : null, answered, total };
}
