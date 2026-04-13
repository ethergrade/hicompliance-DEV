// Types derived from HiConsole OpenAPI spec (https://hiapi.websoupcloud.it/docs/api.json)

// ─── Generic API envelope ───────────────────────────────────────────────────

export interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
}

export interface ApiErrorResponse {
  success: boolean;
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
  id: string;
  name: string;
  email: string;
  tenant_id: string;
  roles: string;
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
  id: number;
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
}

export interface UpdateUserRequest {
  name?: string;
  email?: string;
  role?: string;
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
  firewalls_count: number;
  endpoints_count: number;
  servers_count: number;
  vms_count: number;
  contract_start: string;
  contract_duration: number;
  last_scan_at: string;
  ips_list: IpRange[] | null;
  domains_list: DomainEntry[] | null;
  is_multiple: boolean;
  extra: string[] | null;
  created_at: string;
}

export interface IpRange {
  start_ip: string;
  end_ip: string;
}

export interface DomainEntry {
  domain: string;
}

export interface StoreTenantRequest {
  name: string;
  ms_tenant_id?: string | null;
  contract_start?: string | null;
  contract_duration?: number | null;
  is_multiple?: boolean | null;
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
  extra?: string[] | null;
  ips_list?: IpRange[] | null;
  domains_list?: DomainEntry[] | null;
}

// ─── Assessment ─────────────────────────────────────────────────────────────

export interface UpdateAssessmentRequest {
  status?: number;
  follow_up?: string | null;
  followup_reminder?: string | null;
  presentation_date?: string | null;
  hide_gantt?: boolean;
  custom_gantt?: string[] | null;
  questions?: number[];
}

export interface AssessmentData {
  id: string;
  status: string;
  questions: string;
  follow_up: string;
  presentation_date: string;
  hide_gantt: string;
  custom_gantt: string;
  generated_at: string;
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
  name: string;
  start: string;
  end: string;
  duration: string | number;
  progress: boolean;
  hidden: boolean;
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
