// Filtri della tabella "Credenziali esposte" (Esteso), separati dal componente
// per poterli provare. Le date sono giorni interi, estremi compresi.
import type { CredentialLeak } from "../domain/contracts";

export interface CredentialLeakFilters {
	search: string;
	passwordType: string; // "all" o un tipo
	ack: string; // "all" | "only" | "exclude"
	dateFrom: string; // yyyy-mm-dd o ""
	dateTo: string;
}

export const EMPTY_FILTERS: CredentialLeakFilters = { search: "", passwordType: "all", ack: "all", dateFrom: "", dateTo: "" };

/**
 * Il giorno del leak come lo dichiara la fonte (yyyy-mm-dd), letto dalla
 * stringa e non convertito: la fonte manda "2025-07-02T07:00:01Z" o
 * "2026-03-15 00:00:00", e passando da Date il giorno cambiava col fuso (il
 * filtro usava l'UTC, la colonna l'ora italiana). Filtro e colonna usano
 * questo stesso giorno; il backend confronta gli stessi 10 caratteri.
 */
export const leakDay = (record: Pick<CredentialLeak, "evidenceDate">): string | null => {
	const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(record.evidenceDate ?? "");
	return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
};

/** yyyy-mm-dd → dd/mm/yyyy, senza fuso. */
export const formatDay = (day: string | null): string | null => (day ? day.split("-").reverse().join("/") : null);

export const hasActiveFilters = (f: CredentialLeakFilters) =>
	f.search.trim() !== "" || f.passwordType !== "all" || f.ack !== "all" || f.dateFrom !== "" || f.dateTo !== "";

/** Dal successivo all'iniziale: l'intervallo non si applica e l'utente lo vede. */
export const invalidRange = (f: CredentialLeakFilters) => f.dateFrom !== "" && f.dateTo !== "" && f.dateFrom > f.dateTo;

export const filterCredentialLeaks = (records: CredentialLeak[], f: CredentialLeakFilters) => {
	const q = f.search.trim().toLowerCase();
	const byDate = (f.dateFrom || f.dateTo) && !invalidRange(f);
	let withoutDate = 0;

	const rows = records.filter((record) => {
		if (
			q &&
			!(
				record.selector.toLowerCase().includes(q) ||
				(record.clearAccount ?? "").toLowerCase().includes(q) ||
				(record.assetScope ?? "").toLowerCase().includes(q) ||
				(record.bucketDisplay ?? record.bucketCanonical ?? "").toLowerCase().includes(q)
			)
		) {
			return false;
		}
		if (f.passwordType !== "all" && record.passwordType !== f.passwordType) return false;
		if (f.ack === "only" && !record.acknowledged) return false;
		if (f.ack === "exclude" && record.acknowledged) return false;
		if (byDate) {
			const day = leakDay(record);
			if (!day) {
				withoutDate++;
				return false;
			}
			if (f.dateFrom && day < f.dateFrom) return false;
			if (f.dateTo && day > f.dateTo) return false;
		}
		return true;
	});

	/** `withoutDate`: escluse dal filtro per data perché la fonte non dà la data del leak. */
	return { rows, withoutDate };
};
