// Types derived from HiConsole OpenAPI spec (https://hiapi.websoupcloud.it/docs/api.json)

// ─── Generic API envelope ───────────────────────────────────────────────────

export interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
}

export interface ApiErrorResponse {
  success?: boolean;
  message: string;
  errors: Record<string, string[]> | null;
}

// ─── Pagination ─────────────────────────────────────────────────────────────

export interface PaginationLink {
  url: string | null;
  label: string;
  active: boolean;
}

export interface PaginationMeta {
  current_page: number;
  from: number | null;
  last_page: number;
  links: PaginationLink[];
  path: string | null;
  per_page: number;
  to: number | null;
  total: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  links: {
    first: string | null;
    last: string | null;
    prev: string | null;
    next: string | null;
  };
  meta: PaginationMeta;
}

// ─── Auth ───────────────────────────────────────────────────────────────────

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginUser {
  id: string | number;
  name: string;
  email: string;
  tenant_id: string | null;
  roles: string[];
}

export interface LoginData {
  token: string;
  user: LoginUser;
}

export interface ChangePasswordRequest {
  current_password: string;
  password: string;
  password_confirmation: string;
}

// ─── User ───────────────────────────────────────────────────────────────────

export interface UserResource {
  id: string | number;
  name: string;
  email: string;
  tenant_id: string | null;
  roles: string[];
  created_at: string;
}

export interface StoreUserRequest {
  name: string;
  email: string;
  password: string;
  role?: string;
  tenant_id?: string | null;
}

export interface UpdateUserRequest {
  name?: string;
  email?: string;
  role?: string;
  tenant_id?: string | null;
}

// ─── Tenant ─────────────────────────────────────────────────────────────────

export interface TenantResource {
  id: string;
  name: string;
  ms_tenant_id: string | null;
  contact_first_name: string | null;
  contact_last_name: string | null;
  phone: string | null;
  vat_number: string | null;
  primary_domain: string | null;
  primary_subnet: string | null;
  secondary_domain: string | null;
  secondary_subnet: string | null;
  revenue: string | null;
  employees_count: string | null;
  industry: string | null;
  customer_sectors: string[] | null;
  implemented_technologies: string[] | null;
  status: number;
  firewalls_count: number | null;
  endpoints_count: number | null;
  servers_count: number | null;
  vms_count: number | null;
  contract_start?: string | null;
  contract_duration?: number | null;
  last_scan_at?: string | null;
  ips_list?: IpRange[] | null;
  domains_list?: DomainEntry[] | null;
  is_multiple?: boolean;
  extra?: TenantDashboardExtra | null;
  created_at?: string | null;
  // Anagrafica / Organization Profile fields
  legal_name?: string | null;
  fiscal_code?: string | null;
  legal_address?: string | null;
  operational_address?: string | null;
  pec?: string | null;
  email?: string | null;
  business_sector?: string | null;
  nis2_classification?: 'soggetto_essenziale' | 'soggetto_importante' | 'nessuna' | null;
  ciso_substitute?: string | null;
}

export interface IpRange {
  start_ip: string;
  end_ip: string;
}

export interface DomainEntry {
  domain: string;
}

// ─── Tenant Dashboard Extra ──────────────────────────────────────────────────

export interface TenantDashboardExtra {
  note?: string;
  server?: number;
  utenti?: number;
  endpoint?: number;
  firewall?: number;
  ip_totali?: number;
  subnet_21?: number;
  subnet_22?: number;
  subnet_23?: number;
  subnet_24?: number;
  subnet_25?: number;
  hypervisor?: number;
  ip_puntuali?: number;
  switch_core?: number;
  access_point?: number;
  sedi_cliente?: number;
  switch_access?: number;
  virtual_machine?: number;
  dispositivi_rete_varie?: number;
  dispositivi_rete_totali?: number;
}

export interface StoreTenantRequest {
  name: string;
  ms_tenant_id?: string | null;
  contract_start?: string | null;
  contract_duration?: number | null;
  is_multiple?: boolean | null;
  nis2_classification?: 'soggetto_essenziale' | 'soggetto_importante' | 'nessuna' | null;
}

