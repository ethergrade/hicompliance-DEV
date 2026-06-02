// SurfaceGraph types — adapted from Flowsint graph.ts
// GraphNode and GraphEdge are the core data structures for the attack surface knowledge graph.

export const NODE_TYPE_COLORS: Record<string, string> = {
  Domain:       '#3b82f6',
  Subdomain:    '#6366f1',
  Ip:           '#10b981',
  Asn:          '#8b5cf6',
  Email:        '#f59e0b',
  Port:         '#ef4444',
  Certificate:  '#0ea5e9',
  DnsRecord:    '#64748b',
  Credential:   '#dc2626',
  Breach:       '#b91c1c',
  Leak:         '#ea580c',
  Organization: '#0ea5e9',
  Location:     '#84cc16',
  Website:      '#3b82f6',
  Cve:          '#f97316',
  Technology:   '#a78bfa',
  default:      '#0074D9',
};

export const NODE_TYPE_ICONS: Record<string, string> = {
  Domain:       'Globe',
  Subdomain:    'Link',
  Ip:           'Server',
  Asn:          'Network',
  Email:        'Mail',
  Port:         'Plug',
  Certificate:  'Shield',
  DnsRecord:    'FileText',
  Credential:   'Key',
  Breach:       'AlertTriangle',
  Leak:         'Droplets',
  Organization: 'Building2',
  Location:     'MapPin',
  Website:      'Globe2',
  Cve:          'Bug',
  Technology:   'Cpu',
  default:      'Circle',
};

export const NODE_TYPE_SHAPES: Record<string, NodeShape> = {
  Credential: 'triangle',
  Breach:     'triangle',
  Leak:       'triangle',
  Cve:        'hexagon',
  Asn:        'hexagon',
  Organization: 'square',
};

export type NodeProperties = Record<string, any>;
export type NodeMetadata   = Record<string, any>;
export type NodeShape      = 'circle' | 'square' | 'hexagon' | 'triangle';
export type FlagColor      = 'red' | 'orange' | 'blue' | 'green' | 'yellow';

export const flagColors = {
  red:    'text-red-400 fill-red-200',
  orange: 'text-orange-400 fill-orange-200',
  blue:   'text-blue-400 fill-blue-200',
  green:  'text-green-400 fill-green-200',
  yellow: 'text-yellow-400 fill-yellow-200',
} as const;

export type GraphNode = {
  id:             string;
  nodeType:       string;
  nodeLabel:      string;
  nodeProperties: NodeProperties;
  nodeSize:       number;
  nodeColor:      string | null;
  nodeIcon:       string | null;
  nodeImage:      string | null;
  nodeFlag:       FlagColor | null;
  nodeShape:      NodeShape | null;
  nodeMetadata:   NodeMetadata;
  x:              number;
  y:              number;
  // runtime fields set by react-force-graph-2d
  val?:           number;
  neighbors?:     GraphNode[];
  links?:         GraphEdge[];
};

export type GraphEdge = {
  id:               string;
  source:           string;
  target:           string;
  label:            string;
  caption?:         string;
  type?:            string;
  weight?:          number;
  confidence_level?: number | string;
  date?:            string;
  curvature?:       number;
};

export type GraphInvestigation = {
  id:              string;
  organization_id: string;
  tenant_id:       string;
  name:            string;
  description:     string | null;
  node_count:      number;
  edge_count:      number;
  created_by:      string | null;
  created_at:      string;
  updated_at:      string;
};

export type GraphEnricherRun = {
  id:               string;
  investigation_id: string;
  organization_id:  string;
  enricher_name:    string;
  input_node_ids:   string[];
  status:           'running' | 'completed' | 'failed' | 'skipped';
  nodes_created:    number;
  edges_created:    number;
  error_message:    string | null;
  started_at:       string;
  completed_at:     string | null;
};

// Enricher definitions (what inputs each enricher accepts)
export type EnricherDef = {
  id:          string;
  label:       string;
  description: string;
  inputTypes:  string[];
  outputTypes: string[];
  icon:        string;
  color:       string;
};

