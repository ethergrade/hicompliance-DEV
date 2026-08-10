import React, { useState } from 'react';
import { AlertTriangle, Check, Loader2, Pencil, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import type {
	AnalysisCategory,
	AnalysisViolation,
	AssessmentAnalysis,
} from '@/types/api';

/**
 * L'analisi strutturata, sezione per sezione, con un editor per ogni testo.
 *
 * Sostituisce il riquadro unico di markdown. La differenza non è solo di comodità:
 * qui prosa e dati sono separati, e la separazione va difesa. Si correggono i testi;
 * punteggi, conteggi, evidenze e servizi restano accanto in sola lettura, perché sono
 * ciò su cui il testo poggia. Il backend rifiuta comunque qualunque campo fuori
 * dall'allowlist — questo è il primo dei due presidi, non l'unico.
 *
 * Mostrare i dati ancorati accanto al testo non è decorazione: chi corregge deve
 * vedere cosa non deve contraddire.
 */

interface Props {
	analysis: AssessmentAnalysis;
	violations: AnalysisViolation[];
	canEdit: boolean;
	saving: boolean;
	/** Riceve la struttura parziale con il solo campo modificato. */
	onSave: (patch: Record<string, unknown>) => Promise<boolean>;
}

const CLASSIFICATION_LABEL: Record<string, string> = {
	well_covered: 'ben coperta',
	targeted_improvement: 'miglioramento mirato',
	remediation_needed: 'da rimediare',
	not_assessed: 'non valutata',
};

const CLASSIFICATION_CLASS: Record<string, string> = {
	well_covered: 'bg-green-500/15 text-green-500 border-green-500/30',
	targeted_improvement: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
	remediation_needed: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
	not_assessed: 'bg-muted text-muted-foreground border-border',
};

/** Un testo con la sua matita. Fuori da qui non si modifica niente. */
const CampoTesto: React.FC<{
	label: string;
	value: string;
	canEdit: boolean;
	saving: boolean;
	rows?: number;
	onSave: (v: string) => Promise<boolean>;
}> = ({ label, value, canEdit, saving, rows = 5, onSave }) => {
	const [editing, setEditing] = useState(false);
	const [draft, setDraft] = useState(value);

	const apri = () => {
		setDraft(value);
		setEditing(true);
	};

	const salva = async () => {
		// Si esce dall'editor solo se il salvataggio è andato: altrimenti la
		// correzione sparirebbe dallo schermo senza essere stata scritta.
		if (await onSave(draft)) setEditing(false);
	};

	if (!editing) {
		return (
			<div className="group/campo">
				<div className="mb-1 flex items-center gap-2">
					<p className="text-xs font-medium text-muted-foreground">{label}</p>
					{canEdit && (
						<Button
							variant="ghost"
							size="sm"
							className="h-6 px-1.5 opacity-0 transition-opacity group-hover/campo:opacity-100"
							onClick={apri}
						>
							<Pencil className="h-3 w-3" />
						</Button>
					)}
				</div>
				<p className="whitespace-pre-wrap text-sm leading-relaxed">
					{value?.trim() || <span className="italic text-muted-foreground">Vuoto.</span>}
				</p>
			</div>
		);
	}

	return (
		<div className="space-y-2">
			<p className="text-xs font-medium text-muted-foreground">{label}</p>
			<Textarea
				value={draft}
				onChange={(e) => setDraft(e.target.value)}
				rows={rows}
				className="resize-y text-sm"
				autoFocus
			/>
			<div className="flex justify-end gap-2">
				<Button variant="outline" size="sm" onClick={() => setEditing(false)} disabled={saving}>
					<X className="mr-1 h-3.5 w-3.5" />
					Annulla
				</Button>
				<Button size="sm" onClick={salva} disabled={saving}>
					{saving ? (
						<Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
					) : (
						<Check className="mr-1 h-3.5 w-3.5" />
					)}
					Salva
				</Button>
			</div>
		</div>
	);
};

/** I dati ancorati di una categoria: si leggono, non si toccano. */
const DatiCategoria: React.FC<{ categoria: AnalysisCategory }> = ({ categoria }) => (
	<div className="mt-3 space-y-1 rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
		<div className="flex flex-wrap gap-x-4 gap-y-1">
			<span>
				completate {categoria.counts.completed} · pianificate {categoria.counts.planned_in_progress} ·
				non avviate {categoria.counts.not_started} · n/a {categoria.counts.not_applicable}
			</span>
		</div>
		{categoria.evidence_question_ids.length > 0 && (
			<div>evidenze: {categoria.evidence_question_ids.join(', ')}</div>
		)}
		<div>
			servizi proposti:{' '}
			{categoria.recommended_service_ids.length > 0
				? categoria.recommended_service_ids.join(', ')
				: '—'}
		</div>
	</div>
);

export const AnalysisEditor: React.FC<Props> = ({
	analysis,
	violations,
	canEdit,
	saving,
	onSave,
}) => {
	if (analysis.analysis_status === 'blocked') {
		return (
			<div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
				<p className="mb-1 flex items-center gap-2 font-medium text-amber-400">
					<AlertTriangle className="h-4 w-4" />
					Analisi bloccata
				</p>
				<p className="text-sm text-muted-foreground">
					Il modello non ha prodotto il report perché i dati in ingresso non erano coerenti:
				</p>
				<ul className="mt-2 list-disc pl-5 text-sm">
					{analysis.blocked_reasons.map((motivo) => (
						<li key={motivo}>{motivo}</li>
					))}
				</ul>
			</div>
		);
	}

	return (
		<div className="space-y-6">
			{violations.length > 0 && (
				<div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
					<p className="mb-2 flex items-center gap-2 font-medium text-amber-400">
						<AlertTriangle className="h-4 w-4" />
						{violations.length} rilievi aperti — il report non è pubblicabile
					</p>
					<ul className="space-y-1 text-sm text-muted-foreground">
						{violations.slice(0, 8).map((v, i) => (
							<li key={`${v.regola}-${i}`}>
								<span className="font-mono text-xs">{v.regola}</span> · {v.dettaglio}
							</li>
						))}
						{violations.length > 8 && <li>… altri {violations.length - 8}</li>}
					</ul>
				</div>
			)}

			{/* ── Sintesi ── */}
			<section className="space-y-4 rounded-xl border border-border p-4">
				<div className="flex items-start justify-between gap-3">
					<h3 className="text-sm font-semibold">Sintesi</h3>
					{analysis.overall.posture_score !== null && (
						<Badge variant="outline">{analysis.overall.posture_score}/100</Badge>
					)}
				</div>

				<CampoTesto
					label="Titolo"
					value={analysis.overall.headline}
					canEdit={canEdit}
					saving={saving}
					rows={2}
					onSave={(v) => onSave({ overall: { headline: v } })}
				/>
				<CampoTesto
					label="Sintesi esecutiva"
					value={analysis.overall.executive_summary}
					canEdit={canEdit}
					saving={saving}
					rows={8}
					onSave={(v) => onSave({ overall: { executive_summary: v } })}
				/>
			</section>

			{/* ── Categorie ── */}
			<section className="space-y-3">
				<h3 className="text-sm font-semibold">Categorie</h3>

				{analysis.categories.map((categoria, i) => (
					<div key={categoria.category_id || categoria.category_name} className="space-y-3 rounded-xl border border-border p-4">
						<div className="flex flex-wrap items-center justify-between gap-2">
							<p className="font-medium">{categoria.category_name}</p>
							<div className="flex items-center gap-2">
								{categoria.score !== null && <Badge variant="outline">{categoria.score}</Badge>}
								<Badge className={CLASSIFICATION_CLASS[categoria.classification]}>
									{CLASSIFICATION_LABEL[categoria.classification] ?? categoria.classification}
								</Badge>
							</div>
						</div>

						<CampoTesto
							label="Stato"
							value={categoria.state_summary}
							canEdit={canEdit}
							saving={saving}
							onSave={(v) => onSave({ categories: indicizza(i, { state_summary: v }) })}
						/>
						<CampoTesto
							label="Consiglio"
							value={categoria.advice}
							canEdit={canEdit}
							saving={saving}
							onSave={(v) => onSave({ categories: indicizza(i, { advice: v }) })}
						/>

						<DatiCategoria categoria={categoria} />
					</div>
				))}
			</section>

			{/* ── Miglioramenti ── */}
			{analysis.improvements.length > 0 && (
				<section className="space-y-3">
					<h3 className="text-sm font-semibold">Miglioramenti proposti</h3>

					{analysis.improvements.map((miglioramento, i) => (
						<div key={`${miglioramento.title}-${i}`} className="space-y-3 rounded-xl border border-border p-4">
							<CampoTesto
								label="Titolo"
								value={miglioramento.title}
								canEdit={canEdit}
								saving={saving}
								rows={2}
								onSave={(v) => onSave({ improvements: indicizza(i, { title: v }) })}
							/>
							<CampoTesto
								label="Motivazione"
								value={miglioramento.rationale}
								canEdit={canEdit}
								saving={saving}
								onSave={(v) => onSave({ improvements: indicizza(i, { rationale: v }) })}
							/>
							<div className="rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
								evidenze: {miglioramento.evidence_question_ids.join(', ') || '—'} · servizi:{' '}
								{miglioramento.service_ids.join(', ') || '—'}
							</div>
						</div>
					))}
				</section>
			)}

			{/* ── CyberSWOT ── */}
			<section className="space-y-3">
				<h3 className="text-sm font-semibold">CyberSWOT</h3>
				<div className="grid gap-3 md:grid-cols-2">
					{(
						[
							['strengths', 'Punti di forza'],
							['weaknesses', 'Debolezze'],
							['opportunities', 'Opportunità'],
							['threats', 'Minacce'],
						] as const
					).map(([chiave, etichetta]) => (
						<div key={chiave} className="space-y-3 rounded-xl border border-border p-4">
							<p className="text-xs font-semibold uppercase text-muted-foreground">{etichetta}</p>
							{analysis.cyberswot[chiave].length === 0 && (
								<p className="text-sm italic text-muted-foreground">Nessuna voce.</p>
							)}
							{analysis.cyberswot[chiave].map((voce, i) => (
								<CampoTesto
									key={`${chiave}-${i}`}
									label={`Voce ${i + 1} · evidenze ${voce.evidence_question_ids.join(', ') || '—'}`}
									value={voce.text}
									canEdit={canEdit}
									saving={saving}
									rows={3}
									onSave={(v) => onSave({ cyberswot: { [chiave]: indicizza(i, { text: v }) } })}
								/>
							))}
						</div>
					))}
				</div>
			</section>

			{/* ── Conclusione ── */}
			<section className="rounded-xl border border-border p-4">
				<CampoTesto
					label="Conclusione"
					value={analysis.conclusion}
					canEdit={canEdit}
					saving={saving}
					rows={8}
					onSave={(v) => onSave({ conclusion: v })}
				/>
			</section>
		</div>
	);
};

/**
 * Una voce di elenco alla posizione `i`, con le precedenti vuote.
 *
 * Il backend indirizza gli elementi per posizione: `categories.2.advice`. Mandare
 * l'elenco intero significherebbe rispedire anche i campi non modificati — punteggi
 * ed evidenze compresi — e vederseli rifiutare dall'allowlist.
 */
function indicizza(i: number, campo: Record<string, string>): Record<string, unknown>[] {
	const elenco: Record<string, unknown>[] = [];
	for (let k = 0; k < i; k++) elenco.push({});
	elenco.push(campo);
	return elenco;
}
