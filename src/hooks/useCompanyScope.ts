import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { scopeApi, type ScopeEntry } from "@/lib/api/scope";

/**
 * Scope dichiarato del cliente (SSOT tenant_scope_entries) via endpoint dedicato
 * /companies/{id}/scope. Sostituisce la vecchia sorgente extra.hicompliance_scope_*.
 */
export function useCompanyScope(
	organizationId?: string | null,
	groupId?: string | null,
) {
	const queryClient = useQueryClient();
	const queryKey = ["company-scope", organizationId, groupId];

	const { data: entries = [], isLoading } = useQuery({
		queryKey,
		queryFn: () => {
			if (!organizationId) return Promise.resolve([] as ScopeEntry[]);
			return scopeApi.list(organizationId, groupId);
		},
		enabled: !!organizationId,
		staleTime: 60_000,
	});

	const invalidate = () => queryClient.invalidateQueries({ queryKey });

	const addMutation = useMutation({
		mutationFn: (payload: { input_value: string; label?: string }) => {
			if (!organizationId) throw new Error("Nessun cliente selezionato");
			return scopeApi.add(organizationId, payload, groupId);
		},
		onSuccess: invalidate,
	});

	const removeMutation = useMutation({
		mutationFn: (entryId: string) => {
			if (!organizationId) throw new Error("Nessun cliente selezionato");
			return scopeApi.remove(organizationId, entryId, groupId);
		},
		onSuccess: invalidate,
	});

	const toggleMutation = useMutation({
		mutationFn: (entryId: string) => {
			if (!organizationId) throw new Error("Nessun cliente selezionato");
			return scopeApi.toggle(organizationId, entryId, groupId);
		},
		onSuccess: invalidate,
	});

	const addEntry = useCallback(
		(inputValue: string, label?: string) =>
			addMutation.mutateAsync({ input_value: inputValue, label }),
		[addMutation],
	);

	const removeEntry = useCallback(
		(entryId: string) => removeMutation.mutateAsync(entryId),
		[removeMutation],
	);

	const toggleEntry = useCallback(
		(entryId: string) => toggleMutation.mutateAsync(entryId),
		[toggleMutation],
	);

	return {
		entries,
		loading: isLoading,
		saving:
			addMutation.isPending ||
			removeMutation.isPending ||
			toggleMutation.isPending,
		addEntry,
		removeEntry,
		toggleEntry,
	};
}
