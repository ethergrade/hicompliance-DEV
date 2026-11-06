/**
 * Proposed correlation between the proprietary assessment questions (132) and ACN measures.
 * Keyword-based PROPOSAL: must be validated by a consultant. Never auto-copies answers.
 */
export const MEASURE_KEYWORDS: Record<string, RegExp> = {
  'GV.OC-04': /sistemi (informativi )?(rilevanti|critici)|servizi essenziali|perimetro/i,
  'GV.RM-03': /gestione del rischio|risk management/i,
  'GV.RR-02': /ruoli|responsabilit|organigramma|ciso|referente/i,
  'GV.RR-04': /amministrator[ie] di sistema|selezione del personale|affidabilit/i,
  'GV.PO-01': /politic(a|he) di sicurezza|policy/i,
  'GV.PO-02': /riesam|revision(e|ate) periodic/i,
  'GV.SC-01': /acquist|approvvigionament|procurement/i,
  'GV.SC-02': /fornitor.*ruol|ruol.*fornitor/i,
  'GV.SC-04': /elenco (dei )?fornitori|inventario (dei )?fornitori/i,
  'GV.SC-05': /contratt|clausol|sla/i,
  'GV.SC-07': /rischio (dei |legato ai )?fornitor|terze parti|third.party/i,
  'ID.AM-01': /inventario.*(hardware|dispositiv|asset)|asset inventory/i,
  'ID.AM-02': /inventario.*(software|applicazion)|licenz/i,
  'ID.AM-03': /flussi (di rete|dati)|mappa (della )?rete|topologia/i,
  'ID.AM-04': /cloud|servizi (forniti da )?terzi|saas/i,
  'ID.RA-01': /vulnerabilit.*(scansion|ricerca|assessment)|vulnerability assessment|penetration|pentest/i,
  'ID.RA-05': /valutazione (del )?risch|analisi (dei )?risch/i,
  'ID.RA-06': /trattamento (dei )?risch|rischio residuo/i,
  'ID.RA-08': /csirt|bollettin|avvisi di sicurezza|patch.*vulnerab/i,
  'ID.IM-01': /piano di (miglioramento|adeguamento)|remediation/i,
  'ID.IM-04': /continuit|disaster recovery|bcp|drp|business impact/i,
  'PR.AA-01': /utenz|account|identit|credenzial/i,
  'PR.AA-03': /autenticazione (a )?(pi[uù] fattori|multi)|mfa|2fa/i,
  'PR.AA-05': /privileg|need to know|accessi amministrativ/i,
  'PR.AA-06': /accesso fisico|badge|locali|sala server|videosorveglian/i,
  'PR.AT-01': /formazione|awareness|sensibilizzazione|phishing simulat/i,
  'PR.AT-02': /formazione (tecnica|specialistica)|personale tecnico/i,
  'PR.DS-01': /cifratur.*(disco|portatil|dispositiv|rimovibil)|crittografi.*(disco|dispositiv)|bitlocker/i,
  'PR.DS-02': /in transito|tls|https|vpn|cifratur.*comunicaz/i,
  'PR.DS-11': /backup|ripristin|restore/i,
  'PR.PS-01': /hardening|configurazion.*sicur|baseline/i,
  'PR.PS-02': /aggiornament|patch|obsolet|fine supporto|end.of.life/i,
  'PR.PS-03': /dismission|smaltiment|manutenzion/i,
  'PR.PS-04': /\blog\b|registrazione degli (accessi|eventi)|siem/i,
  'PR.PS-06': /sviluppo sicuro|secure coding|sdlc|codice sorgente/i,
  'PR.IR-01': /firewall|segmentazion|accesso remoto|perimetr.*rete/i,
  'PR.IR-03': /comunicazion.*emergenz|canali alternativi/i,
  'DE.CM-01': /monitoragg|rilevament|ids|ips|soc\b|anomali/i,
  'DE.CM-09': /antivirus|antimalware|edr|endpoint/i,
  'RS.MA-01': /incident|risposta agli incidenti|irp/i,
  'RS.CO-02': /comunicazion.*(clienti|pubblic|esterne|stakeholder)|notific/i,
  'RC.RP-01': /ripristino (dopo|a seguito)|recovery plan/i,
  'RC.CO-03': /comunicazion.*intern.*ripristin/i,
};

export function measuresForQuestion(text: string): string[] {
  return Object.entries(MEASURE_KEYWORDS).filter(([, re]) => re.test(text)).map(([c]) => c);
}

export type LegacyStatus = 'completed' | 'planned_in_progress' | 'not_started' | 'not_applicable';

/** Legacy status → suggested ACN status. not_applicable gives no suggestion. */
export function suggestFromLegacy(statuses: LegacyStatus[]): 'implementato' | 'parziale' | 'non_implementato' | null {
  const s = statuses.filter((x) => x !== 'not_applicable');
  if (!s.length) return null;
  if (s.every((x) => x === 'completed')) return 'implementato';
  if (s.some((x) => x === 'completed' || x === 'planned_in_progress')) return 'parziale';
  return 'non_implementato';
}
