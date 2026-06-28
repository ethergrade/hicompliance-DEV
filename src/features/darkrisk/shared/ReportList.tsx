import { Download, FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DarkRiskReport } from "../domain/contracts";

interface ReportListProps {
	title: string;
	reports: DarkRiskReport[];
	isLoading?: boolean;
	onSelectRun?: (runId: string) => void;
}

const formatDate = (value: string | null) => value
	? new Intl.DateTimeFormat("it-IT", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value))
	: "—";

export const ReportList = ({ title, reports, isLoading, onSelectRun }: ReportListProps) => (
	<Card>
		<CardHeader><CardTitle className="text-base">{title}</CardTitle></CardHeader>
		<CardContent className="space-y-2">
			{isLoading ? <p className="text-sm text-muted-foreground">Caricamento report…</p> : null}
			{reports.map((report) => (
				<div key={report.id} className="flex flex-col gap-3 rounded-md border p-3 sm:flex-row sm:items-center">
					<FileText className="h-4 w-4 text-cyan-400" />
					<div className="min-w-0 flex-1">
						<p className="truncate text-sm font-medium">{report.period || `Report ${report.id.slice(0, 8)}`}</p>
						<p className="text-xs text-muted-foreground">Generato {formatDate(report.createdAt)}</p>
					</div>
					<Badge variant="outline">{report.status}</Badge>
					{onSelectRun && report.runId ? <Button size="sm" variant="outline" onClick={() => onSelectRun(report.runId!)}>Apri risultati</Button> : null}
					{report.downloadUrl ? (
						<Button size="sm" asChild><a href={report.downloadUrl} rel="noreferrer"><Download className="mr-2 h-4 w-4" />Scarica</a></Button>
					) : null}
				</div>
			))}
			{!isLoading && reports.length === 0 ? <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">Nessun report disponibile.</p> : null}
		</CardContent>
	</Card>
);
