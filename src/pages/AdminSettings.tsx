import { ShieldAlert } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { AssessmentQuestionsEditor } from "@/components/admin/AssessmentQuestionsEditor";
import { useUserRoles } from "@/hooks/useUserRoles";

/**
 * Area impostazioni di piattaforma, riservata al super-admin.
 *
 * Raccoglie le configurazioni globali — quelle che valgono per tutti i clienti
 * e non per il singolo tenant. Per ora contiene solo il catalogo domande
 * dell'assessment.
 *
 * Il controllo qui è di sola interfaccia: l'autorizzazione vera è sull'API, che
 * protegge la scrittura con il middleware `role:super-admin`.
 */
export default function AdminSettings() {
	const { isSuperAdmin, loading } = useUserRoles();

	if (loading) {
		return (
			<DashboardLayout>
				<div className="mx-auto max-w-5xl p-8 text-sm text-muted-foreground">
					Verifica dei permessi…
				</div>
			</DashboardLayout>
		);
	}

	if (!isSuperAdmin) {
		return (
			<DashboardLayout>
				<div className="mx-auto max-w-5xl">
					<Card>
						<CardContent className="p-8 text-center">
							<ShieldAlert className="mx-auto h-8 w-8 text-muted-foreground" />
							<h2 className="mt-3 font-semibold">Area riservata</h2>
							<p className="mt-2 text-sm text-muted-foreground">
								Le impostazioni di piattaforma sono accessibili ai soli super-admin.
							</p>
						</CardContent>
					</Card>
				</div>
			</DashboardLayout>
		);
	}

	return (
		<DashboardLayout>
			<div className="mx-auto max-w-5xl space-y-6">
				<header className="border-b border-border pb-5">
					<h1 className="text-2xl font-semibold tracking-tight">Impostazioni</h1>
					<p className="mt-1 text-sm text-muted-foreground">
						Configurazioni di piattaforma, valide per tutti i clienti.
					</p>
				</header>

				<section className="space-y-3">
					<div>
						<h2 className="text-lg font-semibold">Domande dell'assessment</h2>
						<p className="text-sm text-muted-foreground">
							Testi, priorità e soluzioni proposte del catalogo NIS2 / NIST / ISO.
						</p>
					</div>
					<AssessmentQuestionsEditor />
				</section>
			</div>
		</DashboardLayout>
	);
}
