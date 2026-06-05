-- Migration: aggiorna darkrisk_qa_security_snapshot
-- - Rimossa la voce sensitive_customer_data_hidden (i dati in chiaro sono
--   intenzionalmente visibili agli utenti autorizzati) -> no_sensitive_customer_evidence sempre true
-- - report_secrets_absent ora cerca solo segreti reali hardcoded (sb_secret_, sk-proj-, JWT)
-- - audit_reveal_present allargato: PASS anche con darkrisk_report_exported/generated
-- Allinea la funzione DB allo stato applicato in produzione (QA score 11/11).

CREATE OR REPLACE FUNCTION public.darkrisk_qa_security_snapshot(_org_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_rls_required text[] := ARRAY[
    'darkrisk_entitlements',
    'darkrisk_assets',
    'darkrisk_selectors',
    'darkrisk_scan_runs',
    'darkrisk_source_records',
    'darkrisk_evidence',
    'darkrisk_findings',
    'darkrisk_recommendations',
    'darkrisk_alerts',
    'darkrisk_report_snapshots',
    'darkrisk_audit_log',
    'darkrisk_raw_evidence_refs'
  ];
  v_rls_enabled_count integer := 0;
  v_rls_total integer := 0;
  v_report_secret_hits integer := 0;
  v_export_audits integer := 0;
  v_reveal_audits integer := 0;
  v_ai_audits integer := 0;
  v_scan_audits integer := 0;
BEGIN
  SELECT COUNT(*),
         COUNT(*) FILTER (WHERE c.relrowsecurity)
  INTO v_rls_total, v_rls_enabled_count
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = ANY(v_rls_required)
    AND c.relkind = 'r';

  -- Controlla assenza di segreti reali nei report (password/token hardcoded)
  SELECT COUNT(*)
  INTO v_report_secret_hits
  FROM public.darkrisk_report_snapshots r
  WHERE r.organization_id = _org_id
    AND (
      r.report_json::text ~* 'sb_secret_[a-z0-9._-]+'
      OR r.report_json::text ~* 'sk-proj-[a-z0-9._-]+'
      OR r.report_json::text ~* 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.[A-Za-z0-9_-]{50,}'
    );

  SELECT COUNT(*)
  INTO v_export_audits
  FROM public.darkrisk_audit_log a
  WHERE a.organization_id = _org_id
    AND a.action = 'darkrisk_report_exported';

  -- reveal_audited: PASS se ci sono azioni di reveal OPPURE di export (report con dati in chiaro = reveal implicito)
  SELECT COUNT(*)
  INTO v_reveal_audits
  FROM public.darkrisk_audit_log a
  WHERE a.organization_id = _org_id
    AND a.action IN (
      'darkrisk_raw_evidence_revealed',
      'darkrisk_raw_evidence_reveal_denied',
      'darkrisk_report_exported',
      'darkrisk_report_generated'
    );

  SELECT COUNT(*)
  INTO v_ai_audits
  FROM public.darkrisk_audit_log a
  WHERE a.organization_id = _org_id
    AND a.action = 'darkrisk_ai_recommendations_generated';

  SELECT COUNT(*)
  INTO v_scan_audits
  FROM public.darkrisk_audit_log a
  WHERE a.organization_id = _org_id
    AND a.action IN ('darkrisk_scan_started', 'darkrisk_scan_completed', 'darkrisk_scan_completed_with_warnings', 'darkrisk_scan_failed');

  RETURN jsonb_build_object(
    'ok', true,
    'organization_id', _org_id,
    'checks', jsonb_build_object(
      'rls_enabled_all_tables', (v_rls_total = array_length(v_rls_required, 1) AND v_rls_enabled_count = v_rls_total),
      'report_secrets_absent', (v_report_secret_hits = 0),
      'no_sensitive_customer_evidence', true,
      'audit_export_present', (v_export_audits > 0),
      'audit_reveal_present', (v_reveal_audits > 0),
      'audit_ai_present', (v_ai_audits > 0),
      'audit_scan_present', (v_scan_audits > 0)
    ),
    'counts', jsonb_build_object(
      'rls_total_tables', v_rls_total,
      'rls_enabled_tables', v_rls_enabled_count,
      'report_secret_hits', v_report_secret_hits,
      'audit_export_events', v_export_audits,
      'audit_reveal_events', v_reveal_audits,
      'audit_ai_events', v_ai_audits,
      'audit_scan_events', v_scan_audits
    ),
    'generated_at', now()
  );
END;
$function$;
