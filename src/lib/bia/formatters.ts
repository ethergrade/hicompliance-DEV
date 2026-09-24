import type { BiaCriticality, BiaConfidence, BiaStatus, CoverageState } from '@/types/bia';

/** Accetta "1.234,56" e "1234.56"; restituisce stringa decimale canonica o null se vuoto. */
export function parseMoney(input: string): string | null {
  const t = input.trim().replace(/\s|€/g, '');
  if (t === '') return null;
  let norm = t;
  if (t.includes(',')) norm = t.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) norm = t.replace(/\./g, '');
  if (!/^\d+(\.\d+)?$/.test(norm)) throw new Error('invalid_amount');
  return norm;
}

export function formatMoney(v: string | number | null | undefined, currency = 'EUR'): string {
  if (v === null || v === undefined || v === '') return '—';
  const n = typeof v === 'number' ? v : Number(v);
  if (Number.isNaN(n)) return '—';
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n);
}

export function formatMinutes(m: number | null | undefined): string {
  if (m === null || m === undefined) return '—';
  if (m === 0) return '0 min';
  if (m < 60) return `${m} min`;
  if (m % 1440 === 0) return `${m / 1440} g`;
  if (m % 60 === 0) return `${m / 60} h`;
  return `${Math.floor(m / 60)} h ${m % 60} min`;
}

export const CLASS_LABEL: Record<BiaCriticality, string> = { low: 'Bassa', medium: 'Media', high: 'Alta', critical: 'Critica' };
export const CLASS_BADGE: Record<BiaCriticality, string> = {
  low: 'bg-success/15 text-success border-success/30',
  medium: 'bg-warning/15 text-warning border-warning/30',
  high: 'bg-caution/15 text-caution border-caution/30',
  critical: 'bg-destructive/15 text-destructive border-destructive/30',
};
export const STATUS_LABEL: Record<BiaStatus, string> = { draft: 'Bozza', in_review: 'In revisione', approved: 'Approvata', superseded: 'Sostituita' };
export const CONF_LABEL: Record<BiaConfidence, string> = { low: 'Bassa', medium: 'Media', high: 'Alta' };
export const COVERAGE_LABEL: Record<CoverageState, string> = { covered: 'Coperto', not_covered: 'Non coperto', unknown: 'Capacità corrente sconosciuta' };
export const COVERAGE_CLASS: Record<CoverageState, string> = {
  covered: 'text-success', not_covered: 'text-destructive', unknown: 'text-muted-foreground',
};

export const SUBMIT_ERROR_LABEL: Record<string, string> = {
  business_owner_missing: 'Manca il business owner del servizio',
  economic_horizon_missing: 'Serve almeno un orizzonte economico',
  mtpd_rto_missing: 'MTPD e RTO devono essere valorizzati',
  rto_not_less_than_mtpd: "L'RTO deve essere minore dell'MTPD",
  assumptions_missing: 'Mancano le assunzioni',
  cost_source_missing: 'Ogni costo deve avere una fonte o nota',
  dependency_or_reason_missing: 'Collega almeno una dipendenza o asset, oppure motiva l\'assenza',
  impact_dimensions_missing: 'Completa impatto operativo, normativo e reputazionale',
};

export const WARNING_LABEL: Record<string, string> = {
  non_monotonic_curve: 'La curva dei costi non è crescente nel tempo: verifica o motiva nelle assunzioni',
  rto_not_less_than_mtpd: "RTO uguale o superiore all'MTPD: blocca invio e approvazione",
  backup_test_stale: "L'ultimo test di ripristino ha più di 12 mesi",
};

export const HORIZON_LABEL = (m: number) => formatMinutes(m);

export const OPERATIONAL_OPTIONS = [
  { v: 0, l: 'Nessun impatto operativo' },
  { v: 25, l: 'Workaround completo, impatto locale e reversibile' },
  { v: 50, l: 'Degrado limitato, workaround sostenibile' },
  { v: 75, l: 'Forte degrado, workaround parziale o breve' },
  { v: 100, l: 'Servizio fermo o conseguenza irreversibile' },
];
export const REGULATORY_OPTIONS = [
  { v: 0, l: 'Nessun obbligo o effetto rilevante identificato' },
  { v: 33.33, l: 'Obbligo interno o contrattuale limitato' },
  { v: 66.67, l: 'Obbligo di notifica, violazione significativa o audit finding' },
  { v: 100, l: 'Possibile sospensione, sanzione materiale o impatto NIS2 critico' },
];
export const REPUTATIONAL_OPTIONS = [
  { v: 0, l: 'Nessuna visibilità esterna plausibile' },
  { v: 33.33, l: 'Reclami limitati o impatto su un gruppo ristretto' },
  { v: 66.67, l: 'Comunicazione esterna, churn significativo o copertura di settore' },
  { v: 100, l: 'Copertura ampia, perdita di clienti strategici o fiducia duratura' },
];

export const COST_FIELDS: { key: keyof import('@/types/bia').BiaImpactValue; label: string }[] = [
  { key: 'lost_contribution_margin', label: 'Margine di contribuzione perso' },
  { key: 'idle_labor_cost', label: 'Costo del personale inattivo' },
  { key: 'extra_operating_cost', label: 'Costi operativi extra / workaround' },
  { key: 'recovery_response_cost', label: 'Costi di ripristino e risposta' },
  { key: 'contractual_penalties', label: 'Penali contrattuali' },
  { key: 'regulatory_legal_cost', label: 'Costi normativi e legali' },
  { key: 'customer_reputation_cost', label: 'Clienti e reputazione (churn)' },
  { key: 'other_cost', label: 'Altri costi documentati' },
];