export const ENRICHER_REGISTRY: EnricherDef[] = [
  { id: 'domain_to_ips',           label: 'Resolve IPs',         description: 'DNS A/AAAA resolution',          inputTypes: ['Domain','Subdomain'], outputTypes: ['Ip'],          icon: 'Globe',       color: '#3b82f6' },
  { id: 'domain_to_subdomains',    label: 'Find Subdomains',     description: 'crt.sh + DNSDumpster',           inputTypes: ['Domain'],             outputTypes: ['Subdomain'],   icon: 'Link',        color: '#6366f1' },
  { id: 'domain_to_whois',         label: 'WHOIS / RDAP',        description: 'Registrar, dates, nameservers',  inputTypes: ['Domain'],             outputTypes: ['Organization'], icon: 'FileText',   color: '#0ea5e9' },
  { id: 'domain_to_asn',           label: 'ASN Lookup',          description: 'BGP/ASN from domain',            inputTypes: ['Domain','Subdomain'], outputTypes: ['Asn'],         icon: 'Network',     color: '#8b5cf6' },
  { id: 'domain_to_email_security',label: 'Email Security',      description: 'SPF, DKIM, DMARC analysis',      inputTypes: ['Domain'],             outputTypes: ['DnsRecord'],   icon: 'Mail',        color: '#f59e0b' },
  { id: 'domain_to_leaks',         label: 'Search IntelX',       description: 'IntelX Search API',              inputTypes: ['Domain'],             outputTypes: ['Leak','Credential'], icon: 'Eye',   color: '#ef4444' },
  { id: 'ip_to_ports',             label: 'Port Scan (Shodan)',   description: 'Open ports via Shodan',          inputTypes: ['Ip'],                 outputTypes: ['Port'],        icon: 'Plug',        color: '#ef4444' },
  { id: 'ip_to_asn',               label: 'IP → ASN',            description: 'BGP/ASN ownership',             inputTypes: ['Ip'],                 outputTypes: ['Asn'],         icon: 'Network',     color: '#8b5cf6' },
  { id: 'ip_to_geo',               label: 'Geolocation',         description: 'Country, ISP, coordinates',     inputTypes: ['Ip'],                 outputTypes: ['Location','Organization'], icon: 'MapPin', color: '#84cc16' },
  { id: 'ip_to_reputation',        label: 'IP Reputation',       description: 'OTX + Tor exit node check',     inputTypes: ['Ip'],                 outputTypes: ['Breach'],      icon: 'ShieldAlert', color: '#dc2626' },
  { id: 'email_to_breaches',       label: 'Identity Leaks',      description: 'IntelX Leaks API',              inputTypes: ['Email'],              outputTypes: ['Breach','Credential'], icon: 'Key', color: '#dc2626' },
  { id: 'email_to_domain',         label: 'Email → Domain',      description: 'Extract domain from email',     inputTypes: ['Email'],              outputTypes: ['Domain'],      icon: 'Globe',       color: '#3b82f6' },
  { id: 'subdomain_to_ips',        label: 'Resolve IPs',         description: 'DNS resolution for subdomain',  inputTypes: ['Subdomain'],          outputTypes: ['Ip'],          icon: 'Server',      color: '#10b981' },
];

// Helper: build a stable node ID
export function makeNodeId(type: string, value: string): string {
  return `${type.toLowerCase()}:${value.toLowerCase().trim()}`;
}

// Helper: build a new GraphNode
export function buildNode(
  type: string,
  value: string,
  label: string,
  properties: NodeProperties = {},
  overrides: Partial<GraphNode> = {},
): GraphNode {
  return {
    id:             makeNodeId(type, value),
    nodeType:       type,
    nodeLabel:      label,
    nodeProperties: { value, ...properties },
    nodeSize:       CONSTANTS_NODE_SIZE[type] ?? 5,
    nodeColor:      NODE_TYPE_COLORS[type] ?? NODE_TYPE_COLORS.default,
    nodeIcon:       NODE_TYPE_ICONS[type] ?? NODE_TYPE_ICONS.default,
    nodeImage:      null,
    nodeFlag:       null,
    nodeShape:      NODE_TYPE_SHAPES[type] ?? 'circle',
    nodeMetadata:   {},
    x:              Math.random() * 200 - 100,
    y:              Math.random() * 200 - 100,
    ...overrides,
  };
}

const CONSTANTS_NODE_SIZE: Record<string, number> = {
  Domain:    6,
  Subdomain: 4,
  Ip:        5,
  Asn:       7,
  Email:     5,
  Port:      3,
  Cve:       4,
  Credential: 4,
  Breach:    5,
};

export function buildEdge(
  sourceId: string,
  targetId: string,
  label: string,
  extra: Partial<GraphEdge> = {},
): GraphEdge {
  return {
    id:     `${sourceId}--${label}--${targetId}`,
    source: sourceId,
    target: targetId,
    label,
    ...extra,
  };
}
