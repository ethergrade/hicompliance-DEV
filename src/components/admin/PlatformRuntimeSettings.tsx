import { useState } from "react";
import { AlertTriangle, Loader2, PauseCircle, PlayCircle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import {
	CRON_JOB_LABELS,
	cronScheduleLabel,
	usePlatformRuntimeSettings,
} from "@/hooks/usePlatformRuntimeSettings";

/**
 * Pannello super-admin per mettere in pausa le attività automatiche
 * (scansioni, arricchimenti, polling) quando l'istanza è usata come stage.
 */
export function PlatformRuntimeSettingsPanel() {
	const { toast } = useToast();
	const { settings, jobs, setStageMode, setJobActive } = usePlatformRuntimeSettings();
	const [confirmResume, setConfirmResume] = useState(false);

	const stageMode = settings.data?.stage_mode === true;

	const applyStageMode = async (enabled: boolean) => {
		try {
			await setStageMode.mutateAsync(enabled);
			toast({
				title: enabled ? "Modalità Stage attivata" : "Modalità Stage disattivata",
				description: enabled
					? "Tutte le attività automatiche e le scansioni sono in pausa."
					: "Le attività automatiche sono state riattivate.",
			});
		} catch (e) {
			toast({
				variant: "destructive",
				title: "Operazione non riuscita",
				description: e instanceof Error ? e.message : "Riprova tra qualche istante.",
			});
		}
	};

	const toggleJob = async (jobname: string, active: boolean) => {
		try {
			await setJobActive.mutateAsync({ jobname, active });
		} catch (e) {
			toast({
				variant: "destructive",
				title: "Operazione non riuscita",
				description: e instanceof Error ? e.message : "Riprova tra qualche istante.",
			});
		}
	};

	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					{stageMode ? (
						<PauseCircle className="h-5 w-5 text-amber-500" />
					) : (
						<PlayCircle className="h-5 w-5 text-emerald-500" />
					)}
					Modalità operativa
				</CardTitle>
				<CardDescription>
					Sospende scansioni e attività automatiche quando questa istanza è usata come
					ambiente di test, riducendo chiamate esterne e carico sul database.
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-6">
				<div className="flex items-start justify-between gap-4 rounded-lg border border-border p-4">
					<div className="min-w-0">
						<p className="font-medium">Modalità Stage (tutto in pausa)</p>
						<p className="text-sm text-muted-foreground">
							Ferma tutte le attività pianificate e blocca l'avvio di nuove scansioni,
							anche manuali.
						</p>
						{settings.data?.updated_at && (
							<p className="mt-1 text-xs text-muted-foreground">
								Ultima modifica: {new Date(settings.data.updated_at).toLocaleString("it-IT")}
							</p>
						)}
					</div>
					<div className="flex items-center gap-2">
						{setStageMode.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
						<Switch
							checked={stageMode}
							disabled={settings.isLoading || setStageMode.isPending}
							onCheckedChange={(checked) => {
								if (!checked) setConfirmResume(true);
								else void applyStageMode(true);
							}}
							aria-label="Modalità Stage"
						/>
					</div>
				</div>

				{stageMode && (
					<div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-600 dark:text-amber-400">
						<AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
						<span>
							I dati mostrati nella piattaforma non vengono aggiornati finché la modalità
							Stage resta attiva.
						</span>
					</div>
				)}

				<div className="space-y-2">
					<div className="flex items-center justify-between">
						<h3 className="text-sm font-semibold">Attività automatiche</h3>
						<Button
							variant="ghost"
							size="sm"
							onClick={() => {
								void jobs.refetch();
								void settings.refetch();
							}}
						>
							Aggiorna
						</Button>
					</div>

					{jobs.isLoading && (
						<p className="text-sm text-muted-foreground">Caricamento in corso…</p>
					)}
					{!jobs.isLoading && (jobs.data?.length ?? 0) === 0 && (
						<p className="text-sm text-muted-foreground">
							Nessuna attività pianificata trovata.
						</p>
					)}

					<div className="divide-y divide-border rounded-lg border border-border">
						{(jobs.data ?? []).map((job) => (
							<div
								key={job.jobname}
								className="flex items-center justify-between gap-4 p-3"
							>
								<div className="min-w-0">
									<p className="truncate text-sm font-medium">
										{CRON_JOB_LABELS[job.jobname] ?? job.jobname}
									</p>
									<p className="text-xs text-muted-foreground">
										{cronScheduleLabel(job.schedule)}
									</p>
								</div>
								<div className="flex shrink-0 items-center gap-3">
									<Badge variant={job.active ? "default" : "secondary"}>
										{job.active ? "Attiva" : "In pausa"}
									</Badge>
									<Switch
										checked={job.active}
										disabled={setJobActive.isPending || setStageMode.isPending}
										onCheckedChange={(checked) => void toggleJob(job.jobname, checked)}
										aria-label={`Attiva ${job.jobname}`}
									/>
								</div>
							</div>
						))}
					</div>
				</div>
			</CardContent>

			<AlertDialog open={confirmResume} onOpenChange={setConfirmResume}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Riattivare tutte le attività automatiche?</AlertDialogTitle>
						<AlertDialogDescription>
							Le scansioni pianificate e le chiamate ai servizi esterni ripartiranno
							subito, con il relativo consumo di risorse.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Annulla</AlertDialogCancel>
						<AlertDialogAction onClick={() => void applyStageMode(false)}>
							Riattiva
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</Card>
	);
}
