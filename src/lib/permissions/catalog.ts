// Centralized RBAC/ACL catalog: modules + sub-sections that can be gated
// Each entry maps a module/subsection to its display name and which actions
// are meaningful (view, edit, export).

export type PermAction = 'view' | 'edit' | 'export';

export interface SubsectionDef {
  key: string;
  label: string;
  actions?: PermAction[]; // default: all three
}
export interface ModuleDef {
  key: string;
  label: string;
  /** Route prefixes that belong to this module (used for sidebar gating) */
  routes: string[];
  subsections: SubsectionDef[];
}

export const PERMISSION_CATALOG: ModuleDef[] = [
  {
    key: 'dashboard',
    label: 'Dashboard',
    routes: ['/dashboard'],
    subsections: [{ key: '_root', label: 'Dashboard principale', actions: ['view', 'export'] }],
  },
  {
    key: 'hicompliance',
    label: 'HiCompliance',
    routes: ['/assessment', '/analytics', '/remediation', '/compliance-events'],
    subsections: [
      { key: 'assessment', label: 'Assessment' },
      { key: 'analytics', label: 'Analisi' },
      { key: 'remediation', label: 'Remediation' },
      { key: 'compliance_events', label: 'Eventi Compliance' },
    ],
  },
  {
    key: 'surface_scan',
    label: 'SurfaceScan360',
    routes: ['/surface-scan'],
    subsections: [
      { key: 'exposed_assets', label: 'Asset esposti' },
      { key: 'validated_cve', label: 'CVE validati' },
      { key: 'osint', label: 'OSINT enrichment' },
    ],
  },
  {
    key: 'dark_risk',
    label: 'DarkRisk360',
    routes: ['/dark-risk'],
    subsections: [{ key: '_root', label: 'Monitoraggio Dark Web' }],
  },
  {
    key: 'dark_risk_esteso',
    label: 'DARKRISK_ESTESO',
    routes: ['/dark-risk-esteso'],
    subsections: [{ key: '_root', label: 'IntelX Identity Esteso', actions: ['view'] }],
  },
  {
    key: 'irp',
    label: 'Incident Response',
    routes: ['/incident-response'],
    subsections: [
      { key: 'playbooks', label: 'Playbook' },
      { key: 'risk_analysis', label: 'Analisi Rischi' },
      { key: 'critical_infra', label: 'Infrastruttura critica' },
      { key: 'governance', label: 'Governance & Contatti' },
      { key: 'documents', label: 'Documento IRP' },
    ],
  },
  {
    key: 'ai_ciso',
    label: 'AI CISO',
    routes: ['/ai-ciso'],
    subsections: [{ key: '_root', label: 'Assistente AI', actions: ['view'] }],
  },
  {
    key: 'documents',
    label: 'Gestione Documenti',
    routes: ['/documents'],
    subsections: [{ key: '_root', label: 'Documenti', actions: ['view', 'edit', 'export'] }],
  },
  {
    key: 'asset_inventory',
    label: 'Inventario Asset',
    routes: ['/asset-inventory', '/consistenze'],
    subsections: [
      { key: 'inventory', label: 'Inventario' },
      { key: 'consistenze', label: 'Consistenze' },
    ],
  },
  {
    key: 'threats',
    label: 'Minacce & News',
    routes: ['/threats', '/threat-management', '/cyber-news'],
    subsections: [
      { key: 'threats', label: 'Minacce', actions: ['view', 'export'] },
      { key: 'cyber_news', label: 'CyberNews', actions: ['view'] },
    ],
  },
  {
    key: 'reports',
    label: 'Report',
    routes: ['/reports'],
    subsections: [{ key: '_root', label: 'Report', actions: ['view', 'export'] }],
  },
];

export const ROUTE_TO_MODULE: Record<string, { module: string; subsection: string }> = (() => {
  const map: Record<string, { module: string; subsection: string }> = {};
  for (const m of PERMISSION_CATALOG) {
    for (const sub of m.subsections) {
      // best-effort route mapping (used by sidebar)
    }
    for (const r of m.routes) {
      map[r] = { module: m.key, subsection: '_root' };
    }
  }
  // explicit sub-mappings
  map['/assessment'] = { module: 'hicompliance', subsection: 'assessment' };
  map['/analytics'] = { module: 'hicompliance', subsection: 'analytics' };
  map['/remediation'] = { module: 'hicompliance', subsection: 'remediation' };
  map['/compliance-events'] = { module: 'hicompliance', subsection: 'compliance_events' };
  map['/asset-inventory'] = { module: 'asset_inventory', subsection: 'inventory' };
  map['/consistenze'] = { module: 'asset_inventory', subsection: 'consistenze' };
  map['/cyber-news'] = { module: 'threats', subsection: 'cyber_news' };
  map['/threats'] = { module: 'threats', subsection: 'threats' };
  return map;
})();

export const ALL_ACTIONS: PermAction[] = ['view', 'edit', 'export'];

export type PermissionMap = Record<
  string, // module key
  Record<string, Partial<Record<PermAction, boolean>>> // subsection -> action -> bool
>;

/** Build default permissions: everything allowed */
export function buildDefaultPermissions(): PermissionMap {
  const out: PermissionMap = {};
  for (const m of PERMISSION_CATALOG) {
    out[m.key] = {};
    for (const sub of m.subsections) {
      const actions = sub.actions ?? ALL_ACTIONS;
      out[m.key][sub.key] = Object.fromEntries(actions.map((a) => [a, true]));
    }
  }
  return out;
}
