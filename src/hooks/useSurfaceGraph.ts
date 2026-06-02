// useSurfaceGraph — React Query hook per load/save del grafo via Supabase
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useClientOrganization } from '@/hooks/useClientOrganization';
import { useSurfaceGraphStore } from '@/stores/surface-graph-store';
import { useCallback } from 'react';
import type { GraphInvestigation, GraphNode, GraphEdge, GraphEnricherRun } from '@/types/surface-graph';
import { toast } from 'sonner';
import { v4 as uuidv4 } from 'uuid';

export function useSurfaceGraph() {
  const { organizationId } = useClientOrganization();
  const qc = useQueryClient();

  const setInvestigations    = useSurfaceGraphStore((s) => s.setInvestigations);
  const addInvestigation     = useSurfaceGraphStore((s) => s.addInvestigation);
  const currentInvestigationId = useSurfaceGraphStore((s) => s.currentInvestigationId);
  const setCurrentId         = useSurfaceGraphStore((s) => s.setCurrentInvestigationId);
  const setNodes             = useSurfaceGraphStore((s) => s.setNodes);
  const setEdges             = useSurfaceGraphStore((s) => s.setEdges);
  const addNodes             = useSurfaceGraphStore((s) => s.addNodes);
  const addEdges             = useSurfaceGraphStore((s) => s.addEdges);
  const rebuildFilters       = useSurfaceGraphStore((s) => s.rebuildFilters);
  const addEnricherRun       = useSurfaceGraphStore((s) => s.addEnricherRun);
  const updateEnricherRun    = useSurfaceGraphStore((s) => s.updateEnricherRun);

  // ── Investigations list ────────────────────────────────────────────────────
  const investigationsQuery = useQuery({
    queryKey: ['surface-graph-investigations', organizationId],
    enabled: Boolean(organizationId),
    queryFn: async () => {
      const { data, error } = await (supabase.from('surface_graph_investigations' as any) as any)
        .select('*')
        .eq('organization_id', organizationId)
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return (data || []) as GraphInvestigation[];
    },
    onSuccess: (data: GraphInvestigation[]) => {
      setInvestigations(data);
      if (!currentInvestigationId && data.length > 0) setCurrentId(data[0].id);
    },
    staleTime: 30_000,
  });

  // ── Load graph for current investigation ───────────────────────────────────
  const graphQuery = useQuery({
    queryKey: ['surface-graph-data', currentInvestigationId],
    enabled: Boolean(currentInvestigationId),
    queryFn: async () => {
      const [nodesRes, edgesRes] = await Promise.all([
        (supabase.from('surface_graph_nodes' as any) as any)
          .select('id, node_data')
          .eq('investigation_id', currentInvestigationId)
          .limit(2000),
        (supabase.from('surface_graph_edges' as any) as any)
          .select('id, source_node_id, target_node_id, edge_data')
          .eq('investigation_id', currentInvestigationId)
          .limit(5000),
      ]);
      if (nodesRes.error) throw nodesRes.error;
      if (edgesRes.error) throw edgesRes.error;
      const nodes = (nodesRes.data || []).map((r: any) => r.node_data as GraphNode);
      const edges = (edgesRes.data || []).map((r: any) => r.edge_data as GraphEdge);
      return { nodes, edges };
    },
    onSuccess: ({ nodes, edges }: { nodes: GraphNode[]; edges: GraphEdge[] }) => {
      setNodes(nodes);
      setEdges(edges);
      rebuildFilters(nodes);
    },
    staleTime: 10_000,
  });

  // ── Create investigation ───────────────────────────────────────────────────
  const createInvestigationMutation = useMutation({
    mutationFn: async (name: string) => {
      const { data, error } = await (supabase.from('surface_graph_investigations' as any) as any)
        .insert({ organization_id: organizationId, tenant_id: organizationId, name })
        .select('*')
        .single();
      if (error) throw error;
      return data as GraphInvestigation;
    },
    onSuccess: (inv: GraphInvestigation) => {
      addInvestigation(inv);
      setCurrentId(inv.id);
      qc.invalidateQueries({ queryKey: ['surface-graph-investigations', organizationId] });
      toast.success(`Investigazione "${inv.name}" creata.`);
    },
    onError: (err: any) => toast.error(String(err?.message || 'Errore creazione investigazione.')),
  });

  // ── Delete investigation ───────────────────────────────────────────────────
  const deleteInvestigationMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase.from('surface_graph_investigations' as any) as any)
        .delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ['surface-graph-investigations', organizationId] });
      if (currentInvestigationId === id) setCurrentId(null);
      toast.success('Investigazione eliminata.');
    },
    onError: (err: any) => toast.error(String(err?.message || 'Errore eliminazione.')),
  });

  // ── Run enricher ───────────────────────────────────────────────────────────
  const runEnricherMutation = useMutation({
    mutationFn: async ({ enricherName, nodeIds }: { enricherName: string; nodeIds: string[] }) => {
      if (!currentInvestigationId || !organizationId) throw new Error('No investigation selected.');

      const run: GraphEnricherRun = {
        id: uuidv4(), investigation_id: currentInvestigationId, organization_id: organizationId,
        enricher_name: enricherName, input_node_ids: nodeIds, status: 'running',
        nodes_created: 0, edges_created: 0, error_message: null,
        started_at: new Date().toISOString(), completed_at: null,
      };
      addEnricherRun(run);

      const { data, error } = await supabase.functions.invoke('surface-graph-enrich', {
        body: {
          enricher_name: enricherName,
          input_node_ids: nodeIds,
          investigation_id: currentInvestigationId,
          organization_id: organizationId,
          run_id: run.id,
        },
      });

      if (error) throw error;
      if ((data as any)?.error) throw new Error(String((data as any).error));
      return { run, data };
    },
    onSuccess: ({ run, data }: { run: GraphEnricherRun; data: any }) => {
      updateEnricherRun(run.id, { status: 'completed', nodes_created: data.nodes_created, edges_created: data.edges_created, completed_at: new Date().toISOString() });
      if (data.nodes?.length) addNodes(data.nodes as GraphNode[]);
      if (data.edges?.length) addEdges(data.edges as GraphEdge[]);
      if (data.nodes?.length) rebuildFilters(useSurfaceGraphStore.getState().nodes);
      qc.invalidateQueries({ queryKey: ['surface-graph-investigations', organizationId] });
      const nc = data.nodes_created || 0, ec = data.edges_created || 0;
      if (nc > 0 || ec > 0) toast.success(`Enrichment completato: +${nc} nodi, +${ec} archi.`);
      else toast.info('Enrichment completato: nessun nuovo dato trovato.');
    },
    onError: (err: any, vars: any) => {
      toast.error(`Enrichment fallito: ${String(err?.message || 'errore sconosciuto')}`);
    },
  });

  // ── Seed from scan ─────────────────────────────────────────────────────────
  const seedFromScanMutation = useMutation({
    mutationFn: async () => {
      if (!currentInvestigationId || !organizationId) throw new Error('No investigation selected.');
      const { data, error } = await supabase.functions.invoke('surface-graph-seed', {
        body: { investigation_id: currentInvestigationId, organization_id: organizationId },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error(String((data as any).error));
      return data;
    },
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ['surface-graph-data', currentInvestigationId] });
      qc.invalidateQueries({ queryKey: ['surface-graph-investigations', organizationId] });
      toast.success(`Seed completato: ${data.nodes_created} nodi, ${data.edges_created} archi.`);
    },
    onError: (err: any) => toast.error(`Seed fallito: ${String(err?.message || 'errore sconosciuto')}`),
  });

  return {
    organizationId,
    currentInvestigationId,
    setCurrentId,
    investigations: investigationsQuery.data || [],
    isLoadingInvestigations: investigationsQuery.isLoading,
    isLoadingGraph: graphQuery.isLoading,
    createInvestigation: (name: string) => createInvestigationMutation.mutate(name),
    deleteInvestigation: (id: string) => deleteInvestigationMutation.mutate(id),
    isCreating: createInvestigationMutation.isPending,
    runEnricher: (name: string, nodeIds: string[]) => runEnricherMutation.mutate({ enricherName: name, nodeIds }),
    isEnriching: runEnricherMutation.isPending,
    seedFromScan: () => seedFromScanMutation.mutate(),
    isSeedingFromScan: seedFromScanMutation.isPending,
    refetchGraph: () => qc.invalidateQueries({ queryKey: ['surface-graph-data', currentInvestigationId] }),
  };
}