export interface UpdateTenantRequest {
  name?: string;
  ms_tenant_id?: string | null;
  contact_first_name?: string | null;
  contact_last_name?: string | null;
  phone?: string | null;
  vat_number?: string | null;
  primary_domain?: string | null;
  primary_subnet?: string | null;
  secondary_domain?: string | null;
  secondary_subnet?: string | null;
  revenue?: string | null;
  employees_count?: string | null;
  industry?: string | null;
  customer_sectors?: string[] | null;
  implemented_technologies?: string[] | null;
  status?: number;
  firewalls_count?: number;
  endpoints_count?: number;
  servers_count?: number;
  vms_count?: number;
  contract_start?: string | null;
  contract_duration?: number;
  last_scan_at?: string | null;
  is_multiple?: boolean;
  extra?: TenantDashboardExtra | null;
  ips_list?: IpRange[] | null;
  domains_list?: DomainEntry[] | null;
  // Anagrafica / Organization Profile fields
  legal_name?: string | null;
  fiscal_code?: string | null;
  legal_address?: string | null;
  operational_address?: string | null;
  pec?: string | null;
  email?: string | null;
  business_sector?: string | null;
  nis2_classification?: 'soggetto_essenziale' | 'soggetto_importante' | 'nessuna' | null;
  ciso_substitute?: string | null;
}

// ─── Assessment ─────────────────────────────────────────────────────────────

export type AssessmentQuestionValue = string | number | null;
export type AssessmentQuestions =
  | Record<string, AssessmentQuestionValue>
  | null;
export type AssessmentId = string | number;

export interface UpdateAssessmentRequest {
  status?: number;
  follow_up?: string | null;
  followup_reminder?: string | null;
  presentation_date?: string | null;
  hide_gantt?: boolean;
  custom_gantt?: GanttItem[] | null;
  questions?: Record<string, AssessmentQuestionValue> | AssessmentQuestionValue[];
}

export interface UpdateGanttRequest {
  custom_gantt?: GanttItem[] | null;
  hide_gantt?: boolean;
}

