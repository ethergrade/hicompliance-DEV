import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, FileDown } from "lucide-react";
import { toast } from "sonner";
import { useClientOrganization } from "@/hooks/useClientOrganization";
import FullReportView, { type FullReportReadyPayload } from "@/components/report/FullReportView";
import { exportFullReportPdf } from "@/lib/report/exportFullReportPdf";

/**
 * Route nascosta /report — anteprima/debug del report cliente completo.
 * Non è linkata dal menu. Renderizza tutte le sezioni cliente espanse e
 * permette di scaricare il PDF (stesso motore usato dal pulsante assessment).
 */
const ReportPreview: React.FC = () => {
	const { selectedOrganization } = useClientOrganization();
	const [payload, setPayload] = useState<FullReportReadyPayload | null>(null);
	const [exporting, setExporting] = useState(false);

	const companyName =
		selectedOrganization?.legal_name || selectedOrganization?.name || "Cliente";

	const handleDownload = async () => {
		if (!payload) return;
		setExporting(true);
		try {
			await exportFullReportPdf({
				companyName,
				assessment: payload.assessment,
				blocks: payload.blocks,
			});
			toast.success("Report generato");
		} catch (e) {
			console.error("Report export error:", e);
			toast.error("Errore nella generazione del report");
		} finally {
			setExporting(false);
		}
	};

	return (
		<div className="min-h-screen bg-slate-50">
			<div className="sticky top-0 z-10 flex items-center justify-between border-b bg-white px-6 py-3">
				<div>
					<h1 className="text-lg font-bold">Anteprima Report — {companyName}</h1>
					<p className="text-xs text-slate-500">
						Vista di debug (non nel menu). {payload ? "Pronto." : "Caricamento dati…"}
					</p>
				</div>
				<Button onClick={handleDownload} disabled={!payload || exporting}>
					{exporting ? (
						<Loader2 className="w-4 h-4 animate-spin" />
					) : (
						<>
							<FileDown className="w-4 h-4 mr-2" /> Scarica PDF
						</>
					)}
				</Button>
			</div>
			<div className="mx-auto my-6 w-[900px] bg-white shadow">
				<FullReportView onReady={setPayload} />
			</div>
		</div>
	);
};

export default ReportPreview;
