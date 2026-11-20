import React, { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, FileDown, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useClientOrganization } from "@/hooks/useClientOrganization";
import { collectReportData, ReportAborted } from "@/lib/report/collectReportData";
import { buildFullReportPdf } from "@/lib/report/pdf/buildFullReport";
import { loadReportFonts } from "@/lib/report/pdf/fonts";
import hisolutionLogoUrl from "@/assets/brand/hisolution-logo.png";

/**
 * Route nascosta /report: anteprima del report cliente completo, con lo
 * stesso motore del pulsante in Assessment. Non è nel menu.
 */
const ReportPreview: React.FC = () => {
	const { selectedOrganization, organizationId, groupId } = useClientOrganization();
	const [pdf, setPdf] = useState<{ url: string; filename: string } | null>(null);
	const [loading, setLoading] = useState(false);
	const abort = useRef<AbortController | null>(null);

	const companyName = selectedOrganization?.legal_name || selectedOrganization?.name || "Cliente";

	const generate = async () => {
		if (!organizationId) return;
		abort.current?.abort();
		const controller = new AbortController();
		abort.current = controller;
		setLoading(true);
		try {
			const data = await collectReportData({
				organizationId,
				groupId: groupId ?? null,
				companyName,
				org: selectedOrganization as never,
				signal: controller.signal,
			});
			const { blob, filename } = await buildFullReportPdf(data, hisolutionLogoUrl, { fonts: await loadReportFonts() });
			setPdf((old) => {
				if (old) URL.revokeObjectURL(old.url);
				return { url: URL.createObjectURL(blob), filename };
			});
		} catch (e) {
			if (!(e instanceof ReportAborted)) {
				console.error("Report preview error:", e);
				toast.error("Errore nella generazione del report");
			}
		} finally {
			setLoading(false);
		}
	};

	// Nuovo cliente: si annulla la generazione in corso e si riparte.
	useEffect(() => {
		generate();
		return () => abort.current?.abort();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [organizationId]);

	return (
		<div className="min-h-screen bg-slate-50">
			<div className="sticky top-0 z-10 flex items-center justify-between border-b bg-white px-6 py-3">
				<div>
					<h1 className="text-lg font-bold">Anteprima report · {companyName}</h1>
					<p className="text-xs text-slate-500">Vista di controllo (non nel menu).</p>
				</div>
				<div className="flex gap-2">
					<Button variant="outline" onClick={generate} disabled={loading}>
						{loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
						{loading ? "" : "Rigenera"}
					</Button>
					<Button asChild disabled={!pdf}>
						<a href={pdf?.url} download={pdf?.filename}>
							<FileDown className="w-4 h-4 mr-2" /> Scarica PDF
						</a>
					</Button>
				</div>
			</div>
			{pdf ? (
				<iframe title="Anteprima report" src={pdf.url} className="h-[calc(100vh-64px)] w-full border-0" />
			) : (
				<p className="p-8 text-sm text-slate-500">{loading ? "Generazione in corso…" : "Nessun report generato."}</p>
			)}
		</div>
	);
};

export default ReportPreview;
