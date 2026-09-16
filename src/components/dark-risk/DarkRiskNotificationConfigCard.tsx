// Notifiche email DarkRisk360 (`darkrisk/notification-config`).
//
// È l'unica configurazione che il backend legge davvero per inviare mail:
// NotificationService manda l'alert sui nuovi finding e il riepilogo
// settimanale ai `recipient_emails` di questo record. La vecchia pagina
// "Impostazioni Alert" scriveva su `dark-risk-alerts`, tabella che nessun job
// consuma: chi la compilava non riceveva nulla.
import { useEffect, useState } from "react";
import { Bell, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { useDarkRiskNotificationConfig } from "@/hooks/useDarkRiskNotificationConfig";
import { ApiError, getErrorDetail } from "@/lib/api-client";

const SEVERITIES = [
	{ value: "critical", label: "Solo critici" },
	{ value: "high", label: "Alti e critici" },
	{ value: "medium", label: "Medi, alti e critici" },
	{ value: "low", label: "Tutti" },
];

const parseEmails = (raw: string): string[] =>
	Array.from(
		new Set(
			raw
				.split(/[\s,;]+/)
				.map((value) => value.trim().toLowerCase())
				.filter(Boolean),
		),
	);

const formatDate = (value?: string | null) =>
	value ? new Date(value).toLocaleString("it-IT") : "mai";

export function DarkRiskNotificationConfigCard() {
	const { config, loading, error, updateConfig, isUpdating } = useDarkRiskNotificationConfig();
	const [emails, setEmails] = useState("");
	const [alertOnNew, setAlertOnNew] = useState(true);
	const [threshold, setThreshold] = useState("high");
	const [minFindings, setMinFindings] = useState(1);
	const [weekly, setWeekly] = useState(true);

	useEffect(() => {
		if (!config) return;
		setEmails((config.recipient_emails ?? []).join("\n"));
		setAlertOnNew(config.alert_on_new_findings);
		setThreshold(config.alert_severity_threshold || "high");
		setMinFindings(config.min_new_findings_to_alert || 1);
		setWeekly(config.weekly_summary_enabled);
	}, [config]);

	const forbidden = error instanceof ApiError && error.status === 403;

	const handleSave = () => {
		const recipients = parseEmails(emails);
		if (recipients.length === 0) {
			toast.error("Inserisci almeno un destinatario.");
			return;
		}
		updateConfig(
			{
				recipient_emails: recipients,
				alert_on_new_findings: alertOnNew,
				alert_severity_threshold: threshold,
				min_new_findings_to_alert: minFindings,
				weekly_summary_enabled: weekly,
			},
			{
				onSuccess: () => toast.success("Notifiche DarkRisk360 salvate"),
				onError: (err) => toast.error("Salvataggio fallito: " + getErrorDetail(err)),
			},
		);
	};

	return (
		<Card className="border-border">
			<CardHeader>
				<div className="flex items-center gap-2">
					<Bell className="h-5 w-5 text-primary" />
					<CardTitle>Notifiche email DarkRisk360</CardTitle>
				</div>
				<CardDescription>
					Alert sui nuovi finding a fine scansione e riepilogo settimanale, inviati ai
					destinatari indicati per il cliente selezionato.
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-5">
				{loading ? (
					<p className="text-sm text-muted-foreground">Caricamento…</p>
				) : forbidden ? (
					<p className="text-sm text-muted-foreground">
						Le notifiche possono essere configurate solo da un amministratore o dal cliente.
					</p>
				) : (
					<>
						<div className="space-y-2">
							<Label htmlFor="darkrisk-recipients">Destinatari</Label>
							<Textarea
								id="darkrisk-recipients"
								value={emails}
								onChange={(event) => setEmails(event.target.value)}
								placeholder={"soc@cliente.it\nit@cliente.it"}
								rows={3}
								className="font-mono text-xs"
							/>
							<p className="text-[11px] text-muted-foreground">
								Un indirizzo per riga, oppure separati da virgola.
							</p>
						</div>

						<div className="flex items-start justify-between gap-4 rounded-md border border-border p-3">
							<div>
								<p className="text-sm font-medium">Alert sui nuovi finding</p>
								<p className="text-xs text-muted-foreground">
									Email a fine scansione quando compaiono finding nuovi sopra la soglia.
									Ultimo invio: {formatDate(config?.last_alert_sent_at)}.
								</p>
							</div>
							<Switch checked={alertOnNew} onCheckedChange={setAlertOnNew} />
						</div>

						<div className="grid gap-4 sm:grid-cols-2">
							<div className="space-y-2">
								<Label>Soglia di severità</Label>
								<Select value={threshold} onValueChange={setThreshold} disabled={!alertOnNew}>
									<SelectTrigger>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										{SEVERITIES.map((item) => (
											<SelectItem key={item.value} value={item.value}>
												{item.label}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
							<div className="space-y-2">
								<Label htmlFor="darkrisk-min-findings">Minimo finding nuovi per inviare</Label>
								<Input
									id="darkrisk-min-findings"
									type="number"
									min={1}
									max={1000}
									value={minFindings}
									disabled={!alertOnNew}
									onChange={(event) =>
										setMinFindings(Math.max(1, Number(event.target.value) || 1))
									}
								/>
							</div>
						</div>

						<div className="flex items-start justify-between gap-4 rounded-md border border-border p-3">
							<div>
								<p className="text-sm font-medium">Riepilogo settimanale</p>
								<p className="text-xs text-muted-foreground">
									Inviato dal cron del lunedì con lo snapshot della settimana. Ultimo
									invio: {formatDate(config?.last_summary_sent_at)}.
								</p>
							</div>
							<Switch checked={weekly} onCheckedChange={setWeekly} />
						</div>

						<div className="flex justify-end">
							<Button onClick={handleSave} disabled={isUpdating}>
								<Save className="mr-2 h-4 w-4" />
								{isUpdating ? "Salvataggio…" : "Salva notifiche"}
							</Button>
						</div>
					</>
				)}
			</CardContent>
		</Card>
	);
}