export interface AssessmentData {
  id: AssessmentId;
  tenant_id?: string | null;
  status: number;
  questions: AssessmentQuestions;
  follow_up: string | null;
  followup_reminder?: string | null;
  presentation_date: string | null;
  hide_gantt: boolean;
  custom_gantt: GanttItem[] | Record<string, unknown>[] | null;
  generated_at: string | null;
  updated_by?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface AssessmentSummary {
  completion_score: number;
  risk_score: number;
  completion_color: string;
  risk_color: string;
  risk_label: string;
  totals_by_answer: [number, number, number, number];
  answer_labels: [string, string, string, string];
}

export interface RadarCategory {
  name: string;
  completion_percent: number;
}

export interface GanttItem {
  id?: string | number;
  name?: string;
  task?: string;
  start: string;
  end: string;
  duration?: string | number;
  progress?: boolean;
  hidden?: boolean;
  withprev?: string | number | boolean;
  [key: string]: unknown;
}

export interface OpenAIAnalysis {
  intro: string[];
  analysis: string[];
  categories: string[];
  outro: string[];
}

export interface IntelXData {
  raw: unknown[] | null;
  buckets: string;
  mediahs: string;
}

export interface ShodanScanAggregated {
  total_hosts: number;
  hosts: unknown[];
  top_ports: unknown[];
  cve_counts: unknown[];
  countries: string;
}

export interface ShodanScan {
  date: string;
  aggregated: ShodanScanAggregated;
}

export interface Vulnerability {
  cve: string;
  count: string;
  affected_ips: string[];
  epss_score: number | null;
  severity: string;
}

export interface AssessmentReportAssessment {
  id: number;
  status: number;
  follow_up: string;
  followup_reminder: string;
  presentation_date: string;
  hide_gantt: boolean;
  generated_at: string | null;
  updated_at: string;
}

export interface AssessmentReportData {
  assessment: AssessmentReportAssessment;
  tenant: TenantResource;
  summary: AssessmentSummary;
  categories: string;
  gantt: GanttItem[] | null;
  openai: OpenAIAnalysis | string[];
  shodan: unknown[] | null;
  intelx: IntelXData | string[];
}

export interface MonthlyReportDelta {
  hosts: string | null;
  cves: string | null;
}

export interface AssessmentMonthlyReportData {
  tenant: TenantResource;
  assessment: AssessmentReportAssessment;
  scans: ShodanScan[];
  vulnerabilities: Vulnerability[];
  radar_categories: RadarCategory[];
  trend: unknown[];
  delta: MonthlyReportDelta;
}
// ─── Tenant Service ──────────────────────────────────────────────────────────

export interface TenantServiceResource {
  id: string;
  tenant_id: string;
  site_id: string | null;
  service_type: string;
  status: string;
  settings: unknown[] | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface StoreTenantServiceRequest {
  site_id?: string | null;
  service_type: string;
  status?: "active" | "inactive" | null;
  settings?: string[] | null;
}

export interface UpdateTenantServiceRequest {
  site_id?: string | null;
  service_type?: string;
  status?: "active" | "inactive";
  settings?: string[] | null;
}
// ─── Asset Inventory ────────────────────────────────────────────────────────

export interface AssetInventoryResource {
  id: string;
  organization_id: string;
  users_count: number;
  locations_count: number;
  endpoints_count: number;
  servers_count: number;
  hypervisors_count: number;
  virtual_machines_count: number;
  firewalls_count: number;
  core_switches_count: number;
  access_switches_count: number;
  access_points_count: number;
  miscellaneous_network_devices_count: number;
  total_network_devices_count: number;
  va_ip_punctual_count: number;
  va_subnet_25_count: number;
  va_subnet_24_count: number;
  va_subnet_23_count: number;
  va_subnet_22_count: number;
  va_subnet_21_count: number;
  va_total_ips_count: number;
  notes: string;
  hilog_syslog_count: number;
  hilog_iis_count: number;
  hilog_apache_count: number;
  hilog_sql_count: number;
  hilog_custom_path_count: number;
  hilog_endpoint_count: number;
  hilog_server_count: number;
  hilog_dlp_linux_count: number;
  hilog_dlp_windows_count: number;
  hilog_sharepoint_dlp_enabled: boolean;
  hilog_sharepoint_dlp_count: number;
  hilog_entra_id_enabled: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface StoreAssetInventoryRequest {
  organization_id: string;
  users_count?: number;
  locations_count?: number;
  endpoints_count?: number;
  servers_count?: number;
  hypervisors_count?: number;
  virtual_machines_count?: number;
  firewalls_count?: number;
  core_switches_count?: number;
  access_switches_count?: number;
  access_points_count?: number;
  miscellaneous_network_devices_count?: number;
  total_network_devices_count?: number;
  va_ip_punctual_count?: number;
  va_subnet_25_count?: number;
  va_subnet_24_count?: number;
  va_subnet_23_count?: number;
  va_subnet_22_count?: number;
  va_subnet_21_count?: number;
  va_total_ips_count?: number;
  notes?: string;
  hilog_syslog_count?: number;
  hilog_iis_count?: number;
  hilog_apache_count?: number;
  hilog_sql_count?: number;
  hilog_custom_path_count?: number;
  hilog_endpoint_count?: number;
  hilog_server_count?: number;
  hilog_dlp_linux_count?: number;
  hilog_dlp_windows_count?: number;
  hilog_sharepoint_dlp_enabled?: boolean;
  hilog_sharepoint_dlp_count?: number;
  hilog_entra_id_enabled?: boolean;
}

export interface UpdateAssetInventoryRequest extends Partial<StoreAssetInventoryRequest> {}

// ─── Integrations ───────────────────────────────────────────────────────────

export interface IntegrationResource {
  id: string;
  organization_id: string;
  service_id: string;
  service_code: string;
  service_name: string;
  api_url: string;
  is_active: boolean;
  api_methods?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
}

export interface ServiceCatalogItem {
  id: string;
  code: string;
  name: string;
  description?: string;
  icon?: string;
  is_active?: boolean;
}

export interface StoreIntegrationRequest {
  organization_id: string;
  service_id: string;
  api_url: string;
  api_key?: string;
  api_methods?: Record<string, unknown>;
}

export interface UpdateIntegrationRequest {
  api_url?: string;
  api_key?: string;
  is_active?: boolean;
  api_methods?: Record<string, unknown>;
}
