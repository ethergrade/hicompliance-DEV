import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { assessmentV2Api } from "@/lib/api/assessment-v2";
import { useClientOrganization } from "@/hooks/useClientOrganization";

export interface RemediationCatalog {
	/** Nomi categoria (ordinati per order_index), come salvati nel task.category. */
	categories: string[];
	/** Per ogni categoria, i prodotti/soluzioni suggeriti (union di solution_1/2/3). */
	productsByCategory: Record<string, string[]>;
	isLoading: boolean;
}

// solution_1/2/3 esistono nella risposta dell'endpoint categorie ma non nel
// tipo AssessmentQuestion: le leggiamo con un cast locale.
interface QuestionSolutions {
	solution_1?: string | null;
	solution_2?: string | null;
	solution_3?: string | null;
}

/**
 * Catalogo categorie → prodotti derivato dall'assessment (/assessments-v2/categories):
 * stessa logica del vecchio _options.php (allsolutions costruito dalle soluzioni
 * delle domande). Usato dal modal Remediation per le due tendine dipendenti.
 */
export function useRemediationCatalog(): RemediationCatalog {
	const { groupId } = useClientOrganization();

	const { data, isLoading } = useQuery({
		queryKey: ["remediation-catalog", groupId],
		queryFn: () => assessmentV2Api.categories(groupId),
		staleTime: 5 * 60_000,
	});

	return useMemo(() => {
		const cats = data ?? [];
		const categories = [...cats]
			.sort((a, b) => a.order_index - b.order_index)
			.map((c) => c.name);

		const productsByCategory: Record<string, string[]> = {};
		for (const c of cats) {
			const set = new Set<string>();
			for (const q of c.questions as (QuestionSolutions & { id: string })[]) {
				for (const s of [q.solution_1, q.solution_2, q.solution_3]) {
					const v = (s ?? "").trim();
					if (v) set.add(v);
				}
			}
			productsByCategory[c.name] = [...set].sort((a, b) => a.localeCompare(b));
		}

		return { categories, productsByCategory, isLoading };
	}, [data, isLoading]);
}
