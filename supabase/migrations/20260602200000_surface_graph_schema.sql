-- SurfaceGraph: knowledge graph for attack surface intelligence
-- Integrates Flowsint-style OSINT graph into SurfaceScan360

-- 1. Investigation sessions (una per cliente / sessione di indagine)
CREATE TABLE IF NOT EXISTS public.surface_graph_investigations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  tenant_id       uuid NOT NULL,
  name            text NOT NULL,
  description     text,
  node_count      int NOT NULL DEFAULT 0,
  edge_count      int NOT NULL DEFAULT 0,
  created_by      uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_surface_graph_inv_org ON public.surface_graph_investigations(organization_id, created_at DESC);

-- 2. Nodi del grafo (ogni entità: Domain, IP, Email, ASN, CVE, Credential...)
CREATE TABLE IF NOT EXISTS public.surface_graph_nodes (
  id               text NOT NULL,
  investigation_id uuid NOT NULL REFERENCES public.surface_graph_investigations(id) ON DELETE CASCADE,
  organization_id  uuid NOT NULL,
  node_data        jsonb NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id, investigation_id)
);

CREATE INDEX IF NOT EXISTS idx_surface_graph_nodes_inv ON public.surface_graph_nodes(investigation_id);
CREATE INDEX IF NOT EXISTS idx_surface_graph_nodes_org ON public.surface_graph_nodes(organization_id);
CREATE INDEX IF NOT EXISTS idx_surface_graph_nodes_type ON public.surface_graph_nodes((node_data->>'nodeType'));

-- 3. Archi del grafo (ogni relazione tra entità)
CREATE TABLE IF NOT EXISTS public.surface_graph_edges (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  investigation_id uuid NOT NULL REFERENCES public.surface_graph_investigations(id) ON DELETE CASCADE,
  organization_id  uuid NOT NULL,
  source_node_id   text NOT NULL,
  target_node_id   text NOT NULL,
  edge_data        jsonb NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (investigation_id, source_node_id, target_node_id, (edge_data->>'label'))
);

CREATE INDEX IF NOT EXISTS idx_surface_graph_edges_inv ON public.surface_graph_edges(investigation_id);
CREATE INDEX IF NOT EXISTS idx_surface_graph_edges_source ON public.surface_graph_edges(investigation_id, source_node_id);
CREATE INDEX IF NOT EXISTS idx_surface_graph_edges_target ON public.surface_graph_edges(investigation_id, target_node_id);

-- 4. Tracking run enricher
CREATE TABLE IF NOT EXISTS public.surface_graph_enricher_runs (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  investigation_id uuid NOT NULL REFERENCES public.surface_graph_investigations(id) ON DELETE CASCADE,
  organization_id  uuid NOT NULL,
  enricher_name    text NOT NULL,
  input_node_ids   text[] NOT NULL DEFAULT '{}',
  status           text NOT NULL DEFAULT 'running' CHECK (status IN ('running','completed','failed','skipped')),
  nodes_created    int NOT NULL DEFAULT 0,
  edges_created    int NOT NULL DEFAULT 0,
  error_message    text,
  started_at       timestamptz NOT NULL DEFAULT now(),
  completed_at     timestamptz
);

CREATE INDEX IF NOT EXISTS idx_surface_graph_runs_inv ON public.surface_graph_enricher_runs(investigation_id, started_at DESC);

-- 5. Trigger updated_at
CREATE OR REPLACE FUNCTION public.update_surface_graph_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_surface_graph_investigations_updated_at
  BEFORE UPDATE ON public.surface_graph_investigations
  FOR EACH ROW EXECUTE FUNCTION public.update_surface_graph_updated_at();

CREATE TRIGGER trg_surface_graph_nodes_updated_at
  BEFORE UPDATE ON public.surface_graph_nodes
  FOR EACH ROW EXECUTE FUNCTION public.update_surface_graph_updated_at();

-- 6. RLS
ALTER TABLE public.surface_graph_investigations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.surface_graph_nodes         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.surface_graph_edges         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.surface_graph_enricher_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sg_investigations_select" ON public.surface_graph_investigations FOR SELECT TO authenticated
  USING (can_manage_all_organizations(auth.uid()) OR organization_id IN (SELECT organization_id FROM public.users WHERE auth_user_id = auth.uid()));
CREATE POLICY "sg_investigations_write" ON public.surface_graph_investigations FOR ALL TO authenticated
  USING (can_manage_all_organizations(auth.uid()) OR organization_id IN (SELECT organization_id FROM public.users WHERE auth_user_id = auth.uid()))
  WITH CHECK (can_manage_all_organizations(auth.uid()) OR organization_id IN (SELECT organization_id FROM public.users WHERE auth_user_id = auth.uid()));

CREATE POLICY "sg_nodes_select" ON public.surface_graph_nodes FOR SELECT TO authenticated
  USING (can_manage_all_organizations(auth.uid()) OR organization_id IN (SELECT organization_id FROM public.users WHERE auth_user_id = auth.uid()));
CREATE POLICY "sg_nodes_write" ON public.surface_graph_nodes FOR ALL TO authenticated
  USING (can_manage_all_organizations(auth.uid()) OR organization_id IN (SELECT organization_id FROM public.users WHERE auth_user_id = auth.uid()))
  WITH CHECK (can_manage_all_organizations(auth.uid()) OR organization_id IN (SELECT organization_id FROM public.users WHERE auth_user_id = auth.uid()));

CREATE POLICY "sg_edges_select" ON public.surface_graph_edges FOR SELECT TO authenticated
  USING (can_manage_all_organizations(auth.uid()) OR organization_id IN (SELECT organization_id FROM public.users WHERE auth_user_id = auth.uid()));
CREATE POLICY "sg_edges_write" ON public.surface_graph_edges FOR ALL TO authenticated
  USING (can_manage_all_organizations(auth.uid()) OR organization_id IN (SELECT organization_id FROM public.users WHERE auth_user_id = auth.uid()))
  WITH CHECK (can_manage_all_organizations(auth.uid()) OR organization_id IN (SELECT organization_id FROM public.users WHERE auth_user_id = auth.uid()));

CREATE POLICY "sg_runs_select" ON public.surface_graph_enricher_runs FOR SELECT TO authenticated
  USING (can_manage_all_organizations(auth.uid()) OR organization_id IN (SELECT organization_id FROM public.users WHERE auth_user_id = auth.uid()));
CREATE POLICY "sg_runs_write" ON public.surface_graph_enricher_runs FOR ALL TO authenticated
  USING (can_manage_all_organizations(auth.uid()) OR organization_id IN (SELECT organization_id FROM public.users WHERE auth_user_id = auth.uid()))
  WITH CHECK (can_manage_all_organizations(auth.uid()) OR organization_id IN (SELECT organization_id FROM public.users WHERE auth_user_id = auth.uid()));
