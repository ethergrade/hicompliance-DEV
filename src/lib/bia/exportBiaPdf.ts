import jsPDF from 'jspdf';
import type { BiaAssessment, BiaDependency, BiaImpactValue, BusinessService } from '@/types/bia';
import { CLASS_LABEL, CONF_LABEL, COVERAGE_LABEL, STATUS_LABEL, formatMinutes } from './formatters';

interface Input {
  organizationName: string;
  service: BusinessService;
  bia: BiaAssessment;
  impacts: BiaImpactValue[];
  ownerName: string | null;
  dependsOn: { dep: BiaDependency; name: string }[];
  dependents: { dep: BiaDependency; name: string }[];
  assets: string[];
  risks: string[];
  remediations: { task: string; budget: string; progress: number }[];
}

const money = (v: string | number | null | undefined) =>
  v === null || v === undefined || v === '' ? '-' : `${new Intl.NumberFormat('it-IT', { maximumFractionDigits: 0 }).format(Number(v))} EUR`;

export function exportBiaPdf(i: Input) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210, M = 16, H = 297;
  let y = M;
  const draft = i.bia.status !== 'approved' && i.bia.status !== 'superseded';
  const ensure = (h: number) => { if (y + h > H - 18) { doc.addPage(); y = M; } };
  const h2 = (t: string) => { ensure(14); y += 4; doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(30, 30, 40); doc.text(t, M, y); y += 6; };
  const row = (k: string, v: string) => {
    doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(110, 110, 120);
    const lines = doc.splitTextToSize(v || '-', W - 2 * M - 58);
    ensure(lines.length * 4.5 + 1);
    doc.text(k, M, y); doc.setTextColor(30, 30, 40); doc.text(lines, M + 58, y); y += lines.length * 4.5 + 1;
  };
  const r = i.bia.result;

  doc.setFont('helvetica', 'bold'); doc.setFontSize(17); doc.setTextColor(30, 30, 40);
  doc.text('Business Impact Analysis', M, y + 5); y += 12;
  doc.setFontSize(12); doc.text(`${i.service.code} - ${i.service.name}`, M, y); y += 7;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(110, 110, 120);
  doc.text(`${i.organizationName} · Versione ${i.bia.version} · ${STATUS_LABEL[i.bia.status]}${i.bia.approved_at ? ` il ${new Date(i.bia.approved_at).toLocaleDateString('it-IT')}` : ''} · Modello ${i.bia.model_version}`, M, y); y += 5;
  doc.text(`Esportato il ${new Date().toLocaleString('it-IT')}`, M, y); y += 4;

  h2('Servizio');
  row('Descrizione', i.service.description ?? '');
  row('Business owner', i.ownerName ?? 'Non assegnato');
  row('Unità organizzativa', i.service.business_unit ?? '');
  row('Orari', (i.service.operating_schedule as any)?.hours ?? '');

  h2('Risultato');
  row('Business Impact Score', r.business_impact_score != null ? `${r.business_impact_score} / 100` : 'Non calcolabile (dati mancanti)');
  row('Classe di criticità', i.bia.criticality_class ? CLASS_LABEL[i.bia.criticality_class] : '-');
  const n = r.normalized;
  if (n) row('Dimensioni normalizzate', `Economico ${n.economic ?? '-'} · Operativo ${n.operational ?? '-'} · Normativo ${n.regulatory ?? '-'} · Reputazionale ${n.reputational ?? '-'} · Dipendenza ${n.dependency}`);
  row('Pesi', '40% economico, 25% operativo, 15% normativo, 10% reputazionale, 10% dipendenza');
  row('Rischio tecnico residuo', r.technical_residual_risk != null ? `${r.technical_residual_risk} / 100 (massimo dei rischi confermati)` : 'Nessun rischio collegato');
  row('Indice di priorità business', r.business_priority_index != null ? String(r.business_priority_index) : 'Non calcolabile');
  row('Perdita annua attesa', r.expected_annual_loss_status === 'calculated' ? `${money(r.expected_annual_loss)} (frequenza ${i.bia.annual_frequency}/anno, fonte: ${i.bia.annual_frequency_source})` : 'Non calcolata: frequenza annua non documentata');
  row('Copertura dati / confidenza', `${r.data_coverage_percent ?? '-'}% · ${r.confidence ? CONF_LABEL[r.confidence] : '-'}`);

  h2('Impatto economico per orizzonte (stime)');
  doc.setFontSize(8.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(110, 110, 120);
  ensure(8); doc.text('Durata', M, y); doc.text('Totale', M + 25, y); doc.text('Confidenza', M + 60, y); doc.text('Fonte / note', M + 88, y); y += 5;
  doc.setFont('helvetica', 'normal'); doc.setTextColor(30, 30, 40);
  i.impacts.forEach((v) => {
    const note = doc.splitTextToSize(`${v.source_notes}${v.manual_total != null ? ` [override: ${v.override_reason}]` : ''}`, W - M - (M + 88));
    ensure(note.length * 4 + 2);
    doc.text(formatMinutes(v.horizon_minutes), M, y); doc.text(money(v.effective_total), M + 25, y); doc.text(CONF_LABEL[v.confidence], M + 60, y); doc.text(note, M + 88, y);
    y += note.length * 4 + 2;
  });
  row('Assunzioni', i.bia.assumptions ?? '');
  row('Fonte normativa', i.bia.regulatory_source ?? '');

  h2('Recovery');
  row('MTPD / RTO / RPO', `${formatMinutes(i.bia.mtpd_minutes)} / ${formatMinutes(i.bia.rto_target_minutes)} / ${formatMinutes(i.bia.rpo_target_minutes)}`);
  const rec = r.recovery;
  if (rec) {
    row('Copertura RTO', `${COVERAGE_LABEL[rec.rto]}${rec.rto_gap_minutes ? ` (gap ${formatMinutes(rec.rto_gap_minutes)})` : ''}`);
    row('Copertura RPO', `${COVERAGE_LABEL[rec.rpo]}${rec.rpo_gap_minutes ? ` (gap ${formatMinutes(rec.rpo_gap_minutes)})` : ''}`);
    row('Test ripristino / runbook', `${COVERAGE_LABEL[rec.backup_test]} / ${COVERAGE_LABEL[rec.runbook]}`);
  }
  row('Modalità degradata', i.bia.degraded_mode ?? '');
  row('Ordine di recovery', i.bia.recovery_rank ? String(i.bia.recovery_rank) : '-');

  h2('Dipendenze interne');
  row('Dipende da', i.dependsOn.map((d) => `${d.name} (${d.dep.dependency_strength}${d.dep.single_point_of_failure ? ', SPOF' : ''})`).join('; ') || i.bia.no_dependency_reason || '-');
  row('Servizi dipendenti', i.dependents.map((d) => d.name).join('; ') || '-');
  row('Asset tecnici', i.assets.join('; ') || '-');

  h2('Rischi e remediation');
  row('Rischi collegati', i.risks.join('; ') || '-');
  row('Remediation', i.remediations.map((m) => `${m.task} (${money(m.budget)}, ${m.progress}%)`).join('; ') || '-');

  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    if (draft) { doc.setFontSize(60); doc.setTextColor(230, 200, 200); doc.text('BOZZA', W / 2, H / 2, { align: 'center', angle: 35 }); }
    doc.setFontSize(7.5); doc.setTextColor(110, 110, 120);
    doc.text(`${i.organizationName} · BIA ${i.service.code} v${i.bia.version} · ${i.bia.model_version} · pagina ${p}/${pages}`, W / 2, H - 8, { align: 'center' });
  }
  doc.save(`BIA_${i.service.code}_v${i.bia.version}${draft ? '_BOZZA' : ''}.pdf`);
}
