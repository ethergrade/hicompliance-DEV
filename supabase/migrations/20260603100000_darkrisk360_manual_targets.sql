-- darkrisk360_manual_targets: input manuale domini/IP/email
-- Usata quando SurfaceScan360 non è attivo sul cliente

CREATE TABLE IF NOT EXISTS public.darkrisk360_manual_targets (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  target_type       text        NOT NULL CHECK (target_type IN ('domain', 'email', 'ip', 'cidr')),
  value             text        NOT NULL,
  normalized_value  text        NOT NULL,
  label             text,
  enabled           boolean     NOT NULL DEFAULT true,
  added_by          uuid,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, target_type, normalized_value)
);

CREATE INDEX IF NOT EXISTS idx_darkrisk360_manual_targets_org
  ON public.darkrisk360_manual_targets (organization_id, target_type, enabled);

-- RLS
ALTER TABLE public.darkrisk360_manual_targets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members can read manual targets"
  ON public.darkrisk360_manual_targets
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "admin can insert manual targets"
  ON public.darkrisk360_manual_targets
  FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = auth.uid()
        AND role IN ('admin', 'owner')
    )
  );

CREATE POLICY "admin can update manual targets"
  ON public.darkrisk360_manual_targets
  FOR UPDATE
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = auth.uid()
        AND role IN ('admin', 'owner')
    )
  );

CREATE POLICY "admin can delete manual targets"
  ON public.darkrisk360_manual_targets
  FOR DELETE
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = auth.uid()
        AND role IN ('admin', 'owner')
    )
  );

CREATE POLICY "service role bypass for manual targets"
  ON public.darkrisk360_manual_targets
  FOR ALL
  USING (auth.role() = 'service_role');
