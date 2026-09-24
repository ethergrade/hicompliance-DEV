import { supabase } from "@/integrations/supabase/client";

// Tipi generati potrebbero non essere ancora aggiornati: client non tipizzato.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const sb = supabase as any;

export type Criticality = "low" | "medium" | "high" | "critical";
export type SupplierStatus = "draft" | "invited" | "active" | "suspended" | "archived";
export type AssessmentStatus = "not_started" | "in_progress" | "submitted" | "expired" | "reopened";
export type Answer = "yes" | "partial" | "no" | "na";

export interface Supplier {
  id: string;
  organization_id: string;
  supplier_name: string;
  vat_number: string | null;
  category: string | null;
  service_type: string | null;
  service_description: string | null;
  criticality: Criticality;
  status: SupplierStatus;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  country: string | null;
  linked_asset_id: string | null;
  notes: string | null;
  portal_enabled: boolean;
  assessment_due_at: string | null;
  last_assessment_at: string | null;
  archived_at: string | null;
  is_demo: boolean;
  updated_at: string;
}

export interface Assessment {
  id: string;
  supplier_id: string;
  version: number;
  status: AssessmentStatus;
  due_at: string | null;
  progress_percent: number;
  score: number | null;
  risk_band: string | null;
  started_at: string | null;
  submitted_at: string | null;
  created_at: string;
}

export interface Question {
  id: string;
  code: string;
  category_code: string;
  category_label: string;
  question_text: string;
  weight: number;
  is_critical: boolean;
  order_index: number;
}

export type TechProfile = Record<string, number | boolean | string | null> & { supplier_id: string };

export const CRITICALITY_LABEL: Record<Criticality, string> = { low: "Bassa", medium: "Media", high: "Alta", critical: "Critica" };
export const PORTAL_LABEL: Record<SupplierStatus, string> = {
  draft: "Non invitato", invited: "Invitato", active: "Attivo", suspended: "Sospeso", archived: "Archiviato",
};
export const ASSESSMENT_LABEL: Record<AssessmentStatus, string> = {
  not_started: "Non iniziato", in_progress: "In corso", submitted: "Completato", expired: "Scaduto", reopened: "Riaperto",
};
export const ANSWER_LABEL: Record<Answer, string> = { yes: "Sì", partial: "Parzialmente", no: "No", na: "Non applicabile" };

export function riskBand(score: number | null | undefined) {
  if (score == null) return { label: "—", tone: "bg-muted text-muted-foreground" };
  if (score >= 80) return { label: "Buono", tone: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" };
  if (score >= 60) return { label: "Da rafforzare", tone: "bg-amber-500/15 text-amber-600 dark:text-amber-400" };
  if (score >= 40) return { label: "Rischio significativo", tone: "bg-orange-500/15 text-orange-600 dark:text-orange-400" };
  return { label: "Critico", tone: "bg-red-500/15 text-red-600 dark:text-red-400" };
}

export const DISCLAIMER =
  "Indicatore sintetico di postura cyber del fornitore. Non costituisce certificazione né attestazione di conformità NIS2, ISO 27001 o ad altri standard.";

export async function audit(organization_id: string, supplier_id: string | null, action: string, actor_kind: "customer" | "supplier" = "customer", metadata: Record<string, unknown> = {}) {
  const { data } = await supabase.auth.getUser();
  if (!data.user) return;
  await sb.from("supply_chain_audit_log").insert({ organization_id, supplier_id, action, actor_kind, metadata, actor_user_id: data.user.id });
}

export async function listQuestions(): Promise<Question[]> {
  const { data, error } = await sb.from("supply_chain_questions").select("*").eq("is_active", true).order("order_index");
  if (error) throw error;
  return data ?? [];
}

export const TECH_FIELDS: { key: string; label: string; kind: "int" | "bool" | "text" | "model" }[] = [
  { key: "employees_count", label: "Numero dipendenti", kind: "int" },
  { key: "locations_count", label: "Numero sedi", kind: "int" },
  { key: "windows_endpoints_count", label: "Endpoint Windows", kind: "int" },
  { key: "macos_endpoints_count", label: "Endpoint macOS", kind: "int" },
  { key: "linux_endpoints_count", label: "Endpoint Linux", kind: "int" },
  { key: "physical_servers_count", label: "Server fisici", kind: "int" },
  { key: "virtual_machines_count", label: "Macchine virtuali", kind: "int" },
  { key: "mobile_devices_count", label: "Dispositivi mobili aziendali", kind: "int" },
  { key: "remote_users_count", label: "Utenti remoti", kind: "int" },
  { key: "cloud_workloads_count", label: "Workload cloud", kind: "int" },
  { key: "handles_sensitive_data", label: "Tratta dati personali o sensibili", kind: "bool" },
  { key: "accesses_customer_systems", label: "Accede a sistemi o dati del cliente", kind: "bool" },
  { key: "it_management_model", label: "Gestione IT", kind: "model" },
  { key: "it_provider_name", label: "Nome MSP / system integrator", kind: "text" },
  { key: "has_edr_xdr", label: "Protezione endpoint EDR/XDR", kind: "bool" },
  { key: "edr_xdr_product", label: "Prodotto EDR/XDR", kind: "text" },
  { key: "has_mdm_uem", label: "Gestione mobile MDM/UEM", kind: "bool" },
  { key: "mdm_uem_product", label: "Prodotto MDM/UEM", kind: "text" },
  { key: "has_managed_firewall", label: "Firewall gestito", kind: "bool" },
  { key: "has_mfa", label: "Autenticazione a più fattori", kind: "bool" },
  { key: "has_central_patch_management", label: "Patch management centralizzato", kind: "bool" },
  { key: "has_email_security", label: "Sicurezza della posta", kind: "bool" },
  { key: "has_managed_backup", label: "Backup gestito", kind: "bool" },
  { key: "restore_tests_performed", label: "Test di ripristino eseguiti", kind: "bool" },
  { key: "has_siem_log_management", label: "Raccolta centralizzata dei log", kind: "bool" },
  { key: "has_soc_mdr", label: "Servizio SOC / MDR", kind: "bool" },
  { key: "has_vulnerability_management", label: "Gestione vulnerabilità", kind: "bool" },
  { key: "has_external_exposure_monitoring", label: "Monitoraggio esposizione esterna", kind: "bool" },
  { key: "has_dark_web_monitoring", label: "Monitoraggio credenziali esposte", kind: "bool" },
  { key: "has_infrastructure_monitoring", label: "Monitoraggio infrastruttura", kind: "bool" },
  { key: "supplier_notes", label: "Note del fornitore", kind: "text" },
];

export const MODEL_LABEL: Record<string, string> = {
  internal: "Interna", system_integrator: "System integrator", msp: "MSP", hybrid: "Ibrida",
};
