// Export Excel lato client delle credenziali esposte (profilo Esteso).
//
// Le righe arrivano già in chiaro dalla pagina, quindi il file contiene ciò
// che l'utente ha davanti: stesse colonne della tabella, una riga per
// credenziale. Usato sia dai "Risultati del run" sia dalle "Credenziali
// esposte" storicizzate.
import * as XLSX from "xlsx";
import type { CredentialLeak, ExtendedLeakRecord } from "../domain/contracts";

type Row = Record<string, string>;

const COLUMN_WIDTHS = [32, 32, 14, 24, 40, 22, 22, 16, 12];

const slug = (value: string) =>
	value
		.replace(/[^\p{L}\p{N}]+/gu, "-")
		.replace(/^-|-$/g, "")
		.toLowerCase();

const writeWorkbook = (rows: Row[], sheetName: string, fileName: string) => {
	const sheet = XLSX.utils.json_to_sheet(rows);
	sheet["!cols"] = COLUMN_WIDTHS.map((wch) => ({ wch }));
	const workbook = XLSX.utils.book_new();
	XLSX.utils.book_append_sheet(workbook, sheet, sheetName);
	XLSX.writeFile(workbook, fileName);
};

export const exportRunRecordsXlsx = (
	records: ExtendedLeakRecord[],
	clientName: string,
	runId: string,
	runDate?: string | null,
) => {
	const rows: Row[] = records.map((record) => ({
		Account: record.user,
		Password: record.password,
		"Tipo password": record.passwordType,
		Fonte: record.sourceShort,
		"Fonte (esteso)": record.sourceLong,
		Bucket: record.bucket,
		Data: record.date ?? "",
		Selector: record.selector,
		Note: record.accountMasked ? "account mascherato (scansione precedente)" : "",
	}));
	const day = (runDate ?? new Date().toISOString()).slice(0, 10);
	writeWorkbook(rows, "Risultati run", `darkrisk-esteso-${slug(clientName)}-run-${day}-${runId.slice(0, 8)}.xlsx`);
};

export const exportCredentialLeaksXlsx = (records: CredentialLeak[], clientName: string) => {
	const rows: Row[] = records.map((record) => ({
		Account: record.clearAccount || record.selector || record.assetScope || "",
		Password: record.clearValue ?? record.maskedValue,
		"Tipo password": record.passwordType ?? "",
		Fonte: record.sourceShort ?? record.collectionName ?? "",
		"Fonte (esteso)": record.sourceLong ?? "",
		Bucket: record.bucketCanonical ?? record.bucketDisplay ?? "",
		Data: record.evidenceDate ?? record.createdAt ?? "",
		Dominio: record.assetScope ?? "",
		Confidenza: record.confidence,
	}));
	const day = new Date().toISOString().slice(0, 10);
	writeWorkbook(rows, "Credenziali esposte", `darkrisk-esteso-${slug(clientName)}-credenziali-${day}.xlsx`);
};
