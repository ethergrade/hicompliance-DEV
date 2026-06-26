import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.50.3";
import {
  csAuthorize,
  csGetOrCreateDomain,
  csScanNow,
  csWaitForResults,
  csMapToFindings,
  csExtractSubdomains,
  csNormalizeClientAuthToken,
  type CsConfig,
} from "./connectsecure-adapter.ts";
import {
  classifyTargetScope,
  classifyHostForScope,
  evaluateOrganizationServiceGate,
  fetchWithTimeout,
  fetchWithSsrfGuard,
  isIpWithinMonitoredScope,
  normalizeTargetInput,
  resolveWithDnsOverHttps,
  summarizeDnssecStatus,
  summarizeThreatSignals,
  summarizeWhoisRdap,
  summarizeWhoisText,
  splitMonitoredScopeRules,
  toSeverity,
  TargetType,
  type WhoisRdapSummary,
} from "./surface-scan-utils.ts";
import {
  evaluateHeaders,
  type HttpHeaderScanReport,
} from "./httpHeadersScanner.ts";
import {
  scanDnsLookup,
  type DnsLookupResult,
} from "./dnsLookupScanner.ts";
import {
  resolveAmassDiscoveryGate,
  runAmassDiscovery,
} from "./amassDiscovery.ts";
import { firecrawlScrape } from "./darkrisk-dti-enrichment.ts";

interface SurfaceScanJob {
  id: string;
  organization_id?: string | null;
  tenant_id: string | null;
  customer_id: string | null;
  requested_by: string | null;
  raw_target: string;
  normalized_target: string;
  target_type: TargetType;
  hostname: string | null;
  root_domain: string | null;
  resolved_ips: string[] | null;
  scan_profile: string;
  status: string;
  started_at?: string | null;
  completed_at?: string | null;
  created_at?: string | null;
  scan_type?: string | null;
  config?: Record<string, unknown> | null;
  summary?: Record<string, unknown> | null;
}

interface RunOptions {
  initiatedByUserId?: string | null;
  force?: boolean;
}

interface DispatchQueueOptions {
  initiatedByUserId?: string | null;
  maxToStart?: number;
}

interface FindingInput {
  provider?: string;
  module?: string;
  finding_type: string;
  title: string;
  description?: string;
  severity?: string;
  affected_asset?: string | null;
  affected_url?: string | null;
  ip?: string | null;
  port?: number | null;
  protocol?: string | null;
  cve?: string[] | null;
  cwe?: string[] | null;
  cvss?: number | null;
  epss?: number | null;
  cisa_kev?: boolean;
  remediation?: string | null;
  evidence?: Record<string, unknown>;
  attribution_confidence?: string;
  status?: string;
}

interface ObservationInput {
  module: string;
  observation_type: string;
  title: string;
  value: Record<string, unknown>;
  severity?: string;
  confidence?: string;
  asset_id?: string | null;
}

interface AssetInput {
  asset_type: string;
  asset_value: string;
  hostname?: string | null;
  root_domain?: string | null;
  ip?: string | null;
  source: string;
  confidence?: string;
  raw?: Record<string, unknown>;
}

type DnsBlocklistCheck = {
  provider: string;
  ip: string;
  listed: boolean;
  status: "listed" | "not_listed" | "lookup_blocked" | "lookup_error";
  records: string[];
  reason?: string;
  secondary_records?: string[];
};

function classifyDnsBlocklistResponse(provider: string, answers: string[]): {
  listed: boolean;
  status: DnsBlocklistCheck["status"];
  reason?: string;
} {
  const normalizedProvider = String(provider || "").toLowerCase();
  const records = answers.map((entry) => String(entry || "").trim()).filter(Boolean);
  if (records.length === 0) return { listed: false, status: "not_listed" };

  // Spamhaus returns 127.255.255.x when the lookup is blocked or performed
  // through an unsupported public resolver. This is not a blacklist hit.
  if (records.some((entry) => /^127\.255\.255\.\d+$/.test(entry))) {
    return {
      listed: false,
      status: "lookup_blocked",
      reason: "dnsbl_lookup_blocked_or_rate_limited",
    };
  }

  if (normalizedProvider.includes("spamhaus")) {
    const validSpamhausZenCodes = new Set([
      "127.0.0.2",
      "127.0.0.3",
      "127.0.0.4",
      "127.0.0.5",
      "127.0.0.6",
      "127.0.0.7",
      "127.0.0.9",
      "127.0.0.10",
      "127.0.0.11",
    ]);
    return {
      listed: records.some((entry) => validSpamhausZenCodes.has(entry)),
      status: records.some((entry) => validSpamhausZenCodes.has(entry)) ? "listed" : "lookup_error",
      reason: records.some((entry) => validSpamhausZenCodes.has(entry)) ? undefined : "unrecognized_spamhaus_dnsbl_code",
    };
  }

  const listed = records.some((entry) => /^127\./.test(entry));
  return {
    listed,
    status: listed ? "listed" : "lookup_error",
    reason: listed ? undefined : "unrecognized_dnsbl_response",
  };
}

function mergeDnsblClassifications(
  provider: string,
  primary: { listed: boolean; status: DnsBlocklistCheck["status"]; reason?: string },
  secondary: { listed: boolean; status: DnsBlocklistCheck["status"]; reason?: string },
): { listed: boolean; status: DnsBlocklistCheck["status"]; reason?: string } {
  const normalizedProvider = String(provider || "").toLowerCase();
  if (!normalizedProvider.includes("spamhaus")) return primary;

  if (primary.listed && secondary.listed) {
    return { listed: true, status: "listed" };
  }
  if (
    (primary.listed && secondary.status === "lookup_blocked") ||
    (secondary.listed && primary.status === "lookup_blocked")
  ) {
    return { listed: true, status: "listed", reason: "listed_with_partial_quorum_lookup_blocked" };
  }
  if (primary.listed !== secondary.listed) {
    return {
      listed: false,
      status: "lookup_error",
      reason: "ambiguous_spamhaus_dnsbl_quorum_mismatch",
    };
  }
  if (primary.status === "lookup_blocked" || secondary.status === "lookup_blocked") {
    return {
      listed: false,
      status: "lookup_blocked",
      reason: "dnsbl_lookup_blocked_or_rate_limited",
    };
  }
  return { listed: false, status: "not_listed" };
}

type ModuleStatus = "queued" | "running" | "success" | "skipped" | "error" | "timeout";

interface ModuleExecutionConfig {
  key: string;
  label: string;
  timeoutMs: number;
  featureFlag?: string;
  defaultEnabled?: boolean;
  retryOnError?: boolean;
  maxRetries?: number;
  retryBackoffMs?: number;
}

interface ModuleExecutionRecord {
  key: string;
  label: string;
  status: ModuleStatus;
  severity?: "info" | "low" | "medium" | "high" | "critical";
  started_at?: string;
  completed_at?: string;
  duration_ms?: number;
  error_message?: string | null;
  source?: string | null;
}

type SurfaceEngineStatus = "success" | "partial" | "failed" | "skipped";

type SurfaceEngineEnvelope = {
  engine: string;
  target: string;
  status: SurfaceEngineStatus;
  durationMs: number;
  error?: string | null;
  summary?: Record<string, unknown>;
};

let dnsDumpsterLastRequestAt = 0;

const waitMs = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const asStringArray = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry || "").trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? [trimmed] : [];
  }
  return [];
};

function toPositiveInt(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.round(parsed);
}

function severityRank(severity: string): number {
  switch (toSeverity(severity)) {
    case "critical":
      return 5;
    case "high":
      return 4;
    case "medium":
      return 3;
    case "low":
      return 2;
    default:
      return 1;
  }
}

const CRITICAL_EXPOSED_PORTS = new Set([3389, 5900, 6379, 9200, 9300, 27017, 11211]);
const HIGH_EXPOSED_PORTS = new Set([21, 23, 445, 3306, 5432, 1521, 5060]);
const MEDIUM_EXPOSED_PORTS = new Set([22, 25, 8080, 8443, 9443, 8000, 9000, 9090, 8081]);
const INFO_EXPOSED_PORTS = new Set([80, 443, 587, 993, 995, 53, 110, 143, 465]);
const COMMON_PORTS = [
  20, 21, 22, 23, 25, 53, 67, 68, 69, 80, 110, 119, 123, 143, 156,
  161, 162, 179, 194, 389, 443, 587, 993, 995, 3000, 3306, 3389,
  5060, 5900, 8000, 8080, 8888, 8443, 9443, 9200, 9300, 5432, 6379,
  27017, 11211, 1521, 8081, 9000, 9090,
];

// ─── TCP Port Scanner — lista porte, mappa servizi, CVE hints ────────────────

const TCP_PROBE_PORTS = [
  // Accesso remoto
  21, 22, 23, 3389, 5900, 5901, 990, 20,
  // Mail
  25, 110, 143, 465, 587, 993, 995,
  // Web
  80, 443, 8080, 8443, 8888, 9000, 9090, 9443, 7080, 7443, 3000, 4000, 5000, 10000,
  // Database
  1433, 1521, 3306, 5432, 5984, 6379, 9200, 9300, 11211, 27017, 27018, 28017,
  // Rete/Infrastruttura
  53, 161, 389, 636, 2049, 111, 135, 139, 445,
  // Container/Cloud native
  2375, 2376, 2379, 2380, 6443, 10250, 10255, 8500, 4646,
  // Message Queue
  5672, 15672, 9092, 2181,
  // VPN/Tunneling
  1194, 1723, 500,
  // Stampa/IoT
  515, 631, 9100,
  // Altro
  69, 79, 88, 9418,
];

const PORT_SERVICE: Record<number, { name: string; description: string; risk: string }> = {
  20:    { name: "ftp-data",     description: "FTP Data Transfer",                         risk: "Trasferimento file non cifrato" },
  21:    { name: "ftp",          description: "FTP - File Transfer Protocol",               risk: "Credenziali in chiaro, directory traversal" },
  22:    { name: "ssh",          description: "SSH - Secure Shell",                         risk: "Brute force, versioni vulnerabili" },
  23:    { name: "telnet",       description: "Telnet - terminale non cifrato",             risk: "Credenziali e dati in chiaro" },
  25:    { name: "smtp",         description: "SMTP Mail Relay",                            risk: "Open relay, spam, enumerazione utenti" },
  53:    { name: "dns",          description: "DNS - Domain Name System",                  risk: "Zone transfer, amplification DDoS" },
  69:    { name: "tftp",         description: "TFTP - Trivial FTP",                        risk: "Nessuna autenticazione, accesso file" },
  79:    { name: "finger",       description: "Finger - user info",                        risk: "Enumerazione utenti sistema" },
  80:    { name: "http",         description: "HTTP Web Server",                            risk: "Applicazioni web non cifrate" },
  88:    { name: "kerberos",     description: "Kerberos Authentication",                   risk: "Kerberoasting, AS-REP roasting" },
  110:   { name: "pop3",         description: "POP3 Mail",                                 risk: "Credenziali in chiaro" },
  111:   { name: "rpcbind",      description: "RPC Portmapper",                            risk: "Enumerazione servizi RPC/NFS" },
  135:   { name: "msrpc",        description: "Microsoft RPC Endpoint Mapper",             risk: "Enumerazione servizi Windows, lateral movement" },
  139:   { name: "netbios-ssn",  description: "NetBIOS Session Service",                   risk: "Enumerazione SMB, pass-the-hash" },
  143:   { name: "imap",         description: "IMAP Mail",                                 risk: "Credenziali in chiaro" },
  161:   { name: "snmp",         description: "SNMP Network Management",                   risk: "Community string default, info disclosure" },
  389:   { name: "ldap",         description: "LDAP Directory Service",                   risk: "Enumerazione utenti AD, credenziali in chiaro" },
  443:   { name: "https",        description: "HTTPS Web Server",                          risk: "Versioni TLS/cipher deboli" },
  445:   { name: "smb",          description: "SMB - Server Message Block",               risk: "EternalBlue CVE-2017-0144, ransomware" },
  465:   { name: "smtps",        description: "SMTP over TLS",                             risk: "Configurazione TLS debole" },
  500:   { name: "isakmp",       description: "IKE/IPSec VPN",                             risk: "Vulnerabilità IKEv1" },
  515:   { name: "lpd",          description: "Line Printer Daemon",                       risk: "Stampa non autenticata, path traversal" },
  587:   { name: "submission",   description: "SMTP Mail Submission",                      risk: "Open relay se mal configurato" },
  631:   { name: "ipp",          description: "Internet Printing Protocol",                risk: "CUPS vulnerabilità, info disclosure" },
  636:   { name: "ldaps",        description: "LDAP over TLS",                             risk: "Configurazione TLS, certificate validation" },
  990:   { name: "ftps",         description: "FTP over TLS",                              risk: "Configurazione TLS debole" },
  993:   { name: "imaps",        description: "IMAP over TLS",                             risk: "Configurazione TLS debole" },
  995:   { name: "pop3s",        description: "POP3 over TLS",                             risk: "Configurazione TLS debole" },
  1194:  { name: "openvpn",      description: "OpenVPN",                                   risk: "CVE-2017-7479, configurazioni deboli" },
  1433:  { name: "mssql",        description: "Microsoft SQL Server",                      risk: "SA blank password, xp_cmdshell, injection" },
  1521:  { name: "oracle",       description: "Oracle Database",                           risk: "Default credentials, TNS Poison" },
  1723:  { name: "pptp",         description: "PPTP VPN",                                  risk: "MS-CHAPv2 vulnerabile" },
  2049:  { name: "nfs",          description: "NFS - Network File System",                risk: "Mount senza autenticazione, root squash" },
  2181:  { name: "zookeeper",    description: "Apache ZooKeeper",                         risk: "Nessuna autenticazione default, info disclosure" },
  2375:  { name: "docker",       description: "Docker API (non TLS!)",                    risk: "RCE completo, escape container CRITICO" },
  2376:  { name: "docker-tls",   description: "Docker API over TLS",                      risk: "Configurazione TLS, client auth" },
  2379:  { name: "etcd",         description: "etcd - Kubernetes key-value",              risk: "Secrets Kubernetes in chiaro, no auth default" },
  2380:  { name: "etcd-peer",    description: "etcd peer communication",                  risk: "Cluster takeover" },
  3000:  { name: "grafana",      description: "Grafana Dashboard",                        risk: "Default admin:admin, CVE-2021-43798" },
  3306:  { name: "mysql",        description: "MySQL / MariaDB",                          risk: "Default root senza password, SQL injection" },
  3389:  { name: "rdp",          description: "RDP - Remote Desktop Protocol",            risk: "BlueKeep CVE-2019-0708, brute force" },
  4000:  { name: "http-dev",     description: "HTTP Dev Server",                          risk: "Applicazioni in ambiente development" },
  4646:  { name: "nomad",        description: "HashiCorp Nomad",                          risk: "Nessun ACL default, exec arbitrario" },
  5000:  { name: "http-alt",     description: "HTTP alternativo / Docker Registry",       risk: "Registry non autenticato" },
  5432:  { name: "postgresql",   description: "PostgreSQL Database",                      risk: "Default postgres senza password, COPY TO/FROM" },
  5672:  { name: "amqp",         description: "RabbitMQ AMQP",                            risk: "Default guest:guest, message injection" },
  5900:  { name: "vnc",          description: "VNC Remote Desktop",                       risk: "Nessuna password, CVE-2019-15681" },
  5901:  { name: "vnc-1",        description: "VNC display :1",                           risk: "Nessuna password, accesso desktop remoto" },
  5984:  { name: "couchdb",      description: "CouchDB HTTP API",                         risk: "Admin party (no auth), CVE-2017-12635" },
  6379:  { name: "redis",        description: "Redis in-memory DB",                      risk: "No auth default, RCE via config write, CVE-2023-28425" },
  6443:  { name: "k8s-api",      description: "Kubernetes API Server",                   risk: "Cluster takeover, CVE-2018-1002105" },
  7080:  { name: "http-alt",     description: "HTTP alternativo",                        risk: "Pannelli admin non cifrati" },
  7443:  { name: "https-alt",    description: "HTTPS alternativo",                       risk: "TLS configuration" },
  8080:  { name: "http-proxy",   description: "HTTP alternativo / proxy",                risk: "Pannelli admin, Tomcat, Jenkins esposti" },
  8443:  { name: "https-alt",    description: "HTTPS alternativo (Tomcat/JBoss/WebLogic)", risk: "Admin panel esposto" },
  8500:  { name: "consul",       description: "HashiCorp Consul HTTP",                   risk: "Nessun ACL default, service mesh takeover" },
  8888:  { name: "jupyter",      description: "Jupyter Notebook / HTTP alt",             risk: "Nessun token, RCE arbitrario" },
  9000:  { name: "sonarqube",    description: "SonarQube / Portainer",                   risk: "Default admin, code disclosure" },
  9090:  { name: "prometheus",   description: "Prometheus Metrics",                      risk: "Info disclosure, CVE-2019-3826" },
  9092:  { name: "kafka",        description: "Apache Kafka",                            risk: "No auth default, message interception" },
  9100:  { name: "jetdirect",    description: "HP JetDirect / RAW print",               risk: "Info disclosure, phishing via printer" },
  9200:  { name: "elasticsearch",description: "Elasticsearch HTTP API",                 risk: "No auth default, dati esposti, CVE-2021-22145" },
  9300:  { name: "es-transport", description: "Elasticsearch transport",                risk: "Cluster join non autenticato" },
  9418:  { name: "git",          description: "Git daemon",                              risk: "Repository esposti in lettura" },
  9443:  { name: "https-alt",    description: "HTTPS alternativo",                      risk: "TLS configuration" },
  10000: { name: "webmin",       description: "Webmin Admin Panel",                     risk: "CVE-2019-15107 RCE, brute force" },
  10250: { name: "kubelet",      description: "Kubernetes Kubelet API",                 risk: "RCE, pod/secret access CRITICO" },
  10255: { name: "kubelet-ro",   description: "Kubernetes Kubelet read-only",           risk: "Info disclosure pods/secrets" },
  11211: { name: "memcached",    description: "Memcached",                              risk: "No auth, data dump, DDoS amplification" },
  15672: { name: "rabbitmq-ui",  description: "RabbitMQ Management UI",                 risk: "Default guest:guest, message injection" },
  27017: { name: "mongodb",      description: "MongoDB",                                risk: "No auth default, data dump CRITICO" },
  27018: { name: "mongodb-shard",description: "MongoDB Shard",                         risk: "No auth default" },
  28017: { name: "mongodb-web",  description: "MongoDB Web Interface",                  risk: "Info disclosure, admin panel" },
};

const SERVICE_CVE_MAP: Record<string, string[]> = {
  openssh:       ["CVE-2024-6387","CVE-2023-38408","CVE-2021-41617","CVE-2018-15473"],
  rdp:           ["CVE-2019-0708","CVE-2020-0609","CVE-2020-0610","CVE-2021-34527"],
  vnc:           ["CVE-2019-15681","CVE-2006-2369","CVE-2023-29445"],
  telnet:        ["CVE-1999-0619","CVE-2011-4862"],
  ftp:           ["CVE-1999-0497","CVE-2010-4221","CVE-2015-3306"],
  apache:        ["CVE-2021-41773","CVE-2021-42013","CVE-2023-25690","CVE-2022-22721"],
  nginx:         ["CVE-2021-23017","CVE-2022-41741","CVE-2022-41742"],
  iis:           ["CVE-2022-21907","CVE-2021-31166","CVE-2017-7269"],
  tomcat:        ["CVE-2020-1938","CVE-2019-0232","CVE-2017-12617"],
  weblogic:      ["CVE-2023-21839","CVE-2021-2109","CVE-2020-14882"],
  jboss:         ["CVE-2017-12149","CVE-2015-7501"],
  jenkins:       ["CVE-2024-23897","CVE-2023-43494","CVE-2019-1003000"],
  php:           ["CVE-2024-4577","CVE-2022-31625","CVE-2021-21703"],
  openssl:       ["CVE-2022-0778","CVE-2021-3449","CVE-2021-3450","CVE-2014-0160"],
  mysql:         ["CVE-2023-21980","CVE-2022-21427","CVE-2020-2574"],
  postgresql:    ["CVE-2023-2454","CVE-2023-2455","CVE-2019-9193"],
  mssql:         ["CVE-2020-0618","CVE-2019-1068","CVE-2018-8273"],
  oracle:        ["CVE-2022-21410","CVE-2021-2121","CVE-2020-14871"],
  redis:         ["CVE-2023-28425","CVE-2022-0543","CVE-2015-8080"],
  elasticsearch: ["CVE-2021-22145","CVE-2021-22144","CVE-2015-1427"],
  mongodb:       ["CVE-2021-20328","CVE-2021-32035"],
  memcached:     ["CVE-2018-1000115","CVE-2011-4971"],
  couchdb:       ["CVE-2022-24706","CVE-2017-12635","CVE-2017-12636"],
  smb:           ["CVE-2017-0144","CVE-2020-0796","CVE-2021-34527"],
  msrpc:         ["CVE-2003-0352","CVE-2008-4250"],
  ldap:          ["CVE-2021-44228","CVE-2017-8563"],
  kerberos:      ["CVE-2020-17049","CVE-2014-6324"],
  docker:        ["CVE-2019-5736","CVE-2020-15257","CVE-2021-41091"],
  kubernetes:    ["CVE-2018-1002105","CVE-2019-9946","CVE-2019-11253"],
  etcd:          ["CVE-2020-15106","CVE-2018-16873"],
  consul:        ["CVE-2020-28053","CVE-2021-37219"],
  grafana:       ["CVE-2021-43798","CVE-2022-26148","CVE-2023-22462"],
  prometheus:    ["CVE-2019-3826","CVE-2022-46146"],
  webmin:        ["CVE-2019-15107","CVE-2022-0824"],
  rabbitmq:      ["CVE-2023-46118","CVE-2021-32718","CVE-2022-25717"],
  kafka:         ["CVE-2023-25194","CVE-2018-17196"],
  zookeeper:     ["CVE-2023-44981","CVE-2019-0201"],
  smtp:          ["CVE-2020-7247","CVE-2019-15605"],
  postfix:       ["CVE-2023-51764","CVE-2011-1720"],
  exim:          ["CVE-2019-10149","CVE-2021-38371"],
  snmp:          ["CVE-2002-0013","CVE-2017-6742","CVE-2023-20198"],
  nfs:           ["CVE-2019-3010","CVE-2021-3197"],
  openvpn:       ["CVE-2017-7479","CVE-2020-15078"],
};

function cveHintsForService(serviceName: string): string[] {
  const norm = (serviceName || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  for (const [svc, cves] of Object.entries(SERVICE_CVE_MAP)) {
    if (norm.includes(svc)) return cves;
  }
  return [];
}

async function tcpProbe(
  host: string, port: number, timeoutMs = 2500,
): Promise<{ open: boolean; banner: string }> {
  let conn: Deno.TcpConn | null = null;
  try {
    conn = await Promise.race([
      Deno.connect({ hostname: host, port, transport: "tcp" }),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), timeoutMs)),
    ]);
    let banner = "";
    try {
      const buf = new Uint8Array(512);
      const n = await Promise.race([
        conn.read(buf),
        new Promise<number>(res => setTimeout(() => res(0), 500)),
      ]);
      if (n) {
        banner = new TextDecoder("utf-8", { fatal: false })
          .decode(buf.subarray(0, Number(n))).trim().slice(0, 300);
      }
    } catch { /* banner opzionale */ }
    return { open: true, banner };
  } catch {
    return { open: false, banner: "" };
  } finally {
    try { conn?.close(); } catch {}
  }
}

function severityForExposedPort(
  port: number,
): "info" | "low" | "medium" | "high" | "critical" {
  if (CRITICAL_EXPOSED_PORTS.has(port)) return "critical";
  if (HIGH_EXPOSED_PORTS.has(port)) return "high";
  if (MEDIUM_EXPOSED_PORTS.has(port)) return "medium";
  if (INFO_EXPOSED_PORTS.has(port)) return "info";
  if (COMMON_PORTS.includes(port)) return "low";
  return "low";
}

function remediationForExposedPort(port: number): string {
  if (port === 23) {
    return "Disabilitare Telnet e sostituire con SSH; consentire accesso solo via VPN/allowlist.";
  }
  if (port === 3389) {
    return "Non esporre RDP su Internet. Usare VPN/ZTNA, MFA e allowlist IP.";
  }
  if (port === 445) {
    return "Non esporre SMB su Internet. Limitare accesso a rete privata.";
  }
  if ([3306, 5432, 1433, 1521, 27017].includes(port)) {
    return "Non esporre database pubblicamente. Applicare firewall, private networking e bastion.";
  }
  if ([9200, 9300, 6379, 11211].includes(port)) {
    return "Limitare esposizione di servizi backend/cache e attivare autenticazione forte.";
  }
  if ([8080, 8443, 9443, 9000, 9090].includes(port)) {
    return "Verificare pannelli admin esposti: proteggere con auth forte, MFA e restrizioni IP.";
  }
  return "Confermare necessità della porta e applicare principio di minima esposizione.";
}

interface SurfaceScoreBreakdown {
  transportScore: number;
  dnsScore: number;
  httpSecurityScore: number;
  exposureScore: number;
  reputationScore: number;
  qualityScore: number;
  domainHygieneScore: number;
  overallScore: number;
  riskLevel: "low" | "medium" | "high" | "critical";
}

function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function riskLevelFromScore(score: number): "low" | "medium" | "high" | "critical" {
  const normalized = clampScore(score);
  if (normalized >= 85) return "low";
  if (normalized >= 70) return "medium";
  if (normalized >= 50) return "high";
  return "critical";
}

type AttributionConfidence = "low" | "medium" | "high";

interface ShodanAttributionFactor {
  score: number;
  confidence: AttributionConfidence;
  allowDomainAttribution: boolean;
  allowIpAttribution: boolean;
  sharedRisk: boolean;
  reasons: string[];
}

function clampAttributionScore(rawScore: number): number {
  return Math.max(0, Math.min(1, Math.round(rawScore * 100) / 100));
}

function confidenceFromScore(score: number): AttributionConfidence {
  if (score >= 0.82) return "high";
  if (score >= 0.62) return "medium";
  return "low";
}

function computeShodanAttributionFactor(params: {
  hostMatch: boolean;
  rootDomain: string | null;
  hostnames: string[];
  unrelatedHostnames: number;
  hostingContext: string;
}): ShodanAttributionFactor {
  const reasons: string[] = [];
  let score = 0.15;

  if (params.hostMatch) {
    score += 0.38;
    reasons.push("hostname_match");
  } else {
    score -= 0.25;
    reasons.push("hostname_mismatch");
  }

  const normalizedRoot = (params.rootDomain || "").toLowerCase();
  if (normalizedRoot) {
    const rootAligned = params.hostnames.some((host) => {
      const normalized = String(host || "").toLowerCase();
      return normalized === normalizedRoot || normalized.endsWith(`.${normalizedRoot}`);
    });
    if (rootAligned) {
      score += 0.16;
      reasons.push("root_domain_alignment");
    } else {
      score -= 0.08;
      reasons.push("root_domain_not_seen");
    }
  }

  if (params.unrelatedHostnames === 0) {
    score += 0.2;
    reasons.push("no_unrelated_hosts");
  } else if (params.unrelatedHostnames <= 2) {
    score += 0.12;
    reasons.push("few_unrelated_hosts");
  } else if (params.unrelatedHostnames <= 5) {
    score += 0.03;
    reasons.push("some_unrelated_hosts");
  } else {
    score -= 0.28;
    reasons.push("many_unrelated_hosts");
  }

  if (params.hostingContext === "dedicated") {
    score += 0.12;
    reasons.push("hosting_dedicated");
  } else if (params.hostingContext === "unknown") {
    score += 0.02;
    reasons.push("hosting_unknown");
  } else if (params.hostingContext === "cdn_proxy") {
    score -= 0.1;
    reasons.push("hosting_cdn_proxy");
  } else if (params.hostingContext === "shared_hosting") {
    score -= 0.45;
    reasons.push("hosting_shared");
  }

  const sharedRisk = params.hostingContext === "shared_hosting" || params.unrelatedHostnames > 6;
  if (sharedRisk) {
    score -= 0.2;
    reasons.push("shared_risk_guard");
  }

  const normalizedScore = clampAttributionScore(score);
  const confidence = confidenceFromScore(normalizedScore);
  const allowDomainAttribution =
    !sharedRisk && params.hostMatch && normalizedScore >= 0.65;
  const allowIpAttribution =
    !sharedRisk &&
    params.hostMatch &&
    normalizedScore >= 0.78 &&
    params.unrelatedHostnames <= 1 &&
    params.hostingContext !== "cdn_proxy";

  return {
    score: normalizedScore,
    confidence,
    allowDomainAttribution,
    allowIpAttribution,
    sharedRisk,
    reasons,
  };
}

function parseDmarcPolicy(record: string): string | null {
  const match = record.match(/(?:^|;)\s*p=([a-zA-Z]+)/i);
  return match?.[1]?.toLowerCase() || null;
}

function parseHostFromMxRecord(mx: string): string {
  const parts = mx.trim().split(/\s+/);
  return (parts.length > 1 ? parts[1] : parts[0]).replace(/\.$/, "");
}

function looksSensitivePath(path: string): boolean {
  const patterns = [
    "/admin",
    "/backup",
    "/old",
    "/private",
    "/wp-admin",
    "/.git",
    "/.env",
    "/test",
    "/staging",
  ];
  const lowered = path.toLowerCase();
  return patterns.some((p) => lowered.includes(p));
}

function isValidHostnameCandidate(value: string): boolean {
  const candidate = value.trim().toLowerCase().replace(/\.$/, "");
  if (!candidate || candidate.length > 253) return false;
  if (!candidate.includes(".")) return false;
  if (!/^[a-z0-9.-]+$/.test(candidate)) return false;
  return candidate.split(".").every((label) => label.length > 0 && label.length <= 63 && !label.startsWith("-") && !label.endsWith("-"));
}

function buildIpv6PtrName(ipv6: string): string | null {
  const normalized = ipv6.trim().toLowerCase();
  if (!normalized) return null;
  const expanded = (() => {
    const parts = normalized.split("::");
    if (parts.length > 2) return null;
    const left = parts[0] ? parts[0].split(":").filter(Boolean) : [];
    const right = parts[1] ? parts[1].split(":").filter(Boolean) : [];
    if (left.length + right.length > 8) return null;
    const missing = 8 - (left.length + right.length);
    const full = [...left, ...Array(missing).fill("0"), ...right].map((chunk) => chunk.padStart(4, "0"));
    if (full.length !== 8) return null;
    return full.join("");
  })();

  if (!expanded || !/^[0-9a-f]{32}$/.test(expanded)) return null;
  return `${expanded.split("").reverse().join(".")}.ip6.arpa`;
}

function enqueueBackgroundTask(task: Promise<void>): boolean {
  const edgeRuntime = (globalThis as any)?.EdgeRuntime;
  if (edgeRuntime && typeof edgeRuntime.waitUntil === "function") {
    edgeRuntime.waitUntil(task);
    return true;
  }
  return false;
}

function isFeatureEnabled(flagName: string | undefined, defaultEnabled = true): boolean {
  if (!flagName) return true;
  const value = String(Deno.env.get(flagName) ?? "").trim().toLowerCase();
  if (!value) return defaultEnabled;
  if (["0", "false", "off", "no", "disabled"].includes(value)) return false;
  if (["1", "true", "on", "yes", "enabled"].includes(value)) return true;
  return defaultEnabled;
}

export async function dispatchSurfaceScanQueue(
  adminClient: SupabaseClient,
  organizationId: string,
  options: DispatchQueueOptions = {},
): Promise<string[]> {
  const { data: orgRuntimeFlags, error: orgRuntimeErr } = await adminClient
    .from("organizations" as any)
    .select(
      "surface_scan360_enabled, services_paused, services_paused_at, services_pause_reason, surface_scan_contract_start, surface_scan_contract_years",
    )
    .eq("id", organizationId)
    .maybeSingle();
  if (orgRuntimeErr) {
    throw new Error(orgRuntimeErr.message || "Unable to validate organization runtime before queue dispatch");
  }
  const serviceGate = evaluateOrganizationServiceGate(orgRuntimeFlags as any, "surface_scan360");
  if (!serviceGate.allowed) {
    await adminClient
      .from("surface_scan_jobs" as any)
      .update({
        status: "failed",
        completed_at: new Date().toISOString(),
        error_message: `service_gate_blocked:${serviceGate.code}`,
      })
      .eq("organization_id", organizationId)
      .in("status", ["queued", "pending", "running"]);

    return [];
  }

  const nowIso = new Date().toISOString();
  const stalePendingCutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const staleRunningCutoff = new Date(Date.now() - 45 * 60 * 1000).toISOString();

  // Max 1 recovery attempt per job (uses recovery_attempt_count column, not fragile string check)
  const MAX_RECOVERY_ATTEMPTS = 1;

  const [stalePendingRes, staleRunningRes] = await Promise.all([
    adminClient
      .from("surface_scan_jobs" as any)
      .select("id, recovery_attempt_count")
      .eq("organization_id", organizationId)
      .eq("status", "pending")
      .lt("created_at", stalePendingCutoff)
      .limit(50),
    adminClient
      .from("surface_scan_jobs" as any)
      .select("id, recovery_attempt_count")
      .eq("organization_id", organizationId)
      .eq("status", "running")
      .lt("started_at", staleRunningCutoff)
      .limit(50),
  ]);

  const stalePendingRows = (stalePendingRes.data || []) as Array<{ id?: string; recovery_attempt_count?: number }>;
  const staleRunningRows = (staleRunningRes.data || []) as Array<{ id?: string; recovery_attempt_count?: number }>;

  // Pending: recover once, then fail
  const recoverablePending = stalePendingRows
    .filter((row) => (row?.recovery_attempt_count ?? 0) < MAX_RECOVERY_ATTEMPTS)
    .map((row) => String(row?.id || "").trim()).filter(Boolean);
  const terminalPending = stalePendingRows
    .filter((row) => (row?.recovery_attempt_count ?? 0) >= MAX_RECOVERY_ATTEMPTS)
    .map((row) => String(row?.id || "").trim()).filter(Boolean);

  if (recoverablePending.length > 0) {
    await adminClient
      .from("surface_scan_jobs" as any)
      .update({
        status: "queued",
        started_at: null,
        completed_at: null,
        error_message: null,
        recovery_attempt_count: MAX_RECOVERY_ATTEMPTS,
      })
      .in("id", recoverablePending);

    await adminClient.from("surface_scan_audit_log" as any).insert(
      recoverablePending.map((id: string) => ({
        scan_job_id: id,
        user_id: options.initiatedByUserId || null,
        action: "scan_auto_requeued_pending_timeout",
        details: { reason: "pending_timeout_10m", recovery: "queued_again" },
      })),
    );
  }

  if (terminalPending.length > 0) {
    await adminClient
      .from("surface_scan_jobs" as any)
      .update({
        status: "failed",
        completed_at: nowIso,
        error_message: "pending_timeout_no_recovery_left",
      })
      .in("id", terminalPending);
    await adminClient.from("surface_scan_audit_log" as any).insert(
      terminalPending.map((id: string) => ({
        scan_job_id: id,
        user_id: options.initiatedByUserId || null,
        action: "scan_auto_failed_pending_timeout",
        details: { reason: "pending_timeout_max_recovery" },
      })),
    );
  }

  if (staleRunningRows.length > 0) {
    const recoverableRunning = staleRunningRows
      .filter((row) => (row?.recovery_attempt_count ?? 0) < MAX_RECOVERY_ATTEMPTS)
      .map((row) => String(row?.id || "").trim())
      .filter(Boolean);
    const terminalRunning = staleRunningRows
      .filter((row) => (row?.recovery_attempt_count ?? 0) >= MAX_RECOVERY_ATTEMPTS)
      .map((row) => String(row?.id || "").trim())
      .filter(Boolean);

    if (recoverableRunning.length > 0) {
      await adminClient
        .from("surface_scan_jobs" as any)
        .update({
          status: "queued",
          started_at: null,
          completed_at: null,
          error_message: null,
          recovery_attempt_count: MAX_RECOVERY_ATTEMPTS,
        })
        .in("id", recoverableRunning);

      await adminClient.from("surface_scan_audit_log" as any).insert(
        recoverableRunning.map((id: string) => ({
          scan_job_id: id,
          user_id: options.initiatedByUserId || null,
          action: "scan_auto_requeued_running_timeout",
          details: { reason: "running_timeout_45m", recovery: "queued_again" },
        })),
      );
    }

    if (terminalRunning.length > 0) {
      await adminClient
        .from("surface_scan_jobs" as any)
        .update({
          status: "failed",
          completed_at: nowIso,
          error_message: "running_timeout_max_recovery",
        })
        .in("id", terminalRunning);

      await adminClient.from("surface_scan_audit_log" as any).insert(
        terminalRunning.map((id: string) => ({
          scan_job_id: id,
          user_id: options.initiatedByUserId || null,
          action: "scan_auto_failed_timeout",
          details: { reason: "running_timeout_45m", recovery: "failed_after_retry" },
        })),
      );
    }
  }

  const maxConcurrent = 3;
  const maxToStart = options.maxToStart ?? maxConcurrent;

  const runningRes = await adminClient
    .from("surface_scan_jobs" as any)
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .in("status", ["pending", "running"]);

  const runningCount = runningRes.count || 0;
  let freeSlots = Math.max(0, maxConcurrent - runningCount);
  freeSlots = Math.min(freeSlots, Math.max(0, maxToStart));

  if (freeSlots <= 0) {
    return [];
  }

  const { data: queuedJobs } = await adminClient
    .from("surface_scan_jobs" as any)
    .select("*")
    .eq("organization_id", organizationId)
    .eq("status", "queued")
    .order("created_at", { ascending: true })
    .limit(freeSlots);

  const startedJobIds: string[] = [];
  for (const jobRow of (queuedJobs || []) as SurfaceScanJob[]) {
    const { data: claimedJob, error: claimError } = await adminClient
      .from("surface_scan_jobs" as any)
      .update({
        status: "pending",
        error_message: null,
      })
      .eq("id", jobRow.id)
      .eq("status", "queued")
      .select("*")
      .maybeSingle();

    if (claimError || !claimedJob) {
      continue;
    }

    startedJobIds.push(claimedJob.id);

    const runTask = runSurfaceScanEnrichment(adminClient, claimedJob as SurfaceScanJob, {
      initiatedByUserId: options.initiatedByUserId || claimedJob.requested_by || null,
      force: false,
    }).catch(async (error) => {
      const message = error instanceof Error ? error.message : String(error ?? "unknown");
      console.error("[surface-scan-queue] run task failed for job", claimedJob.id, ":", message);
      // Mark job as failed — prevents it from being stuck in pending indefinitely
      try {
        await adminClient
          .from("surface_scan_jobs" as any)
          .update({
            status: "failed",
            completed_at: new Date().toISOString(),
            error_message: `queue_dispatch_error:${message.slice(0, 400)}`,
          })
          .eq("id", claimedJob.id)
          .in("status", ["pending", "running"]);
        await adminClient.from("surface_scan_audit_log" as any).insert({
          scan_job_id: claimedJob.id,
          user_id: options.initiatedByUserId || null,
          action: "scan_failed_queue_dispatch_error",
          details: { error: message.slice(0, 400) },
        });
      } catch (dbErr) {
        console.error("[surface-scan-queue] failed to mark job as failed:", dbErr);
      }
    });

    if (!enqueueBackgroundTask(runTask)) {
      await runTask;
    }
  }

  return startedJobIds;
}

export async function runSurfaceScanEnrichment(
  adminClient: SupabaseClient,
  job: SurfaceScanJob,
  options: RunOptions = {},
): Promise<void> {
  const organizationId = job.customer_id || job.organization_id || null;
  const customerId = organizationId;
  const tenantId = job.tenant_id || organizationId;

  if (!organizationId) {
    throw new Error("Job organization/customer missing");
  }

  if (!options.force && ["running", "completed"].includes(job.status)) {
    return;
  }

  const parsedTarget = normalizeTargetInput(job.normalized_target);
  const hostname = parsedTarget.hostname || job.hostname || null;
  const rootDomain = parsedTarget.root_domain || job.root_domain || null;
  const targetUrl = parsedTarget.normalized_target;
  const seenAssetKeys = new Set<string>();
  const seenFindingKeys = new Set<string>();
  const seenPortKeys = new Set<string>();
  const scanWarnings: string[] = [];
  const jobConfig = (job.config && typeof job.config === "object") ? job.config : {};
  const [{ data: monitoredScopeRows }, { data: organizationRuntime }] = await Promise.all([
    adminClient
      .from("surface_scan_monitored_ips" as any)
      .select("entry_type, input_value, ip_start, ip_end")
      .eq("organization_id", organizationId),
    adminClient
      .from("organizations" as any)
      .select("surface_scan_extended")
      .eq("id", organizationId)
      .maybeSingle(),
  ]);
  const { scopeDomains, ipScopeRules } = splitMonitoredScopeRules((monitoredScopeRows || []) as any[]);
  const surfaceScanExtended = Boolean((organizationRuntime as any)?.surface_scan_extended);

  const scopeCounters = {
    in_scope: 0,
    excluded_by_scope: 0,
    excluded_shared_noise: 0,
  };

  const scopeReasonFromHost = (candidateHost: string): "scope_excluded_domain" | "scope_excluded_shared_noise" | null => {
    const classified = classifyHostForScope(candidateHost, scopeDomains);
    if (classified.blocked) return "scope_excluded_shared_noise";
    if (!classified.inScope) return "scope_excluded_domain";
    return null;
  };

  const scopeReasonFromIp = (candidateIp: string): "scope_excluded_ip" | null => {
    if (!candidateIp) return null;
    // If no IP scope rules are configured, IP-based restriction is not active:
    // IPs resolved from in-scope domains are implicitly allowed.
    if (ipScopeRules.length === 0) return null;
    return isIpWithinMonitoredScope(candidateIp, ipScopeRules) ? null : "scope_excluded_ip";
  };

  const isIpAllowedInScope = (candidateIp: string): boolean => scopeReasonFromIp(candidateIp) === null;
  const classifyHostAgainstScope = (candidateHost: string) => {
    const base = classifyHostForScope(candidateHost, scopeDomains);
    const reason = scopeReasonFromHost(candidateHost);
    return {
      ...base,
      blocked: reason !== null,
      reason,
    };
  };
  const shouldAcceptScannableHost = (candidateHost: string): boolean => scopeReasonFromHost(candidateHost) === null;

  const addScopeCounter = (reason: string | null) => {
    if (!reason) {
      scopeCounters.in_scope += 1;
      return;
    }
    if (reason === "scope_excluded_shared_noise") {
      scopeCounters.excluded_shared_noise += 1;
      return;
    }
    scopeCounters.excluded_by_scope += 1;
  };

  const addScopeRaw = (
    raw: Record<string, unknown> | undefined,
    reason: string | null,
  ): Record<string, unknown> => {
    const nextRaw: Record<string, unknown> = { ...(raw || {}) };
    if (reason) {
      nextRaw._scope_excluded = true;
      nextRaw._scope_exclusion_reason = reason;
      nextRaw._scope_excluded_at = new Date().toISOString();
    } else if (nextRaw._scope_excluded === undefined) {
      nextRaw._scope_excluded = false;
      nextRaw._scope_exclusion_reason = null;
    }
    return nextRaw;
  };

  if (options.force) {
    await Promise.all([
      adminClient.from("surface_assets" as any).delete().eq("scan_job_id", job.id),
      adminClient.from("surface_observations" as any).delete().eq("scan_job_id", job.id),
      adminClient.from("surface_findings" as any).delete().eq("scan_job_id", job.id),
      adminClient.from("surface_external_intel" as any).delete().eq("scan_job_id", job.id),
      adminClient.from("surface_scan_module_results" as any).delete().eq("scan_job_id", job.id),
    ]);
  }

  const insertObservation = async (input: ObservationInput) => {
    await adminClient.from("surface_observations" as any).insert({
      organization_id: organizationId,
      tenant_id: tenantId,
      customer_id: customerId,
      scan_job_id: job.id,
      asset_id: input.asset_id || null,
      module: input.module,
      observation_type: input.observation_type,
      title: input.title,
      value: input.value,
      severity: toSeverity(input.severity || "info"),
      confidence: input.confidence || "medium",
    });
  };

  const insertFinding = async (input: FindingInput) => {
    const findingKey = [
      input.provider || "surface_scan_engine",
      input.module || "generic",
      input.finding_type,
      input.affected_asset || "",
      input.affected_url || "",
      input.ip || "",
      String(input.port || ""),
    ]
      .join("|")
      .toLowerCase();

    if (seenFindingKeys.has(findingKey)) return;
    seenFindingKeys.add(findingKey);

    let findingScopeReason: "scope_excluded_domain" | "scope_excluded_ip" | "scope_excluded_shared_noise" | null =
      null;

    const findingIp = String(
      input.ip ||
        (typeof input.evidence?.ip === "string" ? input.evidence.ip : ""),
    )
      .trim()
      .toLowerCase();
    if (findingIp) {
      findingScopeReason = scopeReasonFromIp(findingIp);
    }

    if (!findingScopeReason) {
      let findingHost = "";
      const affectedUrl = String(input.affected_url || "").trim();
      if (affectedUrl) {
        try {
          findingHost = new URL(affectedUrl).hostname.toLowerCase();
        } catch {
          findingHost = affectedUrl.toLowerCase();
        }
      } else {
        findingHost = String(input.affected_asset || "").trim().toLowerCase();
      }
      if (findingHost && !findingHost.includes(":") && !/^\d{1,3}(\.\d{1,3}){3}$/.test(findingHost)) {
        findingScopeReason = scopeReasonFromHost(findingHost);
      }
    }

    const evidenceWithScope = addScopeRaw(input.evidence || {}, findingScopeReason);

    await adminClient.from("surface_findings" as any).upsert({
      organization_id: organizationId,
      tenant_id: tenantId,
      customer_id: customerId,
      scan_job_id: job.id,
      provider: input.provider || "surface_scan_engine",
      module: input.module || "generic",
      finding_type: input.finding_type,
      title: input.title,
      description: input.description || null,
      severity: toSeverity(input.severity || "info"),
      affected_asset: input.affected_asset || null,
      affected_url: input.affected_url || null,
      ip: input.ip || null,
      port: input.port || null,
      protocol: input.protocol || null,
      cve: input.cve || [],
      cwe: input.cwe || [],
      cvss: input.cvss || null,
      epss: input.epss || null,
      cisa_kev: input.cisa_kev || false,
      remediation: input.remediation || null,
      evidence: evidenceWithScope,
      attribution_confidence: input.attribution_confidence || "medium",
      status: input.status || "open",
      first_seen_at: new Date().toISOString(),
      last_seen_at:  new Date().toISOString(),
      occurrence_count: 1,
    }, { onConflict: "dedup_fingerprint" });
  };

  const insertOpenPort = async (
    portNum: number,
    host: string,
    ip: string,
    protocol = "tcp",
    source = "shodan",
    serviceName?: string,
    serviceVersion?: string,
    banner?: string,
  ) => {
    const key = [(host || ip).toLowerCase(), (ip || "").toLowerCase(), portNum, protocol].join("|");
    if (seenPortKeys.has(key)) return;
    seenPortKeys.add(key);
    const isWeb = [80,443,8080,8443,8888,9000,3000,4000,5000,7080,7443,9090,10000].includes(portNum);
    const isTls = [443,8443,993,995,465,636,2376,5986].includes(portNum);
    await adminClient.from("surface_open_ports" as any).upsert({
      scan_job_id: job.id,
      organization_id: organizationId,
      tenant_id: tenantId,
      customer_id: customerId,
      host: host || ip,
      ip: ip || null,
      port: portNum,
      protocol,
      state: "open",
      service_name: serviceName || null,
      service_version: serviceVersion || null,
      banner: banner?.slice(0, 500) || null,
      is_web: isWeb,
      is_tls: isTls,
      exposure_level: severityForExposedPort(portNum),
      first_seen_at: new Date().toISOString(),
      last_seen_at:  new Date().toISOString(),
      raw: { source, service: serviceName, version: serviceVersion },
    }, { onConflict: "scan_job_id,host,port,protocol" });
  };

  const insertAsset = async (input: AssetInput): Promise<string | null> => {
    const assetValue = String(input.asset_value || "").trim().toLowerCase();
    const assetKey = [input.asset_type, assetValue, input.source].join("|");
    if (!assetValue || seenAssetKeys.has(assetKey)) return null;
    seenAssetKeys.add(assetKey);

    let scopeReason: "scope_excluded_domain" | "scope_excluded_ip" | "scope_excluded_shared_noise" | null =
      null;

    const ipCandidate = String(
      input.ip ||
        (input.asset_type === "ip" ? input.asset_value : "") ||
        (input.asset_type === "open_port" ? String(input.asset_value || "").split(":")[0] : ""),
    )
      .trim()
      .toLowerCase();
    if (ipCandidate) {
      scopeReason = scopeReasonFromIp(ipCandidate);
    }

    if (!scopeReason) {
      const hostCandidate = String(input.hostname || "").trim().toLowerCase();
      const hostScopedTypes = new Set(["domain", "subdomain", "reverse_dns_hostname", "url", "mx_host", "ns_host"]);
      if (hostCandidate && hostScopedTypes.has(String(input.asset_type || "").toLowerCase())) {
        scopeReason = scopeReasonFromHost(hostCandidate);
      }
    }

    const rawWithScope = addScopeRaw(input.raw, scopeReason);
    addScopeCounter(scopeReason);

    const { data, error } = await adminClient
      .from("surface_assets" as any)
      .insert({
        organization_id: organizationId,
        tenant_id: tenantId,
        customer_id: customerId,
        scan_job_id: job.id,
        asset_type: input.asset_type,
        asset_value: input.asset_value,
        hostname: input.hostname || null,
        root_domain: input.root_domain || null,
        ip: input.ip || null,
        source: input.source,
        confidence: scopeReason ? "low" : input.confidence || "medium",
        raw: rawWithScope,
      })
      .select("id")
      .single();

    if (error) return null;
    return data?.id || null;
  };

  const insertExternalIntel = async (
    provider: string,
    target: string,
    found: boolean,
    summary: Record<string, unknown>,
    rawResponse: Record<string, unknown>,
    confidence = "medium",
  ) => {
    await adminClient.from("surface_external_intel" as any).insert({
      organization_id: organizationId,
      tenant_id: tenantId,
      customer_id: customerId,
      scan_job_id: job.id,
      provider,
      target,
      found,
      summary,
      raw_response: rawResponse,
      confidence,
    });
  };

  const logAudit = async (action: string, details: Record<string, unknown>) => {
    await adminClient.from("surface_scan_audit_log" as any).insert({
      scan_job_id: job.id,
      user_id: options.initiatedByUserId || job.requested_by,
      action,
      details,
    });
  };

  const enqueueDiscoveredSubdomainJobs = async (): Promise<{
    discovered: number;
    eligible: number;
    inserted: number;
    skippedExisting: number;
    skippedCurrent: number;
    skippedLimit: number;
  }> => {
    if (jobConfig.auto_expand_subdomains === false) {
      return { discovered: 0, eligible: 0, inserted: 0, skippedExisting: 0, skippedCurrent: 0, skippedLimit: 0 };
    }
    if (!["domain", "subdomain"].includes(parsedTarget.target_type) || !rootDomain) {
      return { discovered: 0, eligible: 0, inserted: 0, skippedExisting: 0, skippedCurrent: 0, skippedLimit: 0 };
    }

    const maxDepth = Math.min(toPositiveInt((jobConfig as any).subdomain_max_depth, 10), 10);
    const currentDepth = toPositiveInt((jobConfig as any).subdomain_depth, parsedTarget.target_type === "subdomain" ? 1 : 0);
    if (currentDepth >= maxDepth) {
      return { discovered: discoveredHostnames.size, eligible: 0, inserted: 0, skippedExisting: 0, skippedCurrent: 0, skippedLimit: 0 };
    }

    const configuredLimit = toPositiveInt(
      (jobConfig as any).subdomain_child_job_limit ?? Deno.env.get("SURFACESCAN_SUBDOMAIN_CHILD_JOB_LIMIT"),
      surfaceScanExtended ? 75 : 10,
    );
    const limit = surfaceScanExtended ? configuredLimit : Math.min(configuredLimit, 10);
    const cooldownHours = toPositiveInt(Deno.env.get("SURFACESCAN_SUBDOMAIN_CHILD_COOLDOWN_HOURS"), 24);
    const cooldownIso = new Date(Date.now() - cooldownHours * 60 * 60 * 1000).toISOString();
    const currentHost = String(hostname || "").trim().toLowerCase();
    const candidates = [...new Set(
      [...discoveredHostnames]
        .map((entry) => String(entry || "").trim().toLowerCase().replace(/\.$/, ""))
        .filter(Boolean)
        .filter((entry) => entry !== rootDomain)
        .filter((entry) => entry !== currentHost)
        .filter((entry) => entry.endsWith(`.${rootDomain}`))
        .filter((entry) => isValidHostnameCandidate(entry))
        .filter((entry) => shouldAcceptScannableHost(entry)),
    )].sort();

    const selected = candidates.slice(0, limit);
    let inserted = 0;
    let skippedExisting = 0;
    let skippedCurrent = candidates.length - selected.length;

    for (const subdomain of selected) {
      const normalizedChild = normalizeTargetInput(subdomain);
      const { count: existingCount } = await adminClient
        .from("surface_scan_jobs" as any)
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .eq("normalized_target", normalizedChild.normalized_target)
        .in("status", ["queued", "pending", "running", "completed"])
        .gte("created_at", cooldownIso);

      if ((existingCount || 0) > 0) {
        skippedExisting += 1;
        continue;
      }

      const [aRecords, aaaaRecords] = await Promise.all([
        resolveWithDnsOverHttps(subdomain, "A").catch(() => [] as string[]),
        resolveWithDnsOverHttps(subdomain, "AAAA").catch(() => [] as string[]),
      ]);

      const { error } = await adminClient
        .from("surface_scan_jobs" as any)
        .insert({
          organization_id: organizationId,
          tenant_id: tenantId,
          customer_id: customerId,
          requested_by: options.initiatedByUserId || job.requested_by || null,
          raw_target: subdomain,
          normalized_target: normalizedChild.normalized_target,
          target_type: normalizedChild.target_type,
          hostname: normalizedChild.hostname,
          root_domain: normalizedChild.root_domain || rootDomain,
          resolved_ips: [...new Set([...aRecords, ...aaaaRecords])],
          scan_profile: job.scan_profile || "domain_exposure",
          scan_type: "subdomain_enrichment",
          scan_name: `Subdomain enrichment · ${subdomain}`,
          status: "queued",
          authorization_confirmed: true,
          config: {
            parent_scan_job_id: job.id,
            parent_target: parsedTarget.normalized_target,
            parent_depth: currentDepth,
            subdomain_depth: currentDepth + 1,
            subdomain_max_depth: maxDepth,
            discovered_from: String((jobConfig as any).subdomain_source || "surface_scan_engine"),
            discovered_parent: currentHost || parsedTarget.normalized_target,
            auto_expand_subdomains: true,
            no_connectsecure: true,
          },
          summary: {
            parent_scan_job_id: job.id,
            root_domain: rootDomain,
            parent_depth: currentDepth,
            subdomain_depth: currentDepth + 1,
            subdomain_max_depth: maxDepth,
            discovered_from: String((jobConfig as any).subdomain_source || "surface_scan_engine"),
          },
        });

      if (error) {
        skippedCurrent += 1;
        continue;
      }
      inserted += 1;
    }

    const stats = {
      discovered: discoveredHostnames.size,
      eligible: candidates.length,
      inserted,
      skippedExisting,
      skippedCurrent: Math.max(0, skippedCurrent),
      skippedLimit: Math.max(0, candidates.length - selected.length),
    };

    if (candidates.length > 0 || inserted > 0) {
      await insertObservation({
        module: "subdomain_queue",
        observation_type: "subdomain_child_jobs",
        title: "Discovered subdomains queued for SurfaceScan360 enrichment",
        value: {
          ...stats,
          root_domain: rootDomain,
          limit,
          cooldown_hours: cooldownHours,
          surface_scan_extended: surfaceScanExtended,
          depth: currentDepth,
          next_depth: currentDepth + 1,
          max_depth: maxDepth,
          sample: selected.slice(0, 30),
        },
        severity: "info",
      });
      await logAudit("subdomain_child_jobs_queued", {
        ...stats,
        root_domain: rootDomain,
        limit,
        cooldown_hours: cooldownHours,
        surface_scan_extended: surfaceScanExtended,
        depth: currentDepth,
        next_depth: currentDepth + 1,
        max_depth: maxDepth,
      });
    }

    return stats;
  };

  const emitEngineEnvelope = async (envelope: SurfaceEngineEnvelope) => {
    await insertObservation({
      module: "engine_orchestrator",
      observation_type: "engine_run",
      title: `${envelope.engine} • ${envelope.status}`,
      value: {
        engine: envelope.engine,
        target: envelope.target,
        status: envelope.status,
        duration_ms: envelope.durationMs,
        error: envelope.error || null,
        summary: envelope.summary || {},
      },
      severity: envelope.status === "failed" ? "medium" : envelope.status === "partial" ? "low" : "info",
      confidence: envelope.status === "failed" ? "low" : "high",
    });
  };

  const moduleExecution = new Map<string, ModuleExecutionRecord>();

  const upsertModuleResult = async (
    config: ModuleExecutionConfig,
    status: ModuleStatus,
    payload: {
      severity?: "info" | "low" | "medium" | "high" | "critical";
      startedAt?: string;
      completedAt?: string;
      durationMs?: number;
      errorMessage?: string | null;
      source?: string | null;
      normalized?: Record<string, unknown>;
      raw?: Record<string, unknown>;
    } = {},
  ) => {
    const record: ModuleExecutionRecord = {
      key: config.key,
      label: config.label,
      status,
      severity: payload.severity,
      started_at: payload.startedAt,
      completed_at: payload.completedAt,
      duration_ms: payload.durationMs,
      error_message: payload.errorMessage ?? null,
      source: payload.source ?? null,
    };
    moduleExecution.set(config.key, record);

    await adminClient.from("surface_scan_module_results" as any).upsert({
      organization_id: organizationId,
      tenant_id: tenantId,
      customer_id: customerId,
      scan_job_id: job.id,
      module_key: config.key,
      module_label: config.label,
      status,
      severity: payload.severity || "info",
      source: payload.source || null,
      normalized: payload.normalized || {},
      raw: payload.raw || {},
      started_at: payload.startedAt || null,
      completed_at: payload.completedAt || null,
      duration_ms: payload.durationMs || null,
      error_message: payload.errorMessage || null,
    }, { onConflict: "scan_job_id,module_key" });
  };

  const triggerAutoReportRepository = async () => {
    const autoReportEnabled =
      String(Deno.env.get("SURFACESCAN_AUTO_REPORT_ENABLED") || "true").toLowerCase() !== "false";
    if (!autoReportEnabled) {
      await logAudit("scan_report_auto_skipped", { reason: "auto_report_disabled" });
      return;
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!supabaseUrl || !serviceRole) {
      await logAudit("scan_report_auto_failed", { reason: "missing_supabase_env" });
      return;
    }

    const internalSecret =
      Deno.env.get("SURFACESCAN_REPORT_INTERNAL_SECRET") ||
      Deno.env.get("SURFACESCAN_INTERNAL_REPORT_SECRET") ||
      "";

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceRole}`,
      };
      if (internalSecret) {
        headers["x-surface-internal-secret"] = internalSecret;
      }

      const reportRes = await fetch(`${supabaseUrl}/functions/v1/surfacescan360-ai-report`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          organization_id: organizationId,
          job_id: job.id,
          trigger_source: "auto_on_complete",
          force_regenerate: false,
          created_by: options.initiatedByUserId || job.requested_by || null,
        }),
      });

      const reportBody = await reportRes.json().catch(() => ({}));
      const reportCode = String(reportBody?.code || '').trim().toLowerCase();
      const isScopePending = reportRes.status === 409 && reportCode === 'scope_incomplete_pending_targets';
      if (isScopePending) {
        await logAudit("scan_report_auto_skipped", {
          reason: "scope_incomplete_pending_targets",
          pending_targets: Array.isArray(reportBody?.pending_targets) ? reportBody.pending_targets.slice(0, 50) : [],
          required_targets_total: Number(reportBody?.required_targets_total || 0),
          completed_targets_total: Number(reportBody?.completed_targets_total || 0),
        });
        return;
      }
      if (!reportRes.ok || reportBody?.error) {
        await logAudit("scan_report_auto_failed", {
          status: reportRes.status,
          error: reportBody?.error || "unknown_error",
        });
        return;
      }

      await logAudit("scan_report_auto_generated", {
        repository_id: reportBody?.repository_id || null,
        reused_existing: Boolean(reportBody?.existing),
      });
    } catch (error: any) {
      await logAudit("scan_report_auto_failed", {
        error: error?.message || String(error),
      });
    }
  };

  const triggerCveEnrichmentQueue = async () => {
    const autoCveEnrichmentEnabled =
      String(Deno.env.get("SURFACESCAN_AUTO_CVE_ENRICHMENT_ENABLED") || "true").toLowerCase() !== "false";
    if (!autoCveEnrichmentEnabled) return;

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!supabaseUrl || !serviceRole) {
      await logAudit("scan_cve_enrichment_trigger_failed", { reason: "missing_supabase_env" });
      scanWarnings.push("cve_enrichment_trigger_failed:missing_supabase_env");
      return;
    }

    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/cve-enrichment`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceRole}`,
        },
        body: JSON.stringify({
          trigger: "surface_scan_complete",
          max_per_run: 1,
          drain_all: false,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body?.error) {
        await logAudit("scan_cve_enrichment_trigger_failed", {
          status: res.status,
          error: body?.error || "unknown_error",
        });
        scanWarnings.push(`cve_enrichment_trigger_failed:http_${res.status}`);
        return;
      }
      await logAudit("scan_cve_enrichment_triggered", {
        processed_count: body?.processed_count ?? null,
        mode: body?.mode ?? null,
      });
    } catch (error: any) {
      await logAudit("scan_cve_enrichment_trigger_failed", {
        error: error?.message || String(error),
      });
      scanWarnings.push("cve_enrichment_trigger_failed:fetch_error");
    }
  };

  await adminClient
    .from("surface_scan_jobs" as any)
    .update({
      status: "running",
      started_at: new Date().toISOString(),
      error_message: null,
    })
    .eq("id", job.id);

  await logAudit("scan_started", {
    scan_profile: job.scan_profile,
    target: job.normalized_target,
  });

  const targetScopeDecision = classifyTargetScope(parsedTarget, scopeDomains, ipScopeRules);
  if (!targetScopeDecision.allowed) {
    const scopeGuardModule: ModuleExecutionConfig = {
      key: "scope_guard",
      label: "Scope Guard",
      timeoutMs: 1000,
    };
    const nowIso = new Date().toISOString();
    await upsertModuleResult(scopeGuardModule, "skipped", {
      severity: "info",
      startedAt: nowIso,
      completedAt: nowIso,
      durationMs: 0,
      normalized: {
        code: targetScopeDecision.code,
        reason: targetScopeDecision.reason,
      },
    });
    await insertObservation({
      module: "scope_guard",
      observation_type: "scope_guard_blocked_target",
      title: "Target blocked by scope guard",
      value: {
        code: targetScopeDecision.code,
        reason: targetScopeDecision.reason,
        normalized_target: parsedTarget.normalized_target,
        target_type: parsedTarget.target_type,
        hostname: parsedTarget.hostname,
      },
      severity: "info",
    });
    await adminClient
      .from("surface_scan_jobs" as any)
      .update({
        status: "completed",
        completed_at: nowIso,
        hosting_context:
          targetScopeDecision.code === "target_out_of_scope_shared_noise" ? "excluded_noise" : "excluded_scope",
        shodan_status: "scope_blocked",
        resolved_ips: job.resolved_ips || [],
        summary: {
          overall_score: 0,
          risk_level: "high",
          scope_guard: {
            blocked: true,
            code: targetScopeDecision.code,
            reason: targetScopeDecision.reason,
          },
        },
      })
      .eq("id", job.id);
    await logAudit("scan_scope_guard_blocked", {
      code: targetScopeDecision.code,
      reason: targetScopeDecision.reason,
      target: parsedTarget.normalized_target,
    });
    return;
  }

  const discoveredIps = new Set<string>((job.resolved_ips || []).filter(Boolean));
  const discoveredHostnames = new Set<string>(hostname ? [hostname] : []);
  const shodanHostPayloads: Array<{ ip: string; payload: Record<string, unknown> }> = [];
  let hostingContext = "unknown";
  let shodanStatus = "unknown";
  type HttpScheme = "http" | "https";
  interface HttpSnapshot {
    attemptedUrls: string[];
    requestUrl: string;
    finalUrl: string;
    statusCode: number;
    headers: Record<string, string>;
    setCookies: string[];
    protocol: HttpScheme;
    responseTimeMs: number;
    bodyExcerpt: string;
    fetchedAt: string;
  }
  interface TechFingerprintEntry {
    name: string;
    categories: string[];
    version?: string;
    confidence?: number;
    source: string;
  }

  let latestHttpSnapshot: HttpSnapshot | null = null;
  const techFingerprintMap = new Map<string, TechFingerprintEntry>();

  const addTechFingerprint = (
    nameRaw: string,
    options: {
      categories?: string[];
      version?: string;
      confidence?: number;
      source: string;
    },
  ) => {
    const normalizedName = String(nameRaw || "").trim();
    if (!normalizedName) return;
    const key = normalizedName.toLowerCase();
    const existing = techFingerprintMap.get(key);
    const mergedCategories = [
      ...(existing?.categories || []),
      ...(options.categories || []),
    ]
      .map((entry) => String(entry || "").trim())
      .filter(Boolean);
    const uniqueCategories = [...new Set(mergedCategories)];
    const nextConfidence = Math.max(existing?.confidence || 0, options.confidence || 0);
    techFingerprintMap.set(key, {
      name: existing?.name || normalizedName,
      categories: uniqueCategories,
      version: existing?.version || options.version,
      confidence: nextConfidence > 0 ? nextConfidence : undefined,
      source: existing?.source ? `${existing.source},${options.source}` : options.source,
    });
  };

  const collectSetCookieHeaders = (headers: Headers): string[] => {
    const candidate = headers as Headers & { getSetCookie?: () => string[] };
    if (typeof candidate.getSetCookie === "function") {
      try {
        return (candidate.getSetCookie() || []).map((entry) => String(entry || "").trim()).filter(Boolean);
      } catch {
        // fallback below
      }
    }
    const merged = headers.get("set-cookie");
    if (!merged) return [];
    return merged
      .split(/,(?=\s*[^;,=\s]+=[^;,]+)/g)
      .map((entry) => entry.trim())
      .filter(Boolean);
  };

  const collectHeadersObject = (headers: Headers): Record<string, string> =>
    {
      const out: Record<string, string> = {};
      for (const [key, value] of headers.entries()) {
        out[String(key || "").toLowerCase()] = String(value || "");
      }
      return out;
    };

  const buildHttpCandidateUrls = (): string[] => {
    const candidates: string[] = [];
    const targetType = parsedTarget.target_type;
    const targetHost = String(parsedTarget.hostname || hostname || "").trim();
    const hostForUrl = targetType === "ipv6" && targetHost ? `[${targetHost}]` : targetHost;

    const pushCandidate = (url: string) => {
      const normalized = String(url || "").trim();
      if (!normalized) return;
      if (!candidates.includes(normalized)) candidates.push(normalized);
    };

    if (["domain", "subdomain", "ipv4", "ipv6"].includes(targetType) && hostForUrl) {
      const pathSuffix = parsedTarget.port ? `:${parsedTarget.port}` : "";
      pushCandidate(`https://${hostForUrl}${pathSuffix}/`);
      pushCandidate(`http://${hostForUrl}${pathSuffix}/`);
      return candidates;
    }

    pushCandidate(targetUrl);
    if (targetUrl.startsWith("https://")) {
      pushCandidate(`http://${targetUrl.replace(/^https:\/\//i, "")}`);
    } else if (targetUrl.startsWith("http://")) {
      pushCandidate(`https://${targetUrl.replace(/^http:\/\//i, "")}`);
    }
    return candidates;
  };

  const fetchPrimaryHttpSnapshot = async (): Promise<HttpSnapshot> => {
    if (latestHttpSnapshot) return latestHttpSnapshot;
    const attemptedUrls: string[] = [];
    const candidates = buildHttpCandidateUrls();
    let lastError: unknown = null;
    const httpAttemptTimeoutMs = Math.max(
      5000,
      Math.min(30000, Number(Deno.env.get("SURFACESCAN_HTTP_ATTEMPT_TIMEOUT_MS") || "15000")),
    );
    const httpMaxRedirects = Math.max(
      3,
      Math.min(15, Number(Deno.env.get("SURFACESCAN_HTTP_MAX_REDIRECTS") || "10")),
    );
    const httpMaxResponseBytes = Math.max(
      100000,
      Math.min(2000000, Number(Deno.env.get("SURFACESCAN_HTTP_MAX_RESPONSE_BYTES") || "350000")),
    );

    for (const candidate of candidates) {
      attemptedUrls.push(candidate);
      try {
        const start = Date.now();
        const safeFetch = await fetchWithSsrfGuard(candidate, {}, {
          timeoutMs: httpAttemptTimeoutMs,
          maxRedirects: httpMaxRedirects,
          maxResponseBytes: httpMaxResponseBytes,
        });
        const response = safeFetch.response;
        const responseTimeMs = Date.now() - start;
        const headersObj = collectHeadersObject(response.headers);
        const setCookies = collectSetCookieHeaders(response.headers);
        const bodyText = await response.text().catch(() => "");
        const bodyExcerpt = bodyText.slice(0, 200000);
        const finalUrl = safeFetch.finalUrl || response.url || candidate;
        const finalProtocol = finalUrl.startsWith("https://") ? "https" : "http";
        latestHttpSnapshot = {
          attemptedUrls,
          requestUrl: candidate,
          finalUrl,
          statusCode: response.status,
          headers: headersObj,
          setCookies,
          protocol: finalProtocol,
          responseTimeMs,
          bodyExcerpt,
          fetchedAt: new Date().toISOString(),
        };
        return latestHttpSnapshot;
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError || new Error("HTTP fetch failed for all candidate URLs");
  };

  const isRetryableModuleError = (error: unknown): boolean => {
    const message = String((error as any)?.message || error || "").toLowerCase();
    if (!message) return false;
    if (message.includes("timeout")) return true;
    if (message.includes("network")) return true;
    if (message.includes("fetch failed")) return true;
    if (message.includes("temporar")) return true;
    if (message.includes("econnreset") || message.includes("econnrefused")) return true;
    if (message.includes("tls")) return true;
    if (message.includes("http fetch failed")) return true;
    return false;
  };

  const safeRun = async (config: ModuleExecutionConfig, fn: () => Promise<void>) => {
    if (!isFeatureEnabled(config.featureFlag, config.defaultEnabled ?? true)) {
      await upsertModuleResult(config, "skipped", {
        severity: "info",
        normalized: {
          reason: "feature_flag_disabled",
          feature_flag: config.featureFlag,
        },
      });
      await insertObservation({
        module: config.key,
        observation_type: "module_skipped",
        title: `Modulo ${config.label} disabilitato`,
        value: {
          reason: "feature_flag_disabled",
          feature_flag: config.featureFlag || null,
        },
        severity: "info",
      });
      await logAudit("module_skipped", {
        module: config.key,
        feature_flag: config.featureFlag || null,
      });
      console.info("surface_scan_module_complete", {
        scanRunId: job.id,
        tenantId: organizationId,
        moduleKey: config.key,
        status: "skipped",
        durationMs: 0,
      });
      return;
    }

    const startedAtIso = new Date().toISOString();
    const startedAtMs = Date.now();
    await upsertModuleResult(config, "running", {
      startedAt: startedAtIso,
      normalized: { module: config.key, status: "running" },
    });
    console.info("surface_scan_module_start", {
      scanRunId: job.id,
      tenantId: organizationId,
      moduleKey: config.key,
      target: hostname || job.normalized_target,
    });

    const timeoutError = new Error(`Module timeout after ${config.timeoutMs}ms`);
    const totalAttempts = config.retryOnError ? Math.max(1, Number(config.maxRetries || 0) + 1) : 1;
    let attempt = 0;
    let lastError: any = null;

    while (attempt < totalAttempts) {
      attempt += 1;
      let timeoutHandle: number | null = null;

      try {
        await Promise.race([
          fn(),
          new Promise<never>((_, reject) => {
            timeoutHandle = setTimeout(() => reject(timeoutError), config.timeoutMs) as unknown as number;
          }),
        ]);
        if (timeoutHandle !== null) clearTimeout(timeoutHandle);

        const completedAtIso = new Date().toISOString();
        const durationMs = Date.now() - startedAtMs;
        await upsertModuleResult(config, "success", {
          severity: "info",
          startedAt: startedAtIso,
          completedAt: completedAtIso,
          durationMs,
          normalized: {
            module: config.key,
            status: "success",
            duration_ms: durationMs,
            attempts: attempt,
            retry_enabled: totalAttempts > 1,
          },
        });
        await logAudit("module_completed", {
          module: config.key,
          duration_ms: durationMs,
          attempts: attempt,
        });
        console.info("surface_scan_module_complete", {
          scanRunId: job.id,
          tenantId: organizationId,
          moduleKey: config.key,
          status: "success",
          durationMs,
          attempts: attempt,
        });
        return;
      } catch (error: any) {
        if (timeoutHandle !== null) clearTimeout(timeoutHandle);
        lastError = error;
        const isTimeout = error?.message === timeoutError.message;
        const shouldRetry =
          attempt < totalAttempts &&
          config.retryOnError &&
          (isTimeout || isRetryableModuleError(error));

        if (!shouldRetry) {
          break;
        }

        const retryDelayMs = Math.max(250, Number(config.retryBackoffMs || 750) * attempt);
        await insertObservation({
          module: config.key,
          observation_type: "module_retry",
          title: `Retry modulo ${config.label}`,
          value: {
            attempt,
            max_attempts: totalAttempts,
            retry_delay_ms: retryDelayMs,
            reason: String(error?.message || "retryable_error"),
          },
          severity: "low",
        });
        await logAudit("module_retry_scheduled", {
          module: config.key,
          attempt,
          max_attempts: totalAttempts,
          retry_delay_ms: retryDelayMs,
          reason: String(error?.message || "retryable_error"),
        });
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
      }
    }

    const completedAtIso = new Date().toISOString();
    const durationMs = Date.now() - startedAtMs;
    const isTimeout = String(lastError?.message || "") === timeoutError.message;
    const status: ModuleStatus = isTimeout ? "timeout" : "error";
    const severity: "info" | "low" | "medium" = isTimeout ? "low" : "medium";
    const errorMessage = lastError?.message || "Errore non gestito";

    await insertObservation({
      module: config.key,
      observation_type: isTimeout ? "module_timeout" : "module_error",
      title: isTimeout ? `Timeout modulo ${config.label}` : `Errore modulo ${config.label}`,
      value: {
        error: errorMessage,
        timeout_ms: config.timeoutMs,
        attempts: attempt,
        max_attempts: totalAttempts,
      },
      severity,
    });

    await upsertModuleResult(config, status, {
      severity,
      startedAt: startedAtIso,
      completedAt: completedAtIso,
      durationMs,
      errorMessage,
      normalized: {
        module: config.key,
        status,
        timeout_ms: config.timeoutMs,
        duration_ms: durationMs,
        attempts: attempt,
        max_attempts: totalAttempts,
      },
      raw: {
        error: errorMessage,
      },
    });

    await logAudit("module_failed", {
      module: config.key,
      status,
      error: errorMessage,
      duration_ms: durationMs,
      attempts: attempt,
      max_attempts: totalAttempts,
    });
    console.warn("surface_scan_module_error", {
      scanRunId: job.id,
      tenantId: organizationId,
      moduleKey: config.key,
      status,
      durationMs,
      errorMessage,
      attempts: attempt,
      maxAttempts: totalAttempts,
    });
  };

  const recordModuleSkipped = async (
    config: ModuleExecutionConfig,
    reason: string,
    extra: Record<string, unknown> = {},
  ) => {
    const nowIso = new Date().toISOString();
    await upsertModuleResult(config, "skipped", {
      severity: "info",
      startedAt: nowIso,
      completedAt: nowIso,
      durationMs: 0,
      normalized: {
        module: config.key,
        status: "skipped",
        reason,
        ...extra,
      },
    });
    await insertObservation({
      module: config.key,
      observation_type: "module_skipped",
      title: `Modulo ${config.label} saltato`,
      value: {
        reason,
        ...extra,
      },
      severity: "info",
    });
    await logAudit("module_skipped", {
      module: config.key,
      reason,
      ...extra,
    });
  };

  const queryDnsJson = async (
    name: string,
    type: string,
  ): Promise<Record<string, unknown>> => {
    const url = new URL("https://dns.google/resolve");
    url.searchParams.set("name", name);
    url.searchParams.set("type", type);
    url.searchParams.set("do", "1");
    const response = await fetchWithTimeout(url.toString(), {
      headers: { accept: "application/dns-json" },
    }, 8000);
    if (!response.ok) return {};
    const payload = await response.json().catch(() => ({}));
    return payload && typeof payload === "object" ? payload : {};
  };

  const runDnsModule = async () => {
    if (!hostname || !rootDomain) return;
    let dnsLookupReport: DnsLookupResult | null = null;
    try {
      const lookupDomain = rootDomain || hostname;
      dnsLookupReport = await scanDnsLookup({
        domain: lookupDomain,
        resolverUrl: Deno.env.get("DNS_LOOKUP_RESOLVER_URL") || undefined,
        timeoutMs: Number(Deno.env.get("DNS_LOOKUP_TIMEOUT_MS") || 6000),
        includeEmailSecurityChecks: true,
        includeDkimSelectorChecks: false,
        includeWildcardCheck: true,
        userAgent: "SurfaceScan360-DNSLookup/1.0",
      });
    } catch (error) {
      console.warn("surface_scan_dns_lookup_error", {
        scanRunId: job.id,
        tenantId: organizationId,
        hostname,
        rootDomain,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    const types = ["A", "AAAA", "MX", "TXT", "NS", "CNAME", "SOA", "CAA"];
    const records: Record<string, string[]> = {};
    for (const type of types) {
      records[type] = await resolveWithDnsOverHttps(hostname, type);
    }

    for (const ip of [...records.A, ...records.AAAA]) {
      discoveredIps.add(ip);
      await insertAsset({
        asset_type: "ip",
        asset_value: ip,
        hostname,
        root_domain: rootDomain,
        ip,
        source: "dns",
      });
    }

    for (const mx of records.MX) {
      const mxHost = parseHostFromMxRecord(mx);
      await insertAsset({
        asset_type: "mx_host",
        asset_value: mxHost,
        hostname: mxHost,
        root_domain: rootDomain,
        source: "dns",
        raw: { mx_raw: mx },
      });
    }

    for (const ns of records.NS) {
      await insertAsset({
        asset_type: "ns_host",
        asset_value: ns,
        hostname: ns,
        root_domain: rootDomain,
        source: "dns",
      });
    }

    await insertObservation({
      module: "dns",
      observation_type: "dns_records",
      title: "DNS records collected",
      value: records,
    });

    await insertObservation({
      module: "dns_records",
      observation_type: "dns_records_snapshot",
      title: "DNS records snapshot",
      value: {
        domain: hostname,
        records,
        source: "cloudflare-doh",
      },
    });

    await insertObservation({
      module: "txt_records",
      observation_type: "txt_records_snapshot",
      title: "TXT records snapshot",
      value: {
        domain: hostname,
        txt_records: records.TXT,
      },
    });

    const hasIpRecords = records.A.length > 0 || records.AAAA.length > 0;
    if (!hasIpRecords) {
      await insertFinding({
        module: "dns",
        finding_type: "dns_no_ip_record",
        severity: "low",
        title: "No A/AAAA record found",
        description: "Il dominio non espone record A o AAAA pubblici",
        affected_asset: hostname,
        remediation: "Verificare configurazione DNS pubblica del dominio",
      });
    }

    if (records.MX.length === 0) {
      await insertFinding({
        module: "dns",
        finding_type: "dns_no_mx_record",
        severity: "info",
        title: "No MX record found",
        description: "Nessun record MX configurato",
        affected_asset: hostname,
      });
    }

    if (records.CAA.length === 0) {
      await insertFinding({
        module: "dns",
        finding_type: "dns_no_caa_record",
        severity: "low",
        title: "No CAA record found",
        description: "Manca una policy CAA per limitare le CA autorizzate",
        affected_asset: hostname,
        remediation: "Aggiungere record CAA per controllare emissione certificati",
      });
    }

    const txtCombined = records.TXT.join(" ").toLowerCase();
    if (/password|secret|token|api[_-]?key|internal|vpn/.test(txtCombined)) {
      await insertFinding({
        module: "dns",
        finding_type: "dns_txt_leakage",
        severity: "medium",
        title: "Suspicious TXT leakage pattern",
        description: "Record TXT con pattern potenzialmente sensibili",
        affected_asset: hostname,
        evidence: { txt_records: records.TXT },
        remediation: "Rimuovere dati sensibili dai record TXT pubblici",
      });
    }

    const spfRecords = records.TXT.filter((txt) => txt.toLowerCase().includes("v=spf1"));
    const dmarcRecords = await resolveWithDnsOverHttps(`_dmarc.${rootDomain}`, "TXT");
    const dmarcRecord = dmarcRecords.find((rec) => rec.toLowerCase().includes("v=dmarc1"));
    const dmarcPolicy = dmarcRecord ? parseDmarcPolicy(dmarcRecord) : null;
    const hasMx = records.MX.length > 0;

    if (hasMx && spfRecords.length === 0) {
      await insertFinding({
        module: "mail_security",
        finding_type: "mail_spf_missing",
        severity: "medium",
        title: "SPF missing with MX present",
        description: "Dominio con MX ma senza SPF",
        affected_asset: rootDomain,
        remediation: "Pubblicare un record SPF valido",
      });
    }

    if (hasMx && !dmarcRecord) {
      await insertFinding({
        module: "mail_security",
        finding_type: "mail_dmarc_missing",
        severity: "medium",
        title: "DMARC missing with MX present",
        description: "Dominio con MX ma senza DMARC",
        affected_asset: rootDomain,
        remediation: "Pubblicare un record DMARC (v=DMARC1)",
      });
    }

    if (spfRecords.length > 1) {
      await insertFinding({
        module: "mail_security",
        finding_type: "mail_spf_multiple",
        severity: "medium",
        title: "Multiple SPF records found",
        description: "Sono presenti più record SPF, situazione non conforme",
        affected_asset: rootDomain,
        evidence: { spf_records: spfRecords },
      });
    }

    if (spfRecords.some((rec) => /\+all/i.test(rec))) {
      await insertFinding({
        module: "mail_security",
        finding_type: "mail_spf_permissive_all",
        severity: "high",
        title: "SPF too permissive (+all)",
        description: "Record SPF troppo permissivo",
        affected_asset: rootDomain,
        evidence: { spf_records: spfRecords },
        remediation: "Rimuovere +all e definire sorgenti autorizzate specifiche",
      });
    }

    if (spfRecords.some((rec) => /~all/i.test(rec))) {
      await insertFinding({
        module: "mail_security",
        finding_type: "mail_spf_softfail",
        severity: "low",
        title: "SPF softfail (~all)",
        description: "SPF in softfail: valutare hard-fail in ambienti maturi",
        affected_asset: rootDomain,
      });
    }

    if (dmarcPolicy === "none") {
      await insertFinding({
        module: "mail_security",
        finding_type: "mail_dmarc_policy_none",
        severity: "low",
        title: "DMARC policy is p=none",
        description: "DMARC in sola modalità monitor",
        affected_asset: rootDomain,
      });
    }

    const dkimSelectors = [
      "default",
      "google",
      "selector1",
      "selector2",
      "k1",
      "k2",
      "s1",
      "s2",
      "dkim",
      "mail",
    ];
    const dkimHits: string[] = [];
    for (const selector of dkimSelectors) {
      const dkim = await resolveWithDnsOverHttps(`${selector}._domainkey.${rootDomain}`, "TXT");
      if (dkim.length > 0) dkimHits.push(selector);
    }
    const bimiRecords = await resolveWithDnsOverHttps(`default._bimi.${rootDomain}`, "TXT");

    if (dkimHits.length === 0) {
      await insertFinding({
        module: "mail_security",
        finding_type: "mail_no_common_dkim_selectors",
        severity: "info",
        title: "No common DKIM selectors found",
        description: "Nessun selector DKIM comune rilevato",
        affected_asset: rootDomain,
      });
    }

    if (bimiRecords.length === 0) {
      await insertFinding({
        module: "mail_security",
        finding_type: "mail_bimi_missing",
        severity: "info",
        title: "BIMI record missing",
        description: "Record BIMI non trovato",
        affected_asset: rootDomain,
      });
    }

    await insertObservation({
      module: "mail_security",
      observation_type: "mail_security_summary",
      title: "Mail security posture",
      value: {
        has_mx: hasMx,
        spf_records: spfRecords,
        dmarc_records: dmarcRecords,
        dkim_selectors_found: dkimHits,
        bimi_records: bimiRecords,
      },
    });

    await insertObservation({
      module: "mail_config",
      observation_type: "mail_config_summary",
      title: "Mail config summary",
      value: {
        domain: rootDomain,
        mx_records: records.MX,
        spf_records: spfRecords,
        dmarc_records: dmarcRecords,
        dkim_selectors_found: dkimHits,
        bimi_records: bimiRecords,
      },
    });

    if (dnsLookupReport) {
      await insertObservation({
        module: "dns_lookup",
        observation_type: "dns_lookup_summary",
        title: "DNS Lookup posture summary",
        value: {
          domain_scanned: dnsLookupReport.normalizedDomain,
          score: dnsLookupReport.score,
          grade: dnsLookupReport.grade,
          resolver: dnsLookupReport.resolver,
          duration_ms: dnsLookupReport.durationMs,
          summary: dnsLookupReport.summary,
        },
      });

      await insertObservation({
        module: "dns_lookup_records",
        observation_type: "dns_lookup_records_snapshot",
        title: "DNS Lookup records snapshot",
        value: {
          domain_scanned: dnsLookupReport.normalizedDomain,
          records: dnsLookupReport.records,
          additional_records: dnsLookupReport.additionalRecords,
        },
      });

      await insertObservation({
        module: "dns_lookup",
        observation_type: "dns_lookup_findings",
        title: "DNS Lookup findings",
        value: {
          domain_scanned: dnsLookupReport.normalizedDomain,
          findings: dnsLookupReport.findings.map((entry) => ({
            id: entry.id,
            category: entry.category,
            title: entry.title,
            severity: entry.severity,
            status: entry.status,
            recommendation: entry.recommendation,
            report_summary: entry.reportSummary,
            evidence: entry.evidence || {},
          })),
        },
      });

      try {
        const reportSummary = dnsLookupReport.summary || ({} as Record<string, unknown>);
        const summaryJson = reportSummary as unknown as Record<string, unknown>;
        const recordsJson = (dnsLookupReport.records || {}) as unknown as Record<string, unknown>;
        const additionalJson = (dnsLookupReport.additionalRecords || {}) as unknown as Record<string, unknown>;
        const rawResultJson = dnsLookupReport as unknown as Record<string, unknown>;

        const insertedResult = await adminClient
          .from("surface_dns_lookup_results" as any)
          .insert({
            tenant_id: organizationId,
            organization_id: organizationId,
            customer_id: customerId,
            scan_id: job.id,
            asset_id: null,
            domain: dnsLookupReport.domain,
            normalized_domain: dnsLookupReport.normalizedDomain,
            resolver: dnsLookupReport.resolver,
            score: dnsLookupReport.score,
            grade: dnsLookupReport.grade,
            records: recordsJson,
            additional_records: additionalJson,
            summary: summaryJson,
            raw_result: rawResultJson,
            duration_ms: dnsLookupReport.durationMs,
            scanned_at: dnsLookupReport.completedAt,
          })
          .select("id")
          .maybeSingle();

        const dnsResultId = String(insertedResult.data?.id || "").trim();
        if (dnsResultId) {
          const payload = dnsLookupReport.findings.map((entry) => ({
            tenant_id: organizationId,
            organization_id: organizationId,
            customer_id: customerId,
            dns_lookup_result_id: dnsResultId,
            scan_id: job.id,
            asset_id: null,
            domain: dnsLookupReport.normalizedDomain,
            finding_key: entry.id,
            category: entry.category,
            severity: entry.severity,
            status: entry.status,
            title: entry.title,
            description: entry.description,
            evidence: (entry.evidence || {}) as Record<string, unknown>,
            recommendation: entry.recommendation,
            report_summary: entry.reportSummary || null,
          }));
          if (payload.length > 0) {
            await adminClient.from("surface_dns_lookup_findings" as any).insert(payload);
          }
        }
      } catch (error) {
        console.warn("surface_scan_dns_lookup_persist_error", {
          scanRunId: job.id,
          tenantId: organizationId,
          error: error instanceof Error ? error.message : String(error),
        });
      }

      for (const dnsFinding of dnsLookupReport.findings) {
        const status = String(dnsFinding.status || "").toLowerCase();
        if (status === "pass" || status === "info") continue;
        const severity = toSeverity(dnsFinding.severity);
        await insertFinding({
          module: "dns_lookup",
          finding_type: `dns_lookup_${dnsFinding.id}`,
          severity,
          title: dnsFinding.title,
          description: dnsFinding.description,
          affected_asset: dnsLookupReport.normalizedDomain,
          evidence: {
            category: dnsFinding.category,
            status: dnsFinding.status,
            report_summary: dnsFinding.reportSummary,
            ...((dnsFinding.evidence || {}) as Record<string, unknown>),
          },
          remediation: dnsFinding.recommendation,
        });
      }
    }
  };

  const runDnssecModule = async () => {
    if (!rootDomain) return;
    const [dnskeyPayload, dsPayload, aPayload] = await Promise.all([
      queryDnsJson(rootDomain, "DNSKEY"),
      queryDnsJson(rootDomain, "DS"),
      queryDnsJson(rootDomain, "A"),
    ]);
    const dnssecStatus = summarizeDnssecStatus(dnskeyPayload, dsPayload, aPayload);

    await insertObservation({
      module: "dnssec",
      observation_type: "dnssec_status",
      title: "DNSSEC status",
      value: {
        domain: rootDomain,
        dnskey_present: dnssecStatus.dnskey_present,
        ds_present: dnssecStatus.ds_present,
        rrsig_present: dnssecStatus.rrsig_present,
        authenticated_data: dnssecStatus.authenticated_data,
        records: {
          dnskey: dnssecStatus.dnskey_records,
          ds: dnssecStatus.ds_records,
        },
        source: "google-doh",
      },
    });

    if (!dnssecStatus.dnskey_present && !dnssecStatus.ds_present) {
      await insertFinding({
        module: "dnssec",
        finding_type: "dnssec_missing",
        severity: "medium",
        title: "DNSSEC not enabled",
        description: "Il dominio non espone record DS/DNSKEY",
        affected_asset: rootDomain,
        remediation: "Abilitare DNSSEC presso registrar/provider DNS e verificare delega DS.",
      });
      return;
    }

    if (dnssecStatus.ds_present && !dnssecStatus.dnskey_present) {
      await insertFinding({
        module: "dnssec",
        finding_type: "dnssec_inconsistent_delegation",
        severity: "high",
        title: "DNSSEC delegation appears inconsistent",
        description: "Record DS presente ma DNSKEY non rilevato: possibile incoerenza nella delega DNSSEC.",
        affected_asset: rootDomain,
        remediation: "Verificare firma zona, record DNSKEY e pubblicazione DS lato parent zone.",
      });
    }
  };

  const runWhoisModule = async () => {
    if (!rootDomain) {
      await insertObservation({
        module: "whois",
        observation_type: "module_skipped",
        title: "WHOIS module skipped",
        value: {
          reason: "missing_root_domain",
          target_type: parsedTarget.target_type,
          hostname: hostname || null,
        },
        severity: "info",
      });
      return;
    }

    const nowMs = Date.now();
    const rdapUrl = `https://rdap.org/domain/${encodeURIComponent(rootDomain)}`;
    const firecrawlApiKey = String(Deno.env.get("FIRECRAWL_API_KEY") || "").trim();
    const firecrawlWhoisEnabled =
      String(Deno.env.get("SURFACESCAN_WHOIS_FIRECRAWL_ENABLED") || "true").toLowerCase() !== "false";
    const firecrawlWhoisTimeoutMs = Math.max(
      2500,
      Math.min(8000, Number(Deno.env.get("SURFACESCAN_WHOIS_FIRECRAWL_TIMEOUT_MS") || "6000")),
    );
    const firecrawlWhoisRetries = Math.max(
      0,
      Math.min(1, Number(Deno.env.get("SURFACESCAN_WHOIS_FIRECRAWL_RETRIES") || "0")),
    );
    const firecrawlWhoisMaxMarkdownChars = Math.max(
      1000,
      Math.min(50000, Number(Deno.env.get("SURFACESCAN_WHOIS_FIRECRAWL_MAX_CHARS") || "15000")),
    );
    const firecrawlMiskWhoisUrl = `https://www.misk.com/tools/#whois/${encodeURIComponent(rootDomain)}`;

    type WhoisProviderResult = {
      provider: string;
      ok: boolean;
      status: number | null;
      error: string | null;
      summary: WhoisRdapSummary | null;
      details?: Record<string, unknown>;
    };

    const mergeWhoisSummaries = (primary: WhoisRdapSummary | null, fallback: WhoisRdapSummary | null): WhoisRdapSummary | null => {
      if (!primary && !fallback) return null;
      if (!primary) return fallback;
      if (!fallback) return primary;

      const expires = primary.expires || fallback.expires;
      const expiryMs = expires ? Date.parse(expires) : Number.NaN;
      const daysToExpiry = primary.days_to_expiry !== null
        ? primary.days_to_expiry
        : fallback.days_to_expiry !== null
          ? fallback.days_to_expiry
          : Number.isFinite(expiryMs)
            ? Math.round((expiryMs - nowMs) / 86400000)
            : null;

      return {
        domain: primary.domain || fallback.domain || rootDomain,
        registrar: primary.registrar || fallback.registrar,
        created: primary.created || fallback.created,
        updated: primary.updated || fallback.updated,
        expires,
        days_to_expiry: daysToExpiry,
        registration_valid: daysToExpiry === null ? false : daysToExpiry >= 0,
        nameservers: Array.from(new Set([...(primary.nameservers || []), ...(fallback.nameservers || [])])),
        dnssec: primary.dnssec || fallback.dnssec,
      };
    };

    const rdapTask = (async (): Promise<WhoisProviderResult> => {
      try {
        const response = await fetchWithTimeout(
          rdapUrl,
          {
            headers: {
              accept: "application/rdap+json, application/json;q=0.9",
              "user-agent": "SurfaceScan360/1.0",
            },
          },
          10000,
        );

        if (!response.ok) {
          return {
            provider: "rdap.org",
            ok: false,
            status: response.status,
            error: `rdap_http_${response.status}`,
            summary: null,
          };
        }

        const payload = await response.json().catch(() => ({}));
        return {
          provider: "rdap.org",
          ok: true,
          status: response.status,
          error: null,
          summary: summarizeWhoisRdap(payload, nowMs),
          details: {
            status: Array.isArray((payload as any)?.status) ? (payload as any).status : [],
          },
        };
      } catch (error: any) {
        return {
          provider: "rdap.org",
          ok: false,
          status: null,
          error: String(error?.message || "rdap_fetch_failed"),
          summary: null,
        };
      }
    })();

    const firecrawlTask = (async (): Promise<WhoisProviderResult> => {
      if (!firecrawlWhoisEnabled || !firecrawlApiKey) {
        return {
          provider: "misk.com/firecrawl",
          ok: false,
          status: null,
          error: firecrawlWhoisEnabled ? "firecrawl_not_configured" : "firecrawl_disabled",
          summary: null,
        };
      }

      try {
        const scrape = await firecrawlScrape({
          apiKey: firecrawlApiKey,
          targetUrl: firecrawlMiskWhoisUrl,
          timeoutMs: firecrawlWhoisTimeoutMs,
          retries: firecrawlWhoisRetries,
          maxMarkdownChars: firecrawlWhoisMaxMarkdownChars,
          onlyMainContent: false,
          onlyCleanContent: false,
          waitForMs: 1500,
          actions: [
            { type: "wait", milliseconds: 1000 },
            { type: "click", selector: "input[name='domain']" },
            { type: "write", text: rootDomain },
            { type: "press", key: "Enter" },
            { type: "wait", milliseconds: 1800 },
          ],
          requestHeaders: {
            Referer: "https://www.misk.com/tools/",
            Origin: "https://www.misk.com",
          },
        });

        const rawText = `${scrape.title}\n${scrape.summary}\n${scrape.markdown}`.trim();
        const parsedSummary = summarizeWhoisText(rawText, rootDomain, nowMs);
        const hasCoreData =
          Boolean(parsedSummary.registrar) ||
          Boolean(parsedSummary.expires) ||
          parsedSummary.days_to_expiry !== null ||
          parsedSummary.nameservers.length > 0 ||
          Boolean(parsedSummary.dnssec);

        return {
          provider: "misk.com/firecrawl",
          ok: scrape.ok && hasCoreData,
          status: scrape.status,
          error: scrape.ok
            ? (hasCoreData ? null : "firecrawl_whois_no_core_fields")
            : String(scrape.error || "firecrawl_whois_failed"),
          summary: hasCoreData ? parsedSummary : null,
          details: {
            source_url: scrape.sourceUrl,
            warning: scrape.warning,
            links_count: scrape.links.length,
          },
        };
      } catch (error: any) {
        return {
          provider: "misk.com/firecrawl",
          ok: false,
          status: null,
          error: String(error?.message || "firecrawl_whois_failed"),
          summary: null,
        };
      }
    })();

    const [rdapResult, firecrawlResult] = await Promise.all([rdapTask, firecrawlTask]);
    const mergedSummary = mergeWhoisSummaries(rdapResult.summary, firecrawlResult.summary);

    if (!mergedSummary) {
      await insertObservation({
        module: "whois",
        observation_type: "rdap_unavailable",
        title: "RDAP/WHOIS lookup unavailable",
        value: {
          domain: rootDomain,
          rdap_url: rdapUrl,
          rdap_status: rdapResult.status,
          rdap_error: rdapResult.error,
          fallback_provider: firecrawlResult.provider,
          fallback_status: firecrawlResult.status,
          fallback_error: firecrawlResult.error,
          fallback_target_url: firecrawlMiskWhoisUrl,
        },
        severity: "low",
      });
      return;
    }

    if (!rdapResult.ok) {
      await insertObservation({
        module: "whois",
        observation_type: "rdap_unavailable",
        title: "RDAP lookup unavailable (fallback used)",
        value: {
          domain: rootDomain,
          rdap_url: rdapUrl,
          rdap_status: rdapResult.status,
          rdap_error: rdapResult.error,
          fallback_provider: firecrawlResult.provider,
          fallback_status: firecrawlResult.status,
          fallback_error: firecrawlResult.error,
          fallback_target_url: firecrawlMiskWhoisUrl,
        },
        severity: "low",
      });
    }

    const sourceLabel = (() => {
      if (rdapResult.ok && firecrawlResult.ok) return "rdap.org+misk.com/firecrawl";
      if (rdapResult.ok) return "rdap.org";
      if (firecrawlResult.ok) return "misk.com/firecrawl";
      return "unknown";
    })();

    await insertObservation({
      module: "whois",
      observation_type: "whois_rdap",
      title: "Domain WHOIS via RDAP",
      value: {
        domain: mergedSummary.domain || rootDomain,
        registrar: mergedSummary.registrar,
        created: mergedSummary.created,
        updated: mergedSummary.updated,
        expires: mergedSummary.expires,
        days_to_expiry: mergedSummary.days_to_expiry,
        registration_valid: mergedSummary.registration_valid,
        nameservers: mergedSummary.nameservers,
        status: Array.isArray(rdapResult.details?.status) ? rdapResult.details?.status : [],
        dnssec: mergedSummary.dnssec,
        source: sourceLabel,
        providers: {
          rdap: {
            ok: rdapResult.ok,
            status: rdapResult.status,
            error: rdapResult.error,
          },
          misk_firecrawl: {
            ok: firecrawlResult.ok,
            status: firecrawlResult.status,
            error: firecrawlResult.error,
          },
        },
      },
    });

    if (mergedSummary.days_to_expiry !== null && mergedSummary.days_to_expiry < 0) {
      await insertFinding({
        module: "whois",
        finding_type: "domain_expired",
        severity: "critical",
        title: "Domain registration expired",
        affected_asset: rootDomain,
        description: "Il dominio risulta scaduto secondo i dati RDAP.",
        remediation: "Rinnovare immediatamente il dominio e verificare stato presso il registrar.",
      });
    } else if (mergedSummary.days_to_expiry !== null && mergedSummary.days_to_expiry < 30) {
      await insertFinding({
        module: "whois",
        finding_type: "domain_expiry_soon_30d",
        severity: "high",
        title: "Domain expires in less than 30 days",
        affected_asset: rootDomain,
        description: `Scadenza dominio imminente (${mergedSummary.days_to_expiry} giorni).`,
        remediation: "Pianificare rinnovo immediato per evitare interruzioni operative.",
      });
    } else if (mergedSummary.days_to_expiry !== null && mergedSummary.days_to_expiry < 90) {
      await insertFinding({
        module: "whois",
        finding_type: "domain_expiry_soon_90d",
        severity: "medium",
        title: "Domain expires in less than 90 days",
        affected_asset: rootDomain,
        description: `Scadenza dominio nei prossimi ${mergedSummary.days_to_expiry} giorni.`,
        remediation: "Programmare rinnovo dominio e verifica contatti amministrativi.",
      });
    }

    if (!mergedSummary.registrar || !mergedSummary.expires) {
      await insertFinding({
        module: "whois",
        finding_type: "whois_partial_data",
        severity: "info",
        title: "WHOIS/RDAP partial registration data",
        affected_asset: rootDomain,
        description: "Informazioni registrar/scadenza non complete nei dati RDAP.",
      });
    }
  };

  const runHttpModules = async () => {
    const snapshot = await fetchPrimaryHttpSnapshot();
    const headers = snapshot.headers;
    const headerValue = (key: string): string | null => {
      const value = headers[key.toLowerCase()];
      return value ? String(value) : null;
    };

    const csp = headerValue("content-security-policy");
    const hsts = headerValue("strict-transport-security");
    const xcto = headerValue("x-content-type-options");
    const xfo = headerValue("x-frame-options");
    const referrer = headerValue("referrer-policy");
    const permissions = headerValue("permissions-policy");
    const coop = headerValue("cross-origin-opener-policy");
    const corp = headerValue("cross-origin-resource-policy");
    const coep = headerValue("cross-origin-embedder-policy");
    const xXssLegacy = headerValue("x-xss-protection");
    const serverHeader = headerValue("server");
    const poweredByHeader = headerValue("x-powered-by");
    const headerReport = evaluateHeaders(
      snapshot.requestUrl,
      snapshot.finalUrl || null,
      Number.isFinite(snapshot.statusCode) ? snapshot.statusCode : null,
      Number.isFinite(snapshot.responseTimeMs) ? snapshot.responseTimeMs : 0,
      headers,
    );
    const findingByRule = new Map(headerReport.findings.map((entry) => [entry.ruleId, entry] as const));

    const checks = {
      contentSecurityPolicy: findingByRule.get("csp")?.status === "ok",
      strictTransportSecurity: findingByRule.get("hsts")?.status === "ok",
      xContentTypeOptions: findingByRule.get("x-content-type-options")?.status === "ok",
      xFrameOptions: findingByRule.get("frame-protection")?.status === "ok",
      referrerPolicy: findingByRule.get("referrer-policy")?.status === "ok",
      permissionsPolicy: findingByRule.get("permissions-policy")?.status === "ok",
      crossOriginOpenerPolicy: findingByRule.get("coop")?.status === "ok",
      crossOriginResourcePolicy: findingByRule.get("corp")?.status === "ok",
      crossOriginEmbedderPolicy: findingByRule.get("coep")?.status === "ok",
      xXssProtectionLegacy: Boolean(xXssLegacy),
    };
    const score = Number(headerReport.score || 0);

    await insertObservation({
      module: "http_status",
      observation_type: "http_status",
      title: "HTTP status collected",
      value: {
        status: snapshot.statusCode,
        response_time_ms: snapshot.responseTimeMs,
        final_url: snapshot.finalUrl,
        attempted_urls: snapshot.attemptedUrls,
        content_type: headerValue("content-type"),
        server: serverHeader,
        powered_by: poweredByHeader,
        content_length: headerValue("content-length"),
      },
    });

    await insertObservation({
      module: "http_headers",
      observation_type: "http_headers",
      title: "HTTP headers collected",
      value: headers,
    });

    await insertObservation({
      module: "headers",
      observation_type: "headers_interpretation",
      title: "HTTP headers interpretation",
      value: {
        url: snapshot.requestUrl,
        final_url: snapshot.finalUrl,
        status_code: snapshot.statusCode,
        highlighted: {
          server: serverHeader,
          x_powered_by: poweredByHeader,
          via: headerValue("via"),
          cf_ray: headerValue("cf-ray"),
          cache_control: headerValue("cache-control"),
          content_type: headerValue("content-type"),
          content_encoding: headerValue("content-encoding"),
          location: headerValue("location"),
          set_cookie_count: snapshot.setCookies.length,
        },
        set_cookies: snapshot.setCookies.slice(0, 30),
      },
    });

    await insertObservation({
      module: "http_security",
      observation_type: "http_security_summary",
      title: "HTTP security headers summary",
      value: {
        url: snapshot.requestUrl,
        finalUrl: snapshot.finalUrl,
        statusCode: snapshot.statusCode,
        checks,
        score,
        headers: {
          "content-security-policy": csp,
          "strict-transport-security": hsts,
          "x-content-type-options": xcto,
          "x-frame-options": xfo,
          "referrer-policy": referrer,
          "permissions-policy": permissions,
          "cross-origin-opener-policy": coop,
          "cross-origin-resource-policy": corp,
          "cross-origin-embedder-policy": coep,
          "x-xss-protection": xXssLegacy,
        },
        source: "http_fetch",
      },
    });

    await insertObservation({
      module: "http_security",
      observation_type: "http_headers_scanner_summary",
      title: "HTTP header scanner summary",
      value: {
        url: snapshot.requestUrl,
        finalUrl: headerReport.finalUrl,
        statusCode: headerReport.statusCode,
        checks,
        headers: {
          "content-security-policy": csp,
          "strict-transport-security": hsts,
          "x-content-type-options": xcto,
          "x-frame-options": xfo,
          "referrer-policy": referrer,
          "permissions-policy": permissions,
          "cross-origin-opener-policy": coop,
          "cross-origin-resource-policy": corp,
          "cross-origin-embedder-policy": coep,
          "x-xss-protection": xXssLegacy,
        },
        scanner: headerReport.scanner,
        scanner_version: headerReport.scannerVersion,
        score: headerReport.score,
        grade: headerReport.grade,
        summary: headerReport.summary,
        response_time_ms: headerReport.responseTimeMs,
        status_code: headerReport.statusCode,
        final_url: headerReport.finalUrl,
        is_https: headerReport.isHttps,
      },
    });

    await insertObservation({
      module: "headers",
      observation_type: "http_headers_scanner_findings",
      title: "HTTP header scanner findings",
      value: {
        findings: headerReport.findings.map((entry) => ({
          rule_id: entry.ruleId,
          header: entry.header,
          severity: entry.severity,
          status: entry.status,
          category: entry.category,
          note: entry.note,
          recommendation: entry.recommendation,
          actual_value: entry.actualValue,
          earned_points: entry.earnedPoints,
          weight: entry.weight,
          evidence: entry.evidence || {},
        })),
      },
    });

    const { data: insertedHeaderResult } = await adminClient
      .from("surface_http_header_results" as any)
      .insert({
        organization_id: organizationId,
        tenant_id: tenantId,
        customer_id: customerId,
        scan_id: job.id,
        project_id: customerId || organizationId,
        asset_id: null,
        asset_type: parsedTarget.target_type === "url" ? "url" : "domain",
        input_url: snapshot.requestUrl,
        normalized_url: headerReport.normalizedUrl,
        final_url: headerReport.finalUrl,
        status_code: headerReport.statusCode,
        is_https: headerReport.isHttps,
        response_time_ms: headerReport.responseTimeMs,
        score: headerReport.score,
        grade: headerReport.grade,
        ok_count: headerReport.summary.ok,
        weak_count: headerReport.summary.weak,
        missing_count: headerReport.summary.missing,
        high_impact_open_count: headerReport.summary.highImpactOpen,
        raw_headers: headerReport.rawHeaders,
        error_message: headerReport.error || null,
        scanned_at: headerReport.scannedAt,
      })
      .select("id")
      .maybeSingle();

    if (insertedHeaderResult?.id) {
      const payload = headerReport.findings.map((entry) => ({
        result_id: insertedHeaderResult.id,
        scan_id: job.id,
        project_id: customerId || organizationId,
        organization_id: organizationId,
        tenant_id: tenantId,
        customer_id: customerId,
        asset_id: null,
        rule_id: entry.ruleId,
        header_name: entry.header,
        category: entry.category,
        severity: entry.severity,
        status: entry.status,
        weight: entry.weight,
        earned_points: entry.earnedPoints,
        actual_value: entry.actualValue,
        note: entry.note,
        description: entry.description,
        recommendation: entry.recommendation,
        evidence: entry.evidence || {},
      }));
      if (payload.length > 0) {
        await adminClient.from("surface_http_header_findings" as any).insert(payload);
      }
    }

    const knownMissingFindingRules = new Set([
      "csp",
      "hsts",
      "x-content-type-options",
      "frame-protection",
      "referrer-policy",
      "permissions-policy",
      "coop",
      "corp",
      "coep",
    ]);
    for (const entry of headerReport.findings) {
      if (entry.status === "ok") continue;
      if (entry.status === "missing" && knownMissingFindingRules.has(entry.ruleId)) continue;
      await insertFinding({
        module: "http_security",
        finding_type: `http_header_${entry.ruleId}_${entry.status}`,
        severity: entry.severity,
        title: `${entry.header} ${entry.status === "missing" ? "missing" : "weak"}`,
        description: entry.note,
        remediation: entry.recommendation,
        affected_url: snapshot.finalUrl || snapshot.requestUrl,
        evidence: {
          header: entry.header,
          status: entry.status,
          actual_value: entry.actualValue,
          category: entry.category,
          score_weight: entry.weight,
        },
      });
    }

    if (snapshot.statusCode >= 500) {
      await insertFinding({
        module: "http_status",
        finding_type: "http_5xx",
        severity: "medium",
        title: `HTTP ${snapshot.statusCode} detected`,
        description: "Endpoint restituisce errore server",
        affected_url: snapshot.requestUrl,
      });
    } else if (snapshot.statusCode >= 400) {
      await insertFinding({
        module: "http_status",
        finding_type: "http_4xx",
        severity: "low",
        title: `HTTP ${snapshot.statusCode} detected`,
        description: "Endpoint restituisce errore client",
        affected_url: snapshot.requestUrl,
      });
    }

    if (serverHeader) {
      await insertFinding({
        module: "headers",
        finding_type: "server_header_exposed",
        severity: "info",
        title: "Server header exposed",
        description: "Header Server visibile pubblicamente",
        affected_url: snapshot.finalUrl || snapshot.requestUrl,
      });
      if (/[a-z0-9._-]+\/\d/i.test(serverHeader)) {
        await insertFinding({
          module: "headers",
          finding_type: "server_header_detailed_version",
          severity: "low",
          title: "Server header reveals version details",
          description: "L'header Server espone versione o dettagli implementativi.",
          affected_url: snapshot.finalUrl || snapshot.requestUrl,
          evidence: { server: serverHeader },
        });
      }
    }

    if (poweredByHeader) {
      await insertFinding({
        module: "headers",
        finding_type: "x_powered_by_exposed",
        severity: "low",
        title: "X-Powered-By exposed",
        description: "Header X-Powered-By esposto",
        affected_url: snapshot.finalUrl || snapshot.requestUrl,
      });
    }

    if (!csp) {
      await insertFinding({
        module: "http_security",
        finding_type: "missing_csp",
        severity: "medium",
        title: "Missing Content-Security-Policy",
        remediation: "Aggiungere header CSP restrittivo.",
        affected_url: snapshot.finalUrl || snapshot.requestUrl,
      });
    }

    if (snapshot.protocol === "https" && !hsts) {
      await insertFinding({
        module: "http_security",
        finding_type: "missing_hsts",
        severity: "medium",
        title: "Missing HSTS",
        remediation: "Aggiungere header Strict-Transport-Security.",
        affected_url: snapshot.finalUrl || snapshot.requestUrl,
      });
    }

    if (hsts) {
      const maxAgeMatch = hsts.match(/max-age=(\d+)/i);
      const maxAge = maxAgeMatch ? Number(maxAgeMatch[1]) : 0;
      const includeSubdomains = /includesubdomains/i.test(hsts);
      const preload = /preload/i.test(hsts);

      await insertObservation({
        module: "hsts",
        observation_type: "hsts_analysis",
        title: "HSTS analyzed",
        value: {
          exists: true,
          max_age: maxAge,
          include_subdomains: includeSubdomains,
          preload,
        },
      });

      if (maxAge > 0 && maxAge < 15552000) {
        await insertFinding({
          module: "hsts",
          finding_type: "hsts_max_age_low",
          severity: "low",
          title: "HSTS max-age too low",
          affected_url: snapshot.finalUrl || snapshot.requestUrl,
        });
      }
      if (!includeSubdomains) {
        await insertFinding({
          module: "hsts",
          finding_type: "hsts_missing_include_subdomains",
          severity: "low",
          title: "HSTS includeSubDomains missing",
          affected_url: snapshot.finalUrl || snapshot.requestUrl,
        });
      }
      if (!preload) {
        await insertFinding({
          module: "hsts",
          finding_type: "hsts_missing_preload",
          severity: "info",
          title: "HSTS preload missing",
          affected_url: snapshot.finalUrl || snapshot.requestUrl,
        });
      }
    }

    if (!xcto) {
      await insertFinding({
        module: "http_security",
        finding_type: "missing_x_content_type_options",
        severity: "low",
        title: "Missing X-Content-Type-Options",
        affected_url: snapshot.finalUrl || snapshot.requestUrl,
      });
    }
    if (!checks.xFrameOptions) {
      await insertFinding({
        module: "http_security",
        finding_type: "missing_framing_protection",
        severity: "medium",
        title: "Missing anti-framing protection",
        affected_url: snapshot.finalUrl || snapshot.requestUrl,
      });
    }
    if (!referrer) {
      await insertFinding({
        module: "http_security",
        finding_type: "missing_referrer_policy",
        severity: "low",
        title: "Missing Referrer-Policy",
        affected_url: snapshot.finalUrl || snapshot.requestUrl,
      });
    }
    if (!permissions) {
      await insertFinding({
        module: "http_security",
        finding_type: "missing_permissions_policy",
        severity: "low",
        title: "Missing Permissions-Policy",
        affected_url: snapshot.finalUrl || snapshot.requestUrl,
      });
    }
    if (!coop) {
      await insertFinding({
        module: "http_security",
        finding_type: "missing_coop",
        severity: "info",
        title: "Missing Cross-Origin-Opener-Policy",
        affected_url: snapshot.finalUrl || snapshot.requestUrl,
      });
    }
    if (!corp) {
      await insertFinding({
        module: "http_security",
        finding_type: "missing_corp",
        severity: "info",
        title: "Missing Cross-Origin-Resource-Policy",
        affected_url: snapshot.finalUrl || snapshot.requestUrl,
      });
    }
    if (!coep) {
      await insertFinding({
        module: "http_security",
        finding_type: "missing_coep",
        severity: "info",
        title: "Missing Cross-Origin-Embedder-Policy",
        affected_url: snapshot.finalUrl || snapshot.requestUrl,
      });
    }

    for (const cookie of snapshot.setCookies) {
      const lower = cookie.toLowerCase();
      if (!/;\s*secure\b/.test(lower)) {
        await insertFinding({
          module: "headers",
          finding_type: "cookie_missing_secure",
          severity: "medium",
          title: "Cookie without Secure attribute",
          affected_url: snapshot.finalUrl || snapshot.requestUrl,
          evidence: { cookie },
        });
      }
      if (!/;\s*httponly\b/.test(lower)) {
        await insertFinding({
          module: "headers",
          finding_type: "cookie_missing_httponly",
          severity: "medium",
          title: "Cookie without HttpOnly attribute",
          affected_url: snapshot.finalUrl || snapshot.requestUrl,
          evidence: { cookie },
        });
      }
      if (!/;\s*samesite=/i.test(lower)) {
        await insertFinding({
          module: "headers",
          finding_type: "cookie_missing_samesite",
          severity: "low",
          title: "Cookie without SameSite attribute",
          affected_url: snapshot.finalUrl || snapshot.requestUrl,
          evidence: { cookie },
        });
      }
    }

    const bodyLower = snapshot.bodyExcerpt.toLowerCase();
    if (serverHeader) {
      if (/nginx/i.test(serverHeader)) addTechFingerprint("nginx", { categories: ["web server"], confidence: 80, source: "headers" });
      if (/apache/i.test(serverHeader)) addTechFingerprint("Apache HTTP Server", { categories: ["web server"], confidence: 80, source: "headers" });
      if (/iis/i.test(serverHeader)) addTechFingerprint("Microsoft IIS", { categories: ["web server"], confidence: 80, source: "headers" });
    }
    if (poweredByHeader) {
      if (/php/i.test(poweredByHeader)) addTechFingerprint("PHP", { categories: ["programming language"], confidence: 85, source: "headers" });
      if (/asp\.net/i.test(poweredByHeader)) addTechFingerprint("ASP.NET", { categories: ["application framework"], confidence: 85, source: "headers" });
      if (/express/i.test(poweredByHeader)) addTechFingerprint("Express", { categories: ["application framework"], confidence: 75, source: "headers" });
    }
    if (headerValue("cf-ray")) addTechFingerprint("Cloudflare", { categories: ["cdn", "security"], confidence: 90, source: "headers" });
    if (bodyLower.includes("/wp-content/") || bodyLower.includes("wp-includes") || /wordpress/i.test(bodyLower)) {
      addTechFingerprint("WordPress", { categories: ["cms"], confidence: 80, source: "html" });
    }
    if (bodyLower.includes("_next/static")) {
      addTechFingerprint("Next.js", { categories: ["javascript framework"], confidence: 75, source: "html" });
    }
    if (bodyLower.includes("cdn.shopify.com")) {
      addTechFingerprint("Shopify", { categories: ["ecommerce"], confidence: 75, source: "html" });
    }
    if (/react/i.test(bodyLower) && bodyLower.includes("data-reactroot")) {
      addTechFingerprint("React", { categories: ["javascript framework"], confidence: 70, source: "html" });
    }
    if (bodyLower.includes("laravel_session")) {
      addTechFingerprint("Laravel", { categories: ["application framework"], confidence: 75, source: "cookies" });
    }
  };

  const runRobotsModule = async () => {
    if (!hostname) return;
    const robotsUrl = `https://${hostname}/robots.txt`;
    const safeFetch = await fetchWithSsrfGuard(robotsUrl, {}, {
      timeoutMs: 10000,
      maxRedirects: 5,
      maxResponseBytes: 250000,
    });
    const res = safeFetch.response;
    const body = await res.text();
    const disallowPaths = body
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => /^disallow:/i.test(line))
      .map((line) => line.replace(/^disallow:\s*/i, "").trim())
      .filter(Boolean);
    const sitemapEntries = body
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => /^sitemap:/i.test(line))
      .map((line) => line.replace(/^sitemap:\s*/i, "").trim())
      .filter(Boolean);

    await insertObservation({
      module: "robots",
      observation_type: "robots_txt",
      title: "Robots.txt analyzed",
      value: {
        exists: res.ok,
        status: res.status,
        disallow_paths: disallowPaths,
        sitemap_entries: sitemapEntries,
      },
    });

    const sensitive = disallowPaths.filter(looksSensitivePath);
    if (sensitive.length > 0) {
      await insertFinding({
        module: "robots",
        finding_type: "robots_sensitive_paths",
        severity: "low",
        title: "Robots.txt exposes sensitive-looking paths",
        description: "Sono presenti path sensibili in disallow",
        affected_asset: hostname,
        evidence: { sensitive_paths: sensitive },
      });
    }
  };

  const runSecurityTxtModule = async () => {
    if (!hostname) return;
    const urls = [`https://${hostname}/.well-known/security.txt`, `https://${hostname}/security.txt`];
    let found = false;
    let content = "";
    let usedUrl = "";

    for (const url of urls) {
      try {
        const safeFetch = await fetchWithSsrfGuard(url, {}, {
          timeoutMs: 10000,
          maxRedirects: 5,
          maxResponseBytes: 200000,
        });
        const res = safeFetch.response;
        if (res.ok) {
          content = await res.text();
          usedUrl = safeFetch.finalUrl || url;
          found = true;
          break;
        }
      } catch {
        // try fallback location
      }
    }

    const extractField = (field: string) =>
      content
        .split("\n")
        .filter((line) => line.toLowerCase().startsWith(`${field.toLowerCase()}:`))
        .map((line) => line.split(":").slice(1).join(":").trim());

    const expires = extractField("Expires")[0] || null;
    const expiresDate = expires ? new Date(expires) : null;
    const isExpired = expiresDate ? expiresDate.getTime() < Date.now() : false;

    await insertObservation({
      module: "security_txt",
      observation_type: "security_txt",
      title: "Security.txt analyzed",
      value: {
        exists: found,
        source_url: usedUrl || null,
        contact: extractField("Contact"),
        expires,
        encryption: extractField("Encryption"),
        policy: extractField("Policy"),
        acknowledgments: extractField("Acknowledgments"),
      },
    });

    if (!found) {
      await insertFinding({
        module: "security_txt",
        finding_type: "security_txt_missing",
        severity: "info",
        title: "Missing security.txt",
        description: "File security.txt non trovato",
        affected_asset: hostname,
      });
    } else if (isExpired) {
      await insertFinding({
        module: "security_txt",
        finding_type: "security_txt_expired",
        severity: "low",
        title: "Expired security.txt",
        affected_asset: hostname,
      });
    }
  };

  const runSitemapModule = async () => {
    if (!hostname || !rootDomain) return;
    const sitemapUrl = `https://${hostname}/sitemap.xml`;
    const safeFetch = await fetchWithSsrfGuard(sitemapUrl, {}, {
      timeoutMs: 10000,
      maxRedirects: 5,
      maxResponseBytes: 300000,
    });
    const res = safeFetch.response;
    if (!res.ok) {
      await insertObservation({
        module: "sitemap",
        observation_type: "sitemap",
        title: "Sitemap unavailable",
        value: { exists: false, status: res.status, urls: [] },
      });
      return;
    }
    const body = await res.text();
    const urls = [...body.matchAll(/<loc>([^<]+)<\/loc>/gi)].map((match) => match[1].trim());

    await insertObservation({
      module: "sitemap",
      observation_type: "sitemap",
      title: "Sitemap analyzed",
      value: { exists: true, status: res.status, urls_count: urls.length, urls: urls.slice(0, 300) },
    });

    for (const discoveredUrl of urls.slice(0, 200)) {
      try {
        const parsed = new URL(discoveredUrl);
        if (parsed.hostname.endsWith(rootDomain)) {
          await insertAsset({
            asset_type: "url",
            asset_value: discoveredUrl,
            hostname: parsed.hostname,
            root_domain: rootDomain,
            source: "sitemap",
          });
        }
      } catch {
        // ignore invalid url entries
      }
    }
  };

  const runRedirectModule = async () => {
    const inputUrl = (await fetchPrimaryHttpSnapshot()).requestUrl;
    let current = inputUrl;
    const chain: Array<{
      url: string;
      status: number;
      location?: string;
      protocol: "http" | "https";
      host: string;
    }> = [];
    const visited = new Set<string>();
    let hasLoop = false;

    for (let i = 0; i < 10; i++) {
      if (visited.has(current)) {
        hasLoop = true;
        break;
      }
      visited.add(current);

      const safeFetch = await fetchWithSsrfGuard(current, { redirect: "manual" }, {
        timeoutMs: 10000,
        maxRedirects: 0,
        maxResponseBytes: 200000,
      });
      const res = safeFetch.response;
      const location = res.headers.get("location") || undefined;
      const currentUrl = new URL(safeFetch.finalUrl || current);
      chain.push({
        url: safeFetch.finalUrl || current,
        status: res.status,
        location,
        protocol: currentUrl.protocol === "https:" ? "https" : "http",
        host: currentUrl.hostname.toLowerCase(),
      });

      if (!location || !(res.status >= 300 && res.status < 400)) break;
      const nextUrl = new URL(location, current).toString();
      if (visited.has(nextUrl)) {
        hasLoop = true;
        break;
      }
      current = nextUrl;
    }

    const finalUrl = chain.length > 0 ? chain[chain.length - 1].url : inputUrl;
    const redirectsToHttps = finalUrl.startsWith("https://");
    const mixedProtocol = chain.some((hop, index) => index > 0 && hop.protocol === "http");
    const externalRedirects = rootDomain
      ? chain.filter((hop) => !(hop.host === rootDomain || hop.host.endsWith(`.${rootDomain}`)))
      : [];

    const normalized = {
      inputUrl,
      finalUrl,
      chain,
      redirectsToHttps,
      hasLoop,
      hopCount: chain.length,
    };

    await insertObservation({
      module: "redirect_chain",
      observation_type: "redirect_chain",
      title: "Redirect chain collected",
      value: normalized,
    });
    await insertObservation({
      module: "redirects",
      observation_type: "redirects_summary",
      title: "HTTP redirect behavior",
      value: normalized,
    });

    if (hasLoop) {
      await insertFinding({
        module: "redirects",
        finding_type: "redirect_loop_detected",
        severity: "high",
        title: "Redirect loop detected",
        affected_url: inputUrl,
      });
    }

    if (chain.length > 5) {
      await insertFinding({
        module: "redirects",
        finding_type: "redirect_chain_too_long",
        severity: "low",
        title: "Redirect chain longer than 5 hops",
        description: `Catena redirect con ${chain.length} hop.`,
        affected_url: inputUrl,
      });
    }

    const first = chain[0];
    if (first?.protocol === "http" && !redirectsToHttps) {
      await insertFinding({
        module: "redirects",
        finding_type: "no_http_to_https_redirect",
        severity: "medium",
        title: "HTTP does not redirect to HTTPS",
        affected_url: first.url,
      });
    }

    if (mixedProtocol) {
      await insertFinding({
        module: "redirects",
        finding_type: "redirect_mixed_http",
        severity: "low",
        title: "Mixed protocol redirect chain",
        affected_url: inputUrl,
      });
    }

    for (const hop of externalRedirects.slice(0, 10)) {
      await insertFinding({
        module: "redirects",
        finding_type: "redirect_external_domain",
        severity: "medium",
        title: "Redirect to external domain",
        affected_url: hop.url,
        evidence: hop as unknown as Record<string, unknown>,
      });
    }
  };

  const toIsoDate = (value: unknown): string | null => {
    const raw = String(value || "").trim();
    if (!raw) return null;
    const parsed = Date.parse(raw);
    if (!Number.isFinite(parsed)) return null;
    return new Date(parsed).toISOString();
  };

  const daysUntil = (isoDate: string | null): number | null => {
    if (!isoDate) return null;
    const parsed = Date.parse(isoDate);
    if (!Number.isFinite(parsed)) return null;
    return Math.round((parsed - Date.now()) / 86400000);
  };

  const collectNestedObjectsByKey = (value: unknown, keyName: string): Record<string, unknown>[] => {
    const out: Record<string, unknown>[] = [];
    const walk = (node: unknown) => {
      if (!node || typeof node !== "object") return;
      const record = node as Record<string, unknown>;
      if (record[keyName] && typeof record[keyName] === "object") {
        out.push(record[keyName] as Record<string, unknown>);
      }
      for (const child of Object.values(record)) {
        if (Array.isArray(child)) {
          for (const item of child) walk(item);
        } else if (child && typeof child === "object") {
          walk(child);
        }
      }
    };
    walk(value);
    return out;
  };

  const runSslCertificateModule = async () => {
    const hostForCert = hostname || rootDomain || parsedTarget.hostname || "";
    if (!hostForCert) {
      await insertObservation({
        module: "ssl_certificate",
        observation_type: "ssl_certificate_skipped",
        title: "SSL certificate check skipped",
        value: { reason: "missing_hostname" },
        severity: "info",
      });
      return;
    }

    const result: Record<string, unknown> = {
      hostname: hostForCert,
      source: "https-fetch-basic",
      trusted: null,
      ssl_labs_enabled: isFeatureEnabled("SURFACESCAN_ENABLE_SSL_LABS", false),
    };

    let certPayload: Record<string, unknown> | null = null;
    for (const entry of shodanHostPayloads) {
      const directCandidates = collectNestedObjectsByKey(entry.payload, "ssl");
      for (const sslCandidate of directCandidates) {
        if (sslCandidate?.cert && typeof sslCandidate.cert === "object") {
          certPayload = sslCandidate.cert as Record<string, unknown>;
          result.source = "shodan";
          break;
        }
      }
      if (certPayload) break;
    }

    if (certPayload) {
      const subjectRaw = certPayload?.subject;
      const issuerRaw = certPayload?.issuer;
      const sanRaw =
        certPayload?.["subject_alt_names"] ||
        certPayload?.["subjectAltName"] ||
        certPayload?.["san"] ||
        certPayload?.["alt_names"];
      const subject = typeof subjectRaw === "string"
        ? subjectRaw
        : String((subjectRaw as any)?.CN || (subjectRaw as any)?.common_name || "").trim() || null;
      const issuer = typeof issuerRaw === "string"
        ? issuerRaw
        : String((issuerRaw as any)?.CN || (issuerRaw as any)?.common_name || "").trim() || null;
      const validFrom = toIsoDate(
        certPayload?.["issued"] || certPayload?.["not_before"] || certPayload?.["valid_from"],
      );
      const validTo = toIsoDate(
        certPayload?.["expires"] || certPayload?.["not_after"] || certPayload?.["valid_to"],
      );
      const expiresInDays = daysUntil(validTo);
      const san = Array.isArray(sanRaw)
        ? sanRaw.map((entry) => String(entry || "").trim()).filter(Boolean)
        : String(sanRaw || "")
          .split(/,\s*/)
          .map((entry) => entry.trim())
          .filter(Boolean);
      const signature = String(certPayload?.["sig_alg"] || certPayload?.["signature_algorithm"] || "").trim();
      const fingerprintObject =
        certPayload?.["fingerprint"] && typeof certPayload["fingerprint"] === "object"
          ? certPayload["fingerprint"] as Record<string, unknown>
          : {};
      const fingerprintSha256 = String(
        fingerprintObject["sha256"] || certPayload?.["fingerprint_sha256"] || "",
      ).trim();
      const fingerprintSha1 = String(
        fingerprintObject["sha1"] || certPayload?.["fingerprint_sha1"] || "",
      ).trim();
      const serialNumber = String(certPayload?.["serial"] || certPayload?.["serial_number"] || "").trim();
      const trustedValue = certPayload?.["trusted"];
      const trusted = typeof trustedValue === "boolean" ? trustedValue : null;
      const isSelfSigned = Boolean(subject && issuer && subject.toLowerCase() === issuer.toLowerCase());
      const isExpired = expiresInDays !== null ? expiresInDays < 0 : false;

      result.subject = subject;
      result.issuer = issuer;
      result.validFrom = validFrom;
      result.validTo = validTo;
      result.expiresInDays = expiresInDays;
      result.serialNumber = serialNumber || null;
      result.fingerprintSha256 = fingerprintSha256 || null;
      result.fingerprintSha1 = fingerprintSha1 || null;
      result.san = san;
      result.signatureAlgorithm = signature || null;
      result.trusted = trusted;
      result.isExpired = isExpired;
      result.isSelfSigned = isSelfSigned;
      result.raw = certPayload;

      // Wildcard certificate detection
      const wildcardSans = san
        .map(e => e.replace(/^DNS:/i, "").trim())
        .filter(e => e.startsWith("*."));
      const isWildcard = wildcardSans.length > 0 || Boolean(subject?.startsWith("*."));
      result.isWildcard = isWildcard;
      if (isWildcard) {
        await insertFinding({
          module: "ssl_certificate",
          finding_type: "ssl_wildcard_certificate",
          severity: "info",
          title: "Certificato wildcard rilevato",
          description: `Certificato con copertura wildcard: ${wildcardSans.join(", ") || subject}. Verificare che emissione e gestione chiavi siano controllate.`,
          affected_asset: hostForCert,
          cwe: ["CWE-295"],
          evidence: { is_wildcard: true, wildcard_domains: wildcardSans, subject, issuer },
          remediation: "Usare wildcard solo se necessario. Proteggere la chiave privata con HSM. Monitorare via Certificate Transparency.",
        });
      }

      const hasHostnameMatch = san.length > 0
        ? san.some((entry) => {
          const candidate = entry.replace(/^DNS:/i, "").toLowerCase();
          return candidate === hostForCert.toLowerCase() || candidate === `*.${rootDomain?.toLowerCase() || ""}` ||
            (candidate.startsWith("*.") && hostForCert.toLowerCase().endsWith(candidate.slice(1)));
        })
        : Boolean(subject && hostForCert.toLowerCase().includes(subject.toLowerCase()));

      if (isExpired) {
        await insertFinding({
          module: "ssl_certificate",
          finding_type: "ssl_certificate_expired",
          severity: "critical",
          title: "SSL certificate expired",
          affected_asset: hostForCert,
          remediation: "Rinnovare immediatamente il certificato TLS e verificare deployment su tutti i virtual host.",
        });
      } else if (expiresInDays !== null && expiresInDays < 15) {
        await insertFinding({
          module: "ssl_certificate",
          finding_type: "ssl_certificate_expiring_15d",
          severity: "high",
          title: "SSL certificate expires in less than 15 days",
          affected_asset: hostForCert,
          remediation: "Avviare rinnovo urgente del certificato e verificare catena/intermediates.",
        });
      } else if (expiresInDays !== null && expiresInDays < 30) {
        await insertFinding({
          module: "ssl_certificate",
          finding_type: "ssl_certificate_expiring_30d",
          severity: "medium",
          title: "SSL certificate expires in less than 30 days",
          affected_asset: hostForCert,
          remediation: "Pianificare rinnovo certificato entro 30 giorni.",
        });
      }

      if (isSelfSigned) {
        await insertFinding({
          module: "ssl_certificate",
          finding_type: "ssl_certificate_self_signed",
          severity: "high",
          title: "Self-signed certificate detected",
          affected_asset: hostForCert,
          remediation: "Usare certificato emesso da CA trusted pubblica o interna gestita.",
        });
      }
      if (trusted === false) {
        await insertFinding({
          module: "ssl_certificate",
          finding_type: "ssl_certificate_untrusted_chain",
          severity: "high",
          title: "SSL certificate chain not trusted",
          affected_asset: hostForCert,
          remediation: "Verificare chain completa, intermediate CA e trust store.",
        });
      }
      if (!hasHostnameMatch) {
        await insertFinding({
          module: "ssl_certificate",
          finding_type: "ssl_hostname_mismatch",
          severity: "high",
          title: "Certificate hostname mismatch",
          affected_asset: hostForCert,
          remediation: "Allineare CN/SAN del certificato al dominio servito.",
        });
      }
      if (san.length === 0) {
        await insertFinding({
          module: "ssl_certificate",
          finding_type: "ssl_missing_san",
          severity: "medium",
          title: "Certificate missing SAN entries",
          affected_asset: hostForCert,
        });
      }
      if (/sha1|md5/i.test(signature)) {
        await insertFinding({
          module: "ssl_certificate",
          finding_type: "ssl_weak_signature_algorithm",
          severity: "high",
          title: "Weak certificate signature algorithm",
          affected_asset: hostForCert,
          evidence: { signature_algorithm: signature },
          remediation: "Rigenerare certificato con algoritmo moderno (SHA-256 o superiore).",
        });
      }
    } else {
      try {
        const httpsTarget = hostForCert.includes(":") ? `https://[${hostForCert}]/` : `https://${hostForCert}/`;
        const safeFetch = await fetchWithSsrfGuard(httpsTarget, {}, {
          timeoutMs: 10000,
          maxRedirects: 10,
          maxResponseBytes: 250000,
        });
        const res = safeFetch.response;
        result.source = "https-fetch-basic";
        result.trusted = res.ok;
        result.finalUrl = safeFetch.finalUrl || res.url || httpsTarget;
        result.statusCode = res.status;
      } catch (error: any) {
        result.source = "https-fetch-basic";
        result.trusted = false;
        result.error = error?.message || "HTTPS fetch failed";
      }
    }

    await insertObservation({
      module: "ssl_certificate",
      observation_type: "ssl_certificate_summary",
      title: "SSL certificate summary",
      value: result,
    });
  };

  const runTlsSummaryModule = async () => {
    const hostForTls = hostname || rootDomain || parsedTarget.hostname || "";
    if (!hostForTls) return;

    const result: Record<string, unknown> = {
      hostname: hostForTls,
      source: "https-fetch-basic",
    };

    let weakProtocolDetected = false;
    let weakCiphers: string[] = [];
    let selectedProtocol: string | null = null;
    let selectedCipher: string | null = null;
    let tls12Supported: boolean | null = null;
    let tls13Supported: boolean | null = null;
    let tls10Supported: boolean | null = null;
    let tls11Supported: boolean | null = null;
    let http2Alpn: boolean | null = null;

    for (const row of shodanHostPayloads) {
      const payload = row.payload as Record<string, unknown>;
      const sslObjects = collectNestedObjectsByKey(payload, "ssl");
      for (const sslObject of sslObjects) {
        const versions = Array.isArray((sslObject as any)?.versions)
          ? ((sslObject as any).versions as unknown[]).map((entry) => String(entry || "").toLowerCase())
          : [];
        if (versions.length === 0) continue;
        result.source = "shodan";
        tls13Supported = versions.some((entry) => entry.includes("tlsv1.3"));
        tls12Supported = versions.some((entry) => entry.includes("tlsv1.2"));
        tls11Supported = versions.some((entry) => entry.includes("tlsv1.1"));
        tls10Supported = versions.some((entry) => entry.includes("tlsv1") && !entry.includes("1.1") && !entry.includes("1.2") && !entry.includes("1.3"));
        weakProtocolDetected = Boolean(tls10Supported || tls11Supported);
        selectedCipher = String((sslObject as any)?.cipher?.name || "").trim() || null;
        selectedProtocol = String((sslObject as any)?.versions?.[0] || "").trim() || null;
        const weak = Array.isArray((sslObject as any)?.cipher?.weak)
          ? ((sslObject as any).cipher.weak as unknown[]).map((entry) => String(entry || "").trim()).filter(Boolean)
          : [];
        weakCiphers = [...new Set([...weakCiphers, ...weak])];
      }
    }

    if (latestHttpSnapshot) {
      const altSvc = latestHttpSnapshot.headers["alt-svc"] || "";
      http2Alpn = latestHttpSnapshot.finalUrl.startsWith("https://")
        ? /h2/i.test(altSvc) || Boolean(latestHttpSnapshot.headers[":protocol"] === "h2")
        : false;
      if (result.source === "https-fetch-basic") {
        tls12Supported = latestHttpSnapshot.finalUrl.startsWith("https://");
        tls13Supported = null;
      }
    }

    result.tls13Supported = tls13Supported;
    result.tls12Supported = tls12Supported;
    result.tls10Supported = tls10Supported;
    result.tls11Supported = tls11Supported;
    result.http2Alpn = http2Alpn;
    result.selectedProtocol = selectedProtocol;
    result.selectedCipher = selectedCipher;
    result.weakCiphers = weakCiphers;

    await insertObservation({
      module: "tls_summary",
      observation_type: "tls_summary",
      title: "TLS summary",
      value: result,
    });

    if (tls10Supported || tls11Supported) {
      await insertFinding({
        module: "tls_summary",
        finding_type: "tls_legacy_protocols_enabled",
        severity: "high",
        title: "Legacy TLS protocols enabled (TLS 1.0/1.1)",
        affected_asset: hostForTls,
        remediation: "Disabilitare TLS 1.0/1.1 e mantenere TLS 1.2+.",
      });
    }
    if (tls12Supported === false) {
      await insertFinding({
        module: "tls_summary",
        finding_type: "tls12_not_supported",
        severity: "high",
        title: "TLS 1.2 not supported",
        affected_asset: hostForTls,
      });
    }
    if (weakCiphers.length > 0 || weakProtocolDetected) {
      await insertFinding({
        module: "tls_summary",
        finding_type: "tls_weak_cipher_detected",
        severity: "medium",
        title: "Weak TLS ciphers/protocols detected",
        affected_asset: hostForTls,
        evidence: { weak_ciphers: weakCiphers },
      });
    }
  };

  const runServerInfoModule = async () => {
    const hostForInfo = hostname || rootDomain || parsedTarget.hostname || "";
    const scopedIps = [...discoveredIps].filter((ip) => isIpAllowedInScope(ip));
    const primaryIp = scopedIps[0] || "";
    const serverInfo: Record<string, unknown> = {
      hostname: hostForInfo || null,
      ip: primaryIp || null,
      source: "fallback",
      ports: [],
      technologies: [],
    };

    let shodanPorts: number[] = [];
    let shodanTech: string[] = [];
    for (const entry of shodanHostPayloads) {
      const payload = entry.payload as Record<string, unknown>;
      const ports = Array.isArray(payload?.ports)
        ? payload.ports.map((value: unknown) => Number(value)).filter((value: number) => Number.isFinite(value))
        : [];
      const tags = Array.isArray(payload?.tags)
        ? payload.tags.map((value: unknown) => String(value || "").trim()).filter(Boolean)
        : [];
      const cpes = Array.isArray(payload?.cpes)
        ? payload.cpes.map((value: unknown) => String(value || "").trim()).filter(Boolean)
        : [];
      shodanPorts = [...new Set([...shodanPorts, ...ports])];
      shodanTech = [...new Set([...shodanTech, ...tags, ...cpes])];
      const org = String(payload?.org || payload?.isp || "").trim();
      const asn = String(payload?.asn || "").trim();
      if (org) serverInfo.organization = org;
      if (asn) serverInfo.asn = asn;
      serverInfo.source = "shodan";
      if (payload?.country_name || payload?.city || payload?.region_code || payload?.country_code) {
        serverInfo.location = {
          city: String(payload?.city || "").trim() || null,
          region: String(payload?.region_code || "").trim() || null,
          country: String(payload?.country_name || "").trim() || null,
          countryCode: String(payload?.country_code || "").trim() || null,
        };
      }
    }

    for (const port of shodanPorts) {
      await insertAsset({
        asset_type: "open_port",
        asset_value: `${primaryIp || hostForInfo}:${port}`,
        hostname: hostForInfo || null,
        root_domain: rootDomain,
        ip: primaryIp || null,
        source: "server_info",
        confidence: "low",
      });
    }

    serverInfo.ports = shodanPorts.slice(0, 100);
    serverInfo.technologies = shodanTech.slice(0, 100);
    if (!serverInfo.organization && latestHttpSnapshot) {
      serverInfo.serverHeader = latestHttpSnapshot.headers["server"] || null;
      serverInfo.poweredBy = latestHttpSnapshot.headers["x-powered-by"] || null;
      serverInfo.source = "http_headers";
    }

    await insertObservation({
      module: "server_info",
      observation_type: "server_info",
      title: "Server information summary",
      value: serverInfo,
    });

    if (String(serverInfo.serverHeader || "").trim().match(/[a-z0-9._-]+\/\d/i)) {
      await insertFinding({
        module: "server_info",
        finding_type: "server_header_version_exposed",
        severity: "low",
        title: "Server version exposed in HTTP header",
        affected_asset: hostForInfo || primaryIp || null,
      });
    }
  };

  const runServerLocationModule = async () => {
    const primaryShodan = shodanHostPayloads[0];
    const primaryIp = primaryShodan?.ip || [...discoveredIps].find((ip) => isIpAllowedInScope(ip)) || null;
    if (!primaryIp) return;

    const payload = (primaryShodan?.payload || {}) as Record<string, unknown>;
    const location = {
      ip: primaryIp,
      city: String(payload?.city || "").trim() || null,
      region: String(payload?.region_code || payload?.region_name || "").trim() || null,
      country: String(payload?.country_name || "").trim() || null,
      countryCode: String(payload?.country_code || "").trim() || null,
      latitude: typeof payload?.latitude === "number" ? payload.latitude : null,
      longitude: typeof payload?.longitude === "number" ? payload.longitude : null,
      timezone: String(payload?.timezone || "").trim() || null,
      languages: Array.isArray(payload?.languages)
        ? payload.languages.map((entry: unknown) => String(entry || "").trim()).filter(Boolean)
        : [],
      currency: String(payload?.currency || "").trim() || null,
      approximate: true,
      source: primaryShodan ? "shodan" : "fallback",
    };

    await insertObservation({
      module: "server_location",
      observation_type: "server_location",
      title: "Approximate server location",
      value: location,
    });
  };

  const runIpGeoAndAsnModule = async () => {
    const startedAt = Date.now();
    const scopedIps = [...discoveredIps]
      .filter((ip) => isIpAllowedInScope(ip))
      .slice(0, 25);
    if (scopedIps.length === 0) {
      await emitEngineEnvelope({
        engine: "ip_geo_asn",
        target: hostname || rootDomain || job.normalized_target,
        status: "skipped",
        durationMs: 0,
        summary: { reason: "no_in_scope_ips" },
      });
      return;
    }

    const geoSummaries: Array<Record<string, unknown>> = [];
    const asnSummaries: Array<Record<string, unknown>> = [];
    let failedLookups = 0;

    for (const ip of scopedIps) {
      let ipApiFallbackUsed = false;
      try {
        const geoRes = await fetchWithTimeout(`https://ipwho.is/${encodeURIComponent(ip)}`, {
          headers: { accept: "application/json" },
        }, 10000);
        if (geoRes.ok) {
          const geoPayload = await geoRes.json().catch(() => ({}));
          const success = Boolean((geoPayload as any)?.success !== false);
          const geo = {
            ip,
            success,
            country: String((geoPayload as any)?.country || "").trim() || null,
            region: String((geoPayload as any)?.region || "").trim() || null,
            city: String((geoPayload as any)?.city || "").trim() || null,
            latitude: typeof (geoPayload as any)?.latitude === "number" ? (geoPayload as any).latitude : null,
            longitude: typeof (geoPayload as any)?.longitude === "number" ? (geoPayload as any).longitude : null,
            timezone: String((geoPayload as any)?.timezone?.id || "").trim() || null,
            isp: String((geoPayload as any)?.connection?.isp || "").trim() || null,
            org: String((geoPayload as any)?.connection?.org || "").trim() || null,
            asn: String((geoPayload as any)?.connection?.asn || "").trim() || null,
            is_proxy: Boolean((geoPayload as any)?.security?.proxy),
            is_hosting: Boolean((geoPayload as any)?.security?.hosting),
            is_tor: Boolean((geoPayload as any)?.security?.tor),
          };
          if (!geo.country && !geo.org && !geo.asn) {
            throw new Error("ipwhois_payload_missing_core_fields");
          }
          geoSummaries.push(geo);
          if (geo.asn) {
            await insertAsset({
              asset_type: "asn",
              asset_value: geo.asn,
              hostname: hostname || rootDomain || null,
              root_domain: rootDomain,
              ip,
              source: "ip_geo_asn",
              confidence: "medium",
              raw: { org: geo.org, isp: geo.isp },
            });
          }
          if (geo.is_proxy || geo.is_tor) {
            await insertFinding({
              module: "ip_geo_asn",
              finding_type: geo.is_tor ? "ip_tor_exit_node" : "ip_proxy_reputation_flag",
              severity: geo.is_tor ? "high" : "medium",
              title: geo.is_tor ? "IP detected as Tor exit node" : "IP reputation indicates proxy usage",
              affected_asset: hostname || rootDomain || ip,
              ip,
              evidence: geo,
              remediation: "Verificare se l'IP è atteso nel deployment. Applicare allowlist/segregazione e monitoraggio attivo.",
            });
          }
        }
      } catch {
        // Fallback engine aligned with WIP spec (best-effort, non-blocking).
        try {
          const ipApiRes = await fetchWithTimeout(
            `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,country,countryCode,regionName,city,lat,lon,timezone,isp,org,as,asname,mobile,proxy,hosting,query`,
            { headers: { accept: "application/json" } },
            10000,
          );
          if (ipApiRes.ok) {
            const ipApiPayload = await ipApiRes.json().catch(() => ({}));
            if (String((ipApiPayload as any)?.status || "").toLowerCase() === "success") {
              ipApiFallbackUsed = true;
              const geo = {
                ip,
                success: true,
                country: String((ipApiPayload as any)?.country || "").trim() || null,
                region: String((ipApiPayload as any)?.regionName || "").trim() || null,
                city: String((ipApiPayload as any)?.city || "").trim() || null,
                latitude: typeof (ipApiPayload as any)?.lat === "number" ? (ipApiPayload as any).lat : null,
                longitude: typeof (ipApiPayload as any)?.lon === "number" ? (ipApiPayload as any).lon : null,
                timezone: String((ipApiPayload as any)?.timezone || "").trim() || null,
                isp: String((ipApiPayload as any)?.isp || "").trim() || null,
                org: String((ipApiPayload as any)?.org || "").trim() || null,
                asn: String((ipApiPayload as any)?.as || "").trim() || null,
                is_proxy: Boolean((ipApiPayload as any)?.proxy),
                is_hosting: Boolean((ipApiPayload as any)?.hosting),
                is_tor: false,
                source: "ip-api-fallback",
              };
              geoSummaries.push(geo);
              if (geo.asn) {
                await insertAsset({
                  asset_type: "asn",
                  asset_value: geo.asn,
                  hostname: hostname || rootDomain || null,
                  root_domain: rootDomain,
                  ip,
                  source: "ip_geo_asn",
                  confidence: "medium",
                  raw: { org: geo.org, isp: geo.isp, source: geo.source },
                });
              }
              if (geo.is_proxy) {
                await insertFinding({
                  module: "ip_geo_asn",
                  finding_type: "ip_proxy_reputation_flag",
                  severity: "medium",
                  title: "IP reputation indicates proxy usage",
                  affected_asset: hostname || rootDomain || ip,
                  ip,
                  evidence: geo,
                  remediation: "Verificare se l'IP è atteso nel deployment. Applicare allowlist/segregazione e monitoraggio attivo.",
                });
              }
            }
          }
        } catch {
          // no-op, counted below
        }
        if (!ipApiFallbackUsed) {
          failedLookups += 1;
        }
      }

      try {
        const bgpRes = await fetchWithTimeout(`https://api.bgpview.io/ip/${encodeURIComponent(ip)}`, {
          headers: { accept: "application/json" },
        }, 10000);
        if (!bgpRes.ok) continue;
        const bgpPayload = await bgpRes.json().catch(() => ({}));
        const data = ((bgpPayload as any)?.data || {}) as Record<string, unknown>;
        const asnObj = ((data as any)?.prefixes || [])[0]?.asn || (data as any)?.asn || null;
        const asnNumber = String((asnObj as any)?.asn || "").trim();
        const asnName = String((asnObj as any)?.name || "").trim();
        const prefix = String(((data as any)?.prefixes || [])[0]?.prefix || "").trim();
        const summary = {
          ip,
          asn: asnNumber ? `AS${asnNumber}` : null,
          asn_name: asnName || null,
          prefix: prefix || null,
        };
        asnSummaries.push(summary);
        if (summary.asn) {
          await insertAsset({
            asset_type: "asn",
            asset_value: summary.asn,
            hostname: hostname || rootDomain || null,
            root_domain: rootDomain,
            ip,
            source: "bgp_asn_lookup",
            confidence: "high",
            raw: { asn_name: summary.asn_name, prefix: summary.prefix },
          });
        }
        if (summary.prefix) {
          await insertAsset({
            asset_type: "netblock",
            asset_value: summary.prefix,
            hostname: hostname || rootDomain || null,
            root_domain: rootDomain,
            ip,
            source: "bgp_asn_lookup",
            confidence: "medium",
            raw: { asn: summary.asn, asn_name: summary.asn_name },
          });
        }
      } catch {
        failedLookups += 1;
      }
    }

    await insertObservation({
      module: "ip_geo_asn",
      observation_type: "ip_geo_asn_summary",
      title: "IP geolocation, reputation and ASN summary",
      value: {
        checked_ips: scopedIps,
        geo: geoSummaries,
        asn: asnSummaries,
        failed_lookups: failedLookups,
      },
      severity: failedLookups > 0 ? "low" : "info",
    });

    await insertExternalIntel(
      "ip_geo_asn",
      hostname || rootDomain || job.normalized_target,
      geoSummaries.length > 0 || asnSummaries.length > 0,
      {
        ips_checked: scopedIps.length,
        geo_records: geoSummaries.length,
        asn_records: asnSummaries.length,
        failed_lookups: failedLookups,
      },
      {
        geo: geoSummaries,
        asn: asnSummaries,
      },
      failedLookups > 0 ? "medium" : "high",
    );

    await emitEngineEnvelope({
      engine: "ip_geo_asn",
      target: hostname || rootDomain || job.normalized_target,
      status: failedLookups > 0 ? "partial" : "success",
      durationMs: Date.now() - startedAt,
      summary: {
        ips_checked: scopedIps.length,
        failed_lookups: failedLookups,
      },
    });
  };

  const runCveIntelModule = async () => {
    const startedAt = Date.now();
    const cveFindingRes = await adminClient
      .from("surface_findings" as any)
      .select("cve")
      .eq("scan_job_id", job.id)
      .not("cve", "is", null)
      .limit(2000);
    const cveSet = new Set<string>();
    for (const row of (cveFindingRes.data || []) as Array<Record<string, unknown>>) {
      const cveList = asStringArray(row?.cve);
      for (const cve of cveList) {
        const normalized = cve.trim().toUpperCase();
        if (/^CVE-\d{4}-\d{4,7}$/.test(normalized)) cveSet.add(normalized);
      }
    }
    const cves = [...cveSet].slice(0, 60);
    if (cves.length === 0) {
      await emitEngineEnvelope({
        engine: "cve_intel",
        target: hostname || rootDomain || job.normalized_target,
        status: "skipped",
        durationMs: 0,
        summary: { reason: "no_cves_in_findings" },
      });
      return;
    }

    const intelRows: Array<Record<string, unknown>> = [];
    let failed = 0;
    for (const cve of cves) {
      try {
        let enriched = false;

        // ── Primary: MITRE CVE AWG (CVE 5.0 format, CVSSv3.1, CWE IDs, affected products) ──
        try {
          const mitreRes = await fetchWithTimeout(
            `https://cveawg.mitre.org/api/cve/${encodeURIComponent(cve)}`,
            { headers: { accept: "application/json", "user-agent": "SurfaceScan360/1.0" } },
            10_000,
          );
          if (mitreRes.ok) {
            const mitreData = await mitreRes.json().catch(() => null);
            if (mitreData?.cveMetadata?.cveId) {
              const cna = mitreData.containers?.cna;
              const metrics = (cna?.metrics as any[] | undefined) || [];
              let cvss: number | null = null;
              let cvss_vector: string | null = null;
              let cvss_version = "";
              for (const m of metrics) {
                const v31 = m.cvssV3_1 || m.cvssV3_0 || m.cvssV31;
                if (v31) { cvss = v31.baseScore ?? null; cvss_vector = v31.vectorString ?? null; cvss_version = "3.1"; break; }
                const v2 = m.cvssV2_0 || m.cvssV2;
                if (v2) { cvss = v2.baseScore ?? null; cvss_vector = v2.vectorString ?? null; cvss_version = "2.0"; break; }
              }
              const problemTypes = (cna?.problemTypes as any[] | undefined) || [];
              const cweId = problemTypes[0]?.descriptions?.[0]?.cweId
                || problemTypes[0]?.descriptions?.[0]?.description
                || null;
              const affected = ((cna?.affected as any[] | undefined) || []).slice(0, 5).map((a: any) => ({
                vendor: a.vendor || "Unknown",
                product: a.product || "Unknown",
                versions: ((a.versions as any[] | undefined) || []).slice(0, 3).map((v: any) => v.version).filter(Boolean),
              }));
              const description = ((cna?.descriptions as any[] | undefined) || []).find((d: any) => d.lang === "en")?.value
                || (cna?.descriptions as any[])?.[0]?.value || "";
              const summary = {
                cve,
                cvss,
                cvss_vector,
                cvss_version,
                cwe: cweId,
                published: mitreData.cveMetadata?.datePublished || null,
                modified: mitreData.cveMetadata?.dateUpdated || null,
                references_count: ((cna?.references as any[] | undefined) || []).length,
                summary: description.slice(0, 800),
                affected: affected.slice(0, 5),
                source: "mitre",
              };
              intelRows.push(summary);
              await insertExternalIntel("cve_intel_mitre", cve, true, summary, mitreData as Record<string, unknown>, "high");
              enriched = true;
            }
          }
        } catch { /* fall through to CIRCL */ }

        if (enriched) continue;

        // ── Fallback: CIRCL CVE API ──────────────────────────────────────────────────────
        const cveRes = await fetchWithTimeout(`https://cve.circl.lu/api/cve/${encodeURIComponent(cve)}`, {
          headers: { accept: "application/json" },
        }, 10_000);
        if (!cveRes.ok) {
          failed += 1;
          continue;
        }
        const payload = await cveRes.json().catch(() => ({}));
        const summary = {
          cve,
          cvss: Number((payload as any)?.cvss || 0) || null,
          cvss_version: "2.0",
          cwe: String((payload as any)?.cwe || "").trim() || null,
          published: String((payload as any)?.Published || "").trim() || null,
          modified: String((payload as any)?.Modified || "").trim() || null,
          references_count: Array.isArray((payload as any)?.references) ? (payload as any).references.length : 0,
          summary: String((payload as any)?.summary || "").trim().slice(0, 800),
          source: "circl",
        };
        intelRows.push(summary);
        await insertExternalIntel("cve_intel_circl", cve, true, summary, payload as Record<string, unknown>, "high");
      } catch {
        failed += 1;
      }
    }

    await insertObservation({
      module: "cve_intel",
      observation_type: "cve_intel_summary",
      title: "CVE intelligence enrichment summary",
      value: {
        total_cves: cves.length,
        enriched_cves: intelRows.length,
        failed_cves: failed,
        sample: intelRows.slice(0, 30),
      },
      severity: failed > 0 ? "low" : "info",
    });

    await emitEngineEnvelope({
      engine: "cve_intel",
      target: hostname || rootDomain || job.normalized_target,
      status: failed > 0 ? "partial" : "success",
      durationMs: Date.now() - startedAt,
      summary: {
        total_cves: cves.length,
        enriched_cves: intelRows.length,
        failed_cves: failed,
      },
    });
  };

  const runTechStackModule = async () => {
    for (const entry of shodanHostPayloads) {
      const payload = entry.payload as Record<string, unknown>;
      const cpes = Array.isArray(payload?.cpes) ? payload.cpes : [];
      for (const cpe of cpes.slice(0, 100)) {
        const rawCpe = String(cpe || "").trim();
        if (!rawCpe) continue;
        const parts = rawCpe.split(":");
        const product = parts.length >= 5 ? parts[4] : rawCpe;
        const version = parts.length >= 6 ? parts[5] : "";
        const name = product.replace(/[_-]+/g, " ").trim();
        addTechFingerprint(name, {
          categories: ["service", "fingerprint"],
          version: version || undefined,
          confidence: 70,
          source: "shodan_cpe",
        });
      }
    }

    const technologies = [...techFingerprintMap.values()]
      .sort((a, b) => (b.confidence || 0) - (a.confidence || 0))
      .slice(0, 200)
      .map((entry) => ({
        name: entry.name,
        categories: entry.categories,
        version: entry.version || null,
        confidence: entry.confidence || null,
        source: entry.source,
      }));

    await insertObservation({
      module: "tech_stack",
      observation_type: "tech_stack",
      title: "Technology stack fingerprint",
      value: {
        technologies,
        count: technologies.length,
      },
    });

    for (const tech of technologies.slice(0, 50)) {
      if (tech.version) {
        await insertFinding({
          module: "tech_stack",
          finding_type: "technology_version_exposed",
          severity: "low",
          title: `${tech.name} version exposed`,
          description: `Versione rilevata: ${tech.version}.`,
          affected_asset: hostname || rootDomain || null,
          evidence: {
            technology: tech.name,
            version: tech.version,
            source: tech.source,
          },
          remediation: "Limitare disclosure di versione e mantenere piano di patching continuo.",
        });
      }
    }
  };

  const runQualityModule = async () => {
    if (!hostname) return;
    const googleApiKey = Deno.env.get("GOOGLE_CLOUD_API_KEY") || Deno.env.get("GOOGLE_API_KEY");
    if (!googleApiKey) {
      await insertObservation({
        module: "quality",
        observation_type: "module_skipped",
        title: "Quality module skipped",
        value: {
          reason: "missing_google_cloud_api_key",
        },
        severity: "info",
      });
      return;
    }

    const strategies: Array<"mobile" | "desktop"> = ["mobile"];
    if (job.scan_profile === "cve_api_validation") {
      strategies.push("desktop");
    }

    const toPercent = (value: unknown): number | null => {
      const score = Number(value);
      if (!Number.isFinite(score)) return null;
      if (score > 1) return Math.max(0, Math.min(100, Math.round(score)));
      return Math.max(0, Math.min(100, Math.round(score * 100)));
    };

    const summaries: Array<Record<string, unknown>> = [];
    const allFailedAudits: Array<Record<string, unknown>> = [];
    for (const strategy of strategies) {
      const endpoint = new URL("https://www.googleapis.com/pagespeedonline/v5/runPagespeed");
      endpoint.searchParams.set("url", targetUrl);
      endpoint.searchParams.set("strategy", strategy);
      endpoint.searchParams.append("category", "PERFORMANCE");
      endpoint.searchParams.append("category", "ACCESSIBILITY");
      endpoint.searchParams.append("category", "BEST_PRACTICES");
      endpoint.searchParams.append("category", "SEO");
      endpoint.searchParams.set("key", googleApiKey);

      const response = await fetchWithTimeout(endpoint.toString(), {}, 30000);
      if (!response.ok) {
        await insertObservation({
          module: "quality",
          observation_type: "pagespeed_error",
          title: "PageSpeed request failed",
          value: {
            status: response.status,
            target: targetUrl,
            strategy,
          },
          severity: "low",
        });
        continue;
      }

      const payload = await response.json().catch(() => ({}));
      const categories = payload?.lighthouseResult?.categories || {};
      const quality = {
        performance: toPercent(categories?.performance?.score),
        accessibility: toPercent(categories?.accessibility?.score),
        best_practices: toPercent(categories?.["best-practices"]?.score),
        seo: toPercent(categories?.seo?.score),
      };
      const audits = payload?.lighthouseResult?.audits || {};
      const failedAudits = Object.entries(audits)
        .filter(([, value]: any) => typeof value?.score === "number" && value.score < 0.5)
        .slice(0, 30)
        .map(([id, value]: any) => ({
          id,
          title: value?.title || id,
          score: value?.score,
          scoreDisplayMode: value?.scoreDisplayMode || null,
          description: String(value?.description || "").slice(0, 500),
          strategy,
        }));
      allFailedAudits.push(...failedAudits);
      summaries.push({
        strategy,
        categories: quality,
        failed_audits: failedAudits.slice(0, 10),
      });

      await insertObservation({
        module: "quality",
        observation_type: `quality_summary_${strategy}`,
        title: `Quality summary (PageSpeed ${strategy})`,
        value: {
          url: targetUrl,
          strategy,
          categories: quality,
          failed_audits: failedAudits.slice(0, 10),
          source: "pagespeed-insights",
        },
      });
    }

    const primary = summaries.find((entry) => entry.strategy === "mobile") || summaries[0];
    if (!primary) return;
    const primaryCategories = (primary.categories as Record<string, number | null>) || {};
    const criticalAuditIds = ["is-on-https", "mixed-content", "no-vulnerable-libraries"];

    await insertObservation({
      module: "quality",
      observation_type: "quality_summary",
      title: "Quality summary (PageSpeed)",
      value: {
        url: targetUrl,
        strategy: "mobile",
        categories: primaryCategories,
        failed_audits: allFailedAudits.slice(0, 20),
        by_strategy: summaries,
        source: "pagespeed-insights",
      },
    });

    const performance = Number(primaryCategories.performance);
    const bestPractices = Number(primaryCategories.best_practices);
    const accessibility = Number(primaryCategories.accessibility);
    const seo = Number(primaryCategories.seo);

    if (Number.isFinite(performance) && performance < 50) {
      await insertFinding({
        module: "quality",
        finding_type: "quality_performance_low",
        severity: "medium",
        title: "Performance score below 50",
        affected_url: targetUrl,
        description: `Performance score attuale: ${performance}/100.`,
        remediation: "Ottimizzare performance lato frontend/backend (TTFB, caching, payload statici).",
      });
    }
    if (Number.isFinite(bestPractices) && bestPractices < 70) {
      await insertFinding({
        module: "quality",
        finding_type: "quality_best_practices_low",
        severity: "medium",
        title: "Best Practices score below 70",
        affected_url: targetUrl,
      });
    }
    if (Number.isFinite(accessibility) && accessibility < 70) {
      await insertFinding({
        module: "quality",
        finding_type: "quality_accessibility_low",
        severity: accessibility < 50 ? "medium" : "low",
        title: "Accessibility score below 70",
        affected_url: targetUrl,
      });
    }
    if (Number.isFinite(seo) && seo < 70) {
      await insertFinding({
        module: "quality",
        finding_type: "quality_seo_low",
        severity: "low",
        title: "SEO score below 70",
        affected_url: targetUrl,
      });
    }

    for (const auditId of criticalAuditIds) {
      const match = allFailedAudits.find((entry) => String(entry.id || "").toLowerCase() === auditId);
      if (!match) continue;
      const severity = auditId === "mixed-content" || auditId === "is-on-https" ? "high" : "high";
      await insertFinding({
        module: "quality",
        finding_type: `quality_audit_${auditId.replace(/[^a-z0-9]+/gi, "_").toLowerCase()}`,
        severity,
        title: `Audit failed: ${String(match.title || auditId)}`,
        description: String(match.description || "").slice(0, 400),
        affected_url: targetUrl,
      });
    }
  };

  const runThreatsModule = async () => {
    if (!hostname) return;
    const targetUrlCandidate = targetUrl;
    const googleApiKey = Deno.env.get("GOOGLE_CLOUD_API_KEY") || Deno.env.get("GOOGLE_API_KEY");
    const phishTankEnabled = isFeatureEnabled("SURFACESCAN_ENABLE_PHISHTANK", false);
    let safeBrowsingMatches: any[] = [];

    if (googleApiKey) {
      try {
        const safeBrowsingRes = await fetchWithTimeout(
          `https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${encodeURIComponent(googleApiKey)}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              client: { clientId: "surfacescan360", clientVersion: "1.0" },
              threatInfo: {
                threatTypes: [
                  "MALWARE",
                  "SOCIAL_ENGINEERING",
                  "UNWANTED_SOFTWARE",
                  "POTENTIALLY_HARMFUL_APPLICATION",
                ],
                platformTypes: ["ANY_PLATFORM"],
                threatEntryTypes: ["URL"],
                threatEntries: [{ url: targetUrlCandidate }],
              },
            }),
          },
          12000,
        );

        if (!safeBrowsingRes.ok) {
          safeBrowsingMatches = [];
          await insertObservation({
            module: "threats",
            observation_type: "safe_browsing_api_error",
            title: "Safe Browsing API error",
            value: { status: safeBrowsingRes.status, configured: true },
            severity: "info",
          });
        } else {
          const safePayload = await safeBrowsingRes.json().catch(() => ({}));
          safeBrowsingMatches = Array.isArray(safePayload?.matches) ? safePayload.matches : [];
        }
      } catch {
        safeBrowsingMatches = [];
      }
    }

    let urlHausListed = false;
    let urlHausSummary: Record<string, unknown> = {};
    try {
      const form = new URLSearchParams();
      form.set("host", hostname);
      const urlHausRes = await fetchWithTimeout("https://urlhaus-api.abuse.ch/v1/host/", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: form.toString(),
      }, 12000);
      if (!urlHausRes.ok) {
        urlHausSummary = { query_status: `http_${urlHausRes.status}` };
      } else {
        const urlHausPayload = await urlHausRes.json().catch(() => ({}));
        const urls = Array.isArray(urlHausPayload?.urls) ? urlHausPayload.urls : [];
        const queryStatus = String(urlHausPayload?.query_status || "").toLowerCase();
        urlHausListed = queryStatus === "ok" && urls.length > 0;
        urlHausSummary = {
          query_status: queryStatus || "unknown",
          listed_urls: urls.slice(0, 20),
        };
      }
    } catch {
      urlHausSummary = { query_status: "error" };
    }

    const phishTankKey = Deno.env.get("PHISHTANK_API_KEY") || "";
    let phishTank: {
      inDatabase: boolean;
      valid: boolean;
      verified: boolean;
      source: string;
      details?: Record<string, unknown>;
    } | null = null;
    if (phishTankEnabled) {
      try {
        const form = new URLSearchParams();
        form.set("url", targetUrlCandidate);
        form.set("format", "xml");
        if (phishTankKey) form.set("app_key", phishTankKey);
        const phishRes = await fetchWithTimeout("https://checkurl.phishtank.com/checkurl/", {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": "SurfaceScan360/1.0 (+https://hicompliance.it)",
          },
          body: form.toString(),
        }, 12000);
        const xml = await phishRes.text();
        const inDatabase = /<in_database>\s*true\s*<\/in_database>/i.test(xml);
        const valid = /<valid>\s*true\s*<\/valid>/i.test(xml);
        const verified = /<verified>\s*true\s*<\/verified>/i.test(xml);
        phishTank = {
          inDatabase,
          valid,
          verified,
          source: "phishtank",
          details: {
            status: phishRes.status,
          },
        };
      } catch {
        phishTank = null;
      }
    }

    let torExitMatches: string[] = [];
    try {
      const ipv4Candidates = [...discoveredIps]
        .map((entry) => String(entry || "").trim())
        .filter((entry) => /^\d{1,3}(\.\d{1,3}){3}$/.test(entry))
        .slice(0, 80);
      if (ipv4Candidates.length > 0) {
        const torRes = await fetchWithTimeout("https://check.torproject.org/torbulkexitlist", {
          headers: { accept: "text/plain" },
        }, 10000);
        if (torRes.ok) {
          const torList = await torRes.text();
          const lines = new Set(
            torList
              .split("\n")
              .map((line) => line.trim())
              .filter(Boolean),
          );
          torExitMatches = ipv4Candidates.filter((ip) => lines.has(ip));
        }
      }
    } catch {
      torExitMatches = [];
    }

    const normalizeIocType = (value: string): "domain" | "ip" | "url" => {
      if (value.includes("://")) return "url";
      if (/^\d{1,3}(\.\d{1,3}){3}$/.test(value) || value.includes(":")) return "ip";
      return "domain";
    };
    const normalizeIocValue = (value: string, type: "domain" | "ip" | "url"): string => {
      const raw = String(value || "").trim().toLowerCase();
      if (!raw) return "";
      if (type === "domain") return raw.replace(/\.$/, "");
      if (type === "ip") return raw;
      try {
        const parsed = new URL(raw);
        parsed.hash = "";
        parsed.search = "";
        return parsed.toString().toLowerCase();
      } catch {
        return raw;
      }
    };
    const toIocSeverity = (value: unknown, confidence: number): "info" | "low" | "medium" | "high" | "critical" => {
      const normalized = toSeverity(String(value || "info"));
      if (normalized !== "info") return normalized;
      if (confidence >= 95) return "critical";
      if (confidence >= 90) return "high";
      if (confidence >= 70) return "medium";
      if (confidence >= 50) return "low";
      return "info";
    };
    const iocMatchForTarget = (
      type: "domain" | "ip" | "url",
      iocValue: string,
      context: {
        hostCandidates: string[];
        urlCandidates: string[];
        ipCandidates: string[];
      },
    ): boolean => {
      if (type === "ip") {
        return context.ipCandidates.some((entry) => entry === iocValue);
      }
      if (type === "domain") {
        return context.hostCandidates.some((entry) => entry === iocValue || entry.endsWith(`.${iocValue}`));
      }
      return context.urlCandidates.some((entry) => entry === iocValue || entry.startsWith(iocValue));
    };

    const iocContext = {
      hostCandidates: [
        hostname.toLowerCase(),
        String(rootDomain || "").trim().toLowerCase(),
        ...[...discoveredHostnames].map((entry) => String(entry || "").trim().toLowerCase()),
      ].filter(Boolean),
      urlCandidates: [
        targetUrlCandidate.toLowerCase(),
      ].filter(Boolean),
      ipCandidates: [...discoveredIps]
        .map((entry) => String(entry || "").trim().toLowerCase())
        .filter((entry) => Boolean(entry) && isIpAllowedInScope(entry)),
    };

    const leaseOptions = new Set([30, 60, 120, 720, 1440]);
    let iocLeaseMinutes = 60;
    let iocFeedEnabled = true;
    let iocLastRefreshedAt: string | null = null;
    let iocRefreshStatus: "skipped" | "ok" | "failed" = "skipped";
    let iocRefreshInserted = 0;
    const matchedIocIndicators: Array<{
      ioc: string;
      type: "domain" | "ip" | "url";
      confidence?: number;
      severity?: "info" | "low" | "medium" | "high" | "critical";
      source?: string;
      notes?: string | null;
    }> = [];

    const tryLoadLegacyIocMatches = async () => {
      const legacyIndicators: typeof matchedIocIndicators = [];
      try {
        const { data: legacyRows } = await adminClient
          .from("surface_external_intel" as any)
          .select("provider, target, summary, raw_response")
          .eq("customer_id", customerId)
          .in("provider", ["intelguard_feed", "intelguard_threat_feed", "internal_threat_feed"])
          .order("created_at", { ascending: false })
          .limit(200);
        for (const row of (legacyRows || []) as Array<Record<string, unknown>>) {
          const provider = String(row?.provider || "").trim();
          const target = String(row?.target || "").trim().toLowerCase();
          const type = normalizeIocType(target);
          const ioc = normalizeIocValue(target, type);
          if (!ioc || !iocMatchForTarget(type, ioc, iocContext)) continue;
          const summary = (row?.summary as Record<string, unknown>) || {};
          const confidence = Number(summary?.confidence || summary?.score || 0);
          legacyIndicators.push({
            ioc,
            type,
            confidence: Number.isFinite(confidence) ? confidence : undefined,
            severity: toIocSeverity(summary?.severity, Number.isFinite(confidence) ? confidence : 0),
            source: provider || "curated_feed",
          });
        }
      } catch {
        // no-op fallback
      }
      return legacyIndicators;
    };

    try {
      const { data: configRow } = await adminClient
        .from("surface_scan_ioc_fresh_config" as any)
        .select("lease_minutes, is_enabled, last_refreshed_at")
        .eq("organization_id", organizationId)
        .maybeSingle();

      if (configRow) {
        const leaseCandidate = Number((configRow as any)?.lease_minutes || 60);
        iocLeaseMinutes = leaseOptions.has(leaseCandidate) ? leaseCandidate : 60;
        iocFeedEnabled = (configRow as any)?.is_enabled !== false;
        iocLastRefreshedAt = String((configRow as any)?.last_refreshed_at || "").trim() || null;
      }

      if (iocFeedEnabled) {
        const now = new Date();
        const leaseMs = iocLeaseMinutes * 60 * 1000;
        const needsRefresh = !iocLastRefreshedAt || (Date.parse(iocLastRefreshedAt) + leaseMs <= now.getTime());

        if (needsRefresh) {
          const refreshAtIso = now.toISOString();
          const refreshExpiresIso = new Date(now.getTime() + leaseMs).toISOString();
          const { data: curatedRows, error: curatedError } = await adminClient
            .from("surface_external_intel" as any)
            .select("provider, target, summary, created_at")
            .eq("customer_id", customerId)
            .in("provider", ["intelguard_feed", "intelguard_threat_feed", "internal_threat_feed"])
            .order("created_at", { ascending: false })
            .limit(800);

          if (!curatedError) {
            const curatedBatch: Array<Record<string, unknown>> = [];
            const seen = new Set<string>();
            for (const row of (curatedRows || []) as Array<Record<string, unknown>>) {
              const target = String(row?.target || "").trim().toLowerCase();
              if (!target) continue;
              const type = normalizeIocType(target);
              const normalized = normalizeIocValue(target, type);
              if (!normalized) continue;
              const key = `${type}|${normalized}`;
              if (seen.has(key)) continue;
              seen.add(key);
              const summary = (row?.summary as Record<string, unknown>) || {};
              const confidenceRaw = Number(summary?.confidence || summary?.score || 75);
              const confidence = Number.isFinite(confidenceRaw)
                ? Math.max(0, Math.min(100, Math.round(confidenceRaw)))
                : 75;
              const severity = toIocSeverity(summary?.severity, confidence);
              curatedBatch.push({
                organization_id: organizationId,
                ioc_value: normalized,
                ioc_type: type,
                source: "curated_feed",
                confidence,
                severity,
                notes: String(summary?.note || summary?.reason || "").trim() || null,
                is_active: true,
                synced_at: refreshAtIso,
                expires_at: refreshExpiresIso,
                created_by: options.initiatedByUserId || job.requested_by || null,
              });
            }

            await adminClient
              .from("surface_scan_ioc_fresh_items" as any)
              .delete()
              .eq("organization_id", organizationId)
              .eq("source", "curated_feed");

            if (curatedBatch.length > 0) {
              await adminClient
                .from("surface_scan_ioc_fresh_items" as any)
                .insert(curatedBatch);
            }

            await adminClient
              .from("surface_scan_ioc_fresh_config" as any)
              .upsert(
                {
                  organization_id: organizationId,
                  lease_minutes: iocLeaseMinutes,
                  is_enabled: iocFeedEnabled,
                  last_refreshed_at: refreshAtIso,
                  created_by: options.initiatedByUserId || job.requested_by || null,
                },
                { onConflict: "organization_id" },
              );

            iocLastRefreshedAt = refreshAtIso;
            iocRefreshInserted = curatedBatch.length;
            iocRefreshStatus = "ok";
            await logAudit("ioc_fresh_list_refreshed", {
              lease_minutes: iocLeaseMinutes,
              inserted: curatedBatch.length,
            });
          } else {
            iocRefreshStatus = "failed";
          }
        }

        const { data: activeIocRows } = await adminClient
          .from("surface_scan_ioc_fresh_items" as any)
          .select("ioc_value, ioc_type, source, confidence, severity, notes, is_active, expires_at")
          .eq("organization_id", organizationId)
          .eq("is_active", true)
          .order("updated_at", { ascending: false })
          .limit(1200);

        const nowTs = Date.now();
        for (const row of (activeIocRows || []) as Array<Record<string, unknown>>) {
          const source = String(row?.source || "manual").trim().toLowerCase();
          const expiresAt = String(row?.expires_at || "").trim();
          if (source === "curated_feed" && expiresAt) {
            const expiresTs = Date.parse(expiresAt);
            if (Number.isFinite(expiresTs) && expiresTs < nowTs) continue;
          }
          const typeRaw = String(row?.ioc_type || "domain").trim().toLowerCase();
          const type = (typeRaw === "ip" || typeRaw === "url") ? typeRaw : "domain";
          const ioc = normalizeIocValue(String(row?.ioc_value || ""), type);
          if (!ioc) continue;
          if (!iocMatchForTarget(type, ioc, iocContext)) continue;
          const confidence = Number(row?.confidence || 0);
          matchedIocIndicators.push({
            ioc,
            type,
            confidence: Number.isFinite(confidence) ? confidence : undefined,
            severity: toIocSeverity(row?.severity, Number.isFinite(confidence) ? confidence : 0),
            source: source || "manual",
            notes: String(row?.notes || "").trim() || null,
          });
        }
      }
    } catch {
      const fallback = await tryLoadLegacyIocMatches();
      matchedIocIndicators.push(...fallback);
      iocRefreshStatus = "failed";
      await insertObservation({
        module: "threats",
        observation_type: "ioc_feed_refresh_failed",
        title: "IOC Fresh feed refresh failed — using legacy fallback",
        value: { fallback_count: fallback.length },
        severity: "info",
      });
    }

    if (matchedIocIndicators.length === 0) {
      const fallback = await tryLoadLegacyIocMatches();
      matchedIocIndicators.push(...fallback);
    }

    const otxDomainTarget = String(rootDomain || hostname || "").trim().toLowerCase();
    const otxIpTargets = [...iocContext.ipCandidates].slice(0, 8);
    let otxDomainPulseCount = 0;
    let otxIpPulseCount = 0;
    const otxSignals: Array<Record<string, unknown>> = [];
    if (otxDomainTarget) {
      const pullOtx = async (url: string) => {
        const res = await fetchWithTimeout(url, { headers: { accept: "application/json" } }, 12000);
        if (!res.ok) return null;
        const payload = await res.json().catch(() => ({}));
        return payload && typeof payload === "object" ? (payload as Record<string, unknown>) : null;
      };

      try {
        const domainPayload = await pullOtx(
          `https://otx.alienvault.com/api/v1/indicators/domain/${encodeURIComponent(otxDomainTarget)}/general`,
        );
        if (domainPayload) {
          const pulseCount = Number((domainPayload as any)?.pulse_info?.count || 0);
          if (Number.isFinite(pulseCount) && pulseCount > 0) {
            otxDomainPulseCount = pulseCount;
            otxSignals.push({
              type: "domain",
              target: otxDomainTarget,
              pulse_count: pulseCount,
              reputation: Number((domainPayload as any)?.reputation || 0) || null,
            });
            await insertExternalIntel(
              "otx",
              otxDomainTarget,
              true,
              {
                pulse_count: pulseCount,
                reputation: Number((domainPayload as any)?.reputation || 0) || null,
              },
              domainPayload as Record<string, unknown>,
              pulseCount >= 10 ? "high" : pulseCount > 0 ? "medium" : "low",
            );
          }
        }
      } catch {
        // non-blocking by design
      }

      for (const ip of otxIpTargets) {
        if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) continue;
        try {
          const ipPayload = await pullOtx(
            `https://otx.alienvault.com/api/v1/indicators/IPv4/${encodeURIComponent(ip)}/general`,
          );
          if (!ipPayload) continue;
          const pulseCount = Number((ipPayload as any)?.pulse_info?.count || 0);
          if (!Number.isFinite(pulseCount) || pulseCount <= 0) continue;
          otxIpPulseCount += pulseCount;
          otxSignals.push({
            type: "ip",
            target: ip,
            pulse_count: pulseCount,
            reputation: Number((ipPayload as any)?.reputation || 0) || null,
            country: String((ipPayload as any)?.country_name || "").trim() || null,
            asn: String((ipPayload as any)?.asn || "").trim() || null,
          });
          await insertExternalIntel(
            "otx",
            ip,
            true,
            {
              pulse_count: pulseCount,
              reputation: Number((ipPayload as any)?.reputation || 0) || null,
            },
            ipPayload as Record<string, unknown>,
            pulseCount >= 10 ? "high" : pulseCount > 0 ? "medium" : "low",
          );
        } catch {
          // non-blocking by design
        }
      }
    }

    const internalHighConfidence = matchedIocIndicators.filter((entry) => (entry.confidence || 0) >= 90);
    const internalMediumConfidence = matchedIocIndicators.filter((entry) => (entry.confidence || 0) >= 70 && (entry.confidence || 0) < 90);

    const threatSignals = summarizeThreatSignals({
      safeBrowsingMatches,
      urlHausListed,
      phishTank: phishTank
        ? {
          inDatabase: phishTank.inDatabase,
          valid: phishTank.valid,
          verified: phishTank.verified,
        }
        : null,
    });
    const noThreatMatches =
      !threatSignals.has_threat_match &&
      matchedIocIndicators.length === 0;
    await insertObservation({
      module: "threats",
      observation_type: "threats_summary",
      title: "Threat intelligence summary",
      value: {
        target: targetUrlCandidate,
        safe_browsing: {
          configured: Boolean(googleApiKey),
          unsafe: safeBrowsingMatches.length > 0,
          matches: safeBrowsingMatches.slice(0, 20),
        },
        urlhaus: {
          listed: urlHausListed,
          ...urlHausSummary,
        },
        phishtank: phishTank
          ? {
            in_database: phishTank.inDatabase,
            valid: phishTank.valid,
            verified: phishTank.verified,
          }
          : {
            feature_enabled: phishTankEnabled,
            configured: Boolean(phishTankKey),
            checked: false,
          },
        ioc_fresh_list: {
          enabled: iocFeedEnabled,
          lease_minutes: iocLeaseMinutes,
          last_refreshed_at: iocLastRefreshedAt,
          refresh_status: iocRefreshStatus,
          refresh_inserted: iocRefreshInserted,
          matched: matchedIocIndicators.length > 0,
          matched_count: matchedIocIndicators.length,
          indicators: matchedIocIndicators.slice(0, 30),
        },
        intelguard: {
          matched: matchedIocIndicators.length > 0,
          indicators: matchedIocIndicators.slice(0, 30),
        },
        otx: {
          domain_target: otxDomainTarget || null,
          domain_pulse_count: otxDomainPulseCount,
          ip_pulse_count: otxIpPulseCount,
          total_pulse_count: otxDomainPulseCount + otxIpPulseCount,
          signals: otxSignals.slice(0, 40),
        },
        tor_exit_nodes: {
          checked: [...discoveredIps]
            .map((entry) => String(entry || "").trim())
            .filter((entry) => /^\d{1,3}(\.\d{1,3}){3}$/.test(entry)).length,
          listed_count: torExitMatches.length,
          listed_ips: torExitMatches.slice(0, 30),
        },
        no_threat_matches: noThreatMatches,
      },
    });

    if (safeBrowsingMatches.length > 0) {
      await insertFinding({
        module: "threats",
        finding_type: "safe_browsing_match",
        severity: "critical",
        title: "Google Safe Browsing flagged target",
        affected_asset: hostname,
        affected_url: targetUrlCandidate,
        evidence: { matches: safeBrowsingMatches.slice(0, 20) },
        remediation: "Bloccare temporaneamente il target a livello di fruizione pubblica e avviare verifica incident response.",
      });
    }

    if (urlHausListed) {
      await insertFinding({
        module: "threats",
        finding_type: "urlhaus_listed",
        severity: "high",
        title: "Target listed in URLHaus",
        affected_asset: hostname,
        evidence: urlHausSummary,
        remediation: "Verificare compromissione contenuti/redirect e ripristinare stato sicuro prima di ri-esporre il servizio.",
      });
    }

    if (phishTank?.inDatabase && (phishTank?.valid || phishTank?.verified)) {
      await insertFinding({
        module: "threats",
        finding_type: "phishtank_verified_match",
        severity: "critical",
        title: "Target flagged in PhishTank",
        affected_asset: hostname,
        affected_url: targetUrlCandidate,
        evidence: {
          in_database: phishTank.inDatabase,
          valid: phishTank.valid,
          verified: phishTank.verified,
        },
        remediation: "Bloccare target, avviare incident response e validare compromissione lato contenuti/DNS.",
      });
    }

    if (internalHighConfidence.length > 0) {
      await insertFinding({
        module: "threats",
        finding_type: "ioc_fresh_high_confidence_match",
        severity: "high",
        title: "High-confidence match in IOC Fresh List",
        affected_asset: hostname,
        affected_url: targetUrlCandidate,
        evidence: {
          indicators: internalHighConfidence.slice(0, 20),
        },
        remediation: "Eseguire triage IOC prioritario e validare esposizione effettiva su asset in scope.",
      });
    } else if (internalMediumConfidence.length > 0) {
      await insertFinding({
        module: "threats",
        finding_type: "ioc_fresh_medium_confidence_match",
        severity: "medium",
        title: "Medium-confidence match in IOC Fresh List",
        affected_asset: hostname,
        affected_url: targetUrlCandidate,
        evidence: {
          indicators: internalMediumConfidence.slice(0, 20),
        },
        remediation: "Validare IOC con controlli aggiuntivi (DNS, proxy, EDR) e confermare attribuzione.",
      });
    }

    if (otxDomainPulseCount + otxIpPulseCount > 0) {
      await insertFinding({
        module: "threats",
        finding_type: "otx_pulse_match",
        severity: otxDomainPulseCount + otxIpPulseCount >= 15 ? "high" : "medium",
        title: "OTX threat pulse correlation detected",
        affected_asset: hostname || rootDomain || null,
        affected_url: targetUrlCandidate,
        evidence: {
          domain_pulse_count: otxDomainPulseCount,
          ip_pulse_count: otxIpPulseCount,
          signals: otxSignals.slice(0, 30),
        },
        remediation: "Eseguire verifica IOC su asset esposti, validare exploitability e applicare containment dove necessario.",
      });
    }

    if (torExitMatches.length > 0) {
      await insertFinding({
        module: "threats",
        finding_type: "tor_exit_node_match",
        severity: "high",
        title: "In-scope IP detected in Tor exit node list",
        affected_asset: hostname || rootDomain || null,
        evidence: {
          tor_exit_ips: torExitMatches.slice(0, 30),
        },
        remediation: "Confermare se gli IP Tor sono attesi. In caso contrario applicare filtering, hardening servizi esposti e monitoraggio antifrode.",
      });
    }
  };

  const runDnsBlocklistsModule = async () => {
    const providers = ["zen.spamhaus.org", "bl.spamcop.net", "dnsbl.sorbs.net"];
    const maxIps = Number(Deno.env.get("SURFACESCAN_DNSBL_MAX_IPS") || "15");
    const ipv4Targets = [...discoveredIps]
      .map((entry) => String(entry || "").trim())
      .filter((entry) => /^\d{1,3}(\.\d{1,3}){3}$/.test(entry))
      .slice(0, maxIps);
    if (ipv4Targets.length === 0) {
      await insertObservation({
        module: "dns_blocklists",
        observation_type: "dnsbl_skipped",
        title: "DNS blocklist skipped",
        value: { reason: "no_ipv4_targets" },
        severity: "info",
      });
      return;
    }

    const checked: DnsBlocklistCheck[] = [];
    const resolveDnsWithEndpoint = async (queryName: string, endpoint: string): Promise<string[]> => {
      try {
        const separator = endpoint.includes("?") ? "&" : "?";
        const url = `${endpoint}${separator}name=${encodeURIComponent(queryName)}&type=A`;
        const response = await fetch(url, {
          headers: { accept: "application/dns-json" },
        });
        if (!response.ok) return [];
        const payload = await response.json();
        const answers = Array.isArray(payload?.Answer) ? payload.Answer : [];
        return answers
          .map((entry: any) => String(entry?.data || "").trim().replace(/\.$/, ""))
          .filter(Boolean);
      } catch {
        return [];
      }
    };
    const lookupTasks = ipv4Targets.flatMap((ip) =>
      providers.map((provider) => async () => {
        const reversed = ip.split(".").reverse().join(".");
        const queryName = `${reversed}.${provider}`;
        const answers = await resolveWithDnsOverHttps(queryName, "A");
        const secondaryAnswers = await resolveDnsWithEndpoint(queryName, "https://dns.google/resolve");
        const classifiedPrimary = classifyDnsBlocklistResponse(provider, answers);
        const classifiedSecondary = classifyDnsBlocklistResponse(provider, secondaryAnswers);
        const classified = mergeDnsblClassifications(provider, classifiedPrimary, classifiedSecondary);
        checked.push({
          provider,
          ip,
          listed: classified.listed,
          status: classified.status,
          records: answers.slice(0, 10),
          secondary_records: secondaryAnswers.slice(0, 10),
          reason: classified.reason,
        });
        if (classified.listed) {
          await insertFinding({
            module: "dns_blocklists",
            finding_type: "dnsbl_listed",
            severity: provider.includes("spamhaus") ? "high" : "medium",
            title: `IP listed in DNS blocklist (${provider})`,
            affected_asset: hostname || ip,
            ip,
            evidence: {
              provider,
              records: answers.slice(0, 10),
              secondary_records: secondaryAnswers.slice(0, 10),
              status: classified.status,
              reason: classified.reason || null,
            },
            remediation: "Verificare reputazione IP, abuso SMTP/malware e avviare delisting dopo remediation.",
          });
        }
      })
    );
    const DNSBL_CHUNK = 6;
    for (let i = 0; i < lookupTasks.length; i += DNSBL_CHUNK) {
      await Promise.allSettled(lookupTasks.slice(i, i + DNSBL_CHUNK).map((fn) => fn()));
    }

    for (const row of checked) {
      if (row.listed) continue;
      const listedTitle = `IP listed in DNS blocklist (${row.provider})`;
      await adminClient
        .from("surface_findings" as any)
        .update({
          status: "resolved",
          remediation: "Rilevazione aggiornata: IP non più listato nel controllo corrente.",
        })
        .eq("customer_id", job.customer_id)
        .eq("module", "dns_blocklists")
        .eq("finding_type", "dnsbl_listed")
        .eq("ip", row.ip)
        .eq("title", listedTitle)
        .in("status", ["new", "open", "validated", "investigating", "in_progress"]);
    }

    await insertObservation({
      module: "dns_blocklists",
      observation_type: "dnsbl_summary",
      title: "DNS blocklist summary",
      value: {
        checked,
        listed_count: checked.filter((entry) => entry.listed).length,
        lookup_blocked_count: checked.filter((entry) => entry.status === "lookup_blocked").length,
        lookup_error_count: checked.filter((entry) => entry.status === "lookup_error").length,
        not_listed: checked.every((entry) => !entry.listed),
      },
    });
  };

  const runOpenPortsModule = async () => {
    const allowCustomNodeTcp = isFeatureEnabled("SURFACESCAN_ENABLE_CUSTOM_NODE_TCP", false);
    const toProfile = (profile: string): "quick" | "full" | "deep" => {
      if (profile === "safe_recon") return "quick";
      if (profile === "domain_exposure" || profile === "ip_exposure") return "full";
      return "deep";
    };

    const { data: portAssets, error: portAssetsError } = await adminClient
      .from("surface_assets" as any)
      .select("asset_value, ip, hostname, source, raw")
      .eq("scan_job_id", job.id)
      .eq("asset_type", "open_port")
      .limit(2000);
    if (portAssetsError) {
      throw new Error(portAssetsError.message || "Unable to read open port assets");
    }

    const { data: cveFindings } = await adminClient
      .from("surface_findings" as any)
      .select("ip, port, cve")
      .eq("scan_job_id", job.id)
      .not("cve", "is", null)
      .limit(4000);

    const cveBySocket = new Map<string, string[]>();
    for (const row of (cveFindings || []) as Array<Record<string, unknown>>) {
      const ip = String(row?.ip || "").trim();
      const port = Number(row?.port || 0);
      const cves = Array.isArray(row?.cve)
        ? (row.cve as unknown[]).map((entry) => String(entry || "").trim()).filter(Boolean)
        : [];
      if (!ip || !port || cves.length === 0) continue;
      const key = `${ip}:${port}`;
      const existing = cveBySocket.get(key) || [];
      cveBySocket.set(key, [...new Set([...existing, ...cves])]);
    }

    const openPortMap = new Map<
      string,
      {
        target: string;
        ip: string;
        source: "shodan" | "cache" | "node-tcp";
        port: number;
        protocol: "tcp" | "udp";
        service?: string;
        product?: string;
        version?: string;
        banner?: string;
        confidence?: number;
        cves?: string[];
      }
    >();

    for (const asset of (portAssets || []) as Array<Record<string, unknown>>) {
      const assetValue = String(asset?.asset_value || "").trim();
      if (!assetValue.includes(":")) continue;
      const [hostPart, portPart] = assetValue.split(":");
      const parsedPort = Number(portPart);
      if (!Number.isFinite(parsedPort) || parsedPort <= 0) continue;
      const raw = (asset?.raw as Record<string, unknown>) || {};
      const protocolValue = String(raw?.protocol || "tcp").toLowerCase();
      const protocol = protocolValue === "udp" ? "udp" : "tcp";
      const ip = String(asset?.ip || hostPart || "").trim().toLowerCase();
      const target = String(asset?.hostname || hostname || rootDomain || ip || "").trim();
      const sourceRaw = String(asset?.source || "").toLowerCase();
      const source: "shodan" | "cache" | "node-tcp" = sourceRaw.includes("shodan")
          ? "shodan"
          : sourceRaw.includes("node")
            ? "node-tcp"
            : "cache";
      if (source === "node-tcp" && !allowCustomNodeTcp) continue;
      const key = `${ip}:${parsedPort}/${protocol}`;
      const service = String(raw?.service || raw?.service_name || "").trim() || undefined;
      const product = String(raw?.product || "").trim() || undefined;
      const version = String(raw?.version || raw?.service_version || "").trim() || undefined;
      const banner = String(raw?.banner || "").trim() || undefined;
      const confidenceRaw = Number(raw?.confidence || 0);
      const confidence = Number.isFinite(confidenceRaw) && confidenceRaw > 0 ? confidenceRaw : undefined;
      const socketCves = cveBySocket.get(`${ip}:${parsedPort}`) || [];

      if (!openPortMap.has(key)) {
        openPortMap.set(key, {
          target,
          ip,
          source,
          port: parsedPort,
          protocol,
          service,
          product,
          version,
          banner,
          confidence,
          cves: socketCves,
        });
        continue;
      }
      const existing = openPortMap.get(key)!;
      existing.service = existing.service || service;
      existing.product = existing.product || product;
      existing.version = existing.version || version;
      existing.banner = existing.banner || banner;
      existing.confidence = Math.max(existing.confidence || 0, confidence || 0) || undefined;
      existing.cves = [...new Set([...(existing.cves || []), ...socketCves])];
    }

    const openPorts = [...openPortMap.values()]
      .sort((a, b) => {
        const sevDiff = severityRank(severityForExposedPort(b.port)) - severityRank(severityForExposedPort(a.port));
        if (sevDiff !== 0) return sevDiff;
        return a.port - b.port;
      });

    const output = {
      target: hostname || rootDomain || parsedTarget.hostname || parsedTarget.normalized_target,
      ip: openPorts[0]?.ip || [...discoveredIps][0] || null,
      source: openPorts[0]?.source || "cache",
      openPorts,
      failedPorts: [],
      scanProfile: toProfile(job.scan_profile),
      scanStartedAt: job.started_at || null,
      scanCompletedAt: new Date().toISOString(),
      customNodeTcpEnabled: allowCustomNodeTcp,
    };

    await insertObservation({
      module: "open_ports",
      observation_type: "open_ports_summary",
      title: "Open ports and exposed services",
      value: output,
      severity: openPorts.length > 0 ? "low" : "info",
    });

    const criticalCount = openPorts.filter((entry) => severityForExposedPort(entry.port) === "critical").length;
    const highCount = openPorts.filter((entry) => severityForExposedPort(entry.port) === "high").length;
    if (criticalCount > 0) {
      await insertFinding({
        module: "open_ports",
        finding_type: "open_ports_critical_exposure",
        severity: "critical",
        title: "Critical exposed services detected",
        affected_asset: hostname || rootDomain || null,
        description: `${criticalCount} porte critiche esposte pubblicamente.`,
        evidence: {
          critical_ports: openPorts
            .filter((entry) => severityForExposedPort(entry.port) === "critical")
            .slice(0, 30),
        },
        remediation: "Isolare immediatamente i servizi critici da Internet e consentire accesso solo da reti autorizzate.",
      });
    } else if (highCount > 0) {
      await insertFinding({
        module: "open_ports",
        finding_type: "open_ports_high_exposure",
        severity: "high",
        title: "High-risk exposed services detected",
        affected_asset: hostname || rootDomain || null,
        description: `${highCount} porte ad alto rischio esposte pubblicamente.`,
        evidence: {
          high_ports: openPorts
            .filter((entry) => severityForExposedPort(entry.port) === "high")
            .slice(0, 30),
        },
        remediation: "Ridurre la superficie esposta con ACL/firewall, MFA e accesso tramite VPN/ZTNA.",
      });
    }
  };

  const runPassesModule = async () => {
    const getLatestFinding = async (moduleKey: string, findingTypes: string[]) => {
      const query = adminClient
        .from("surface_findings" as any)
        .select("id, severity, status")
        .eq("scan_job_id", job.id)
        .eq("module", moduleKey);
      const { data } = await query.in("finding_type", findingTypes).limit(10);
      return ((data || []) as Array<Record<string, unknown>>)
        .find((row) => !["resolved", "suppressed", "false_positive", "accepted_risk"].includes(String(row.status || "").toLowerCase())) || null;
    };
    const getLatestFindingAnyModule = async (moduleKeys: string[], findingTypes: string[]) => {
      const query = adminClient
        .from("surface_findings" as any)
        .select("id, severity, status")
        .eq("scan_job_id", job.id);
      const { data } = await query.in("module", moduleKeys).in("finding_type", findingTypes).limit(10);
      return ((data || []) as Array<Record<string, unknown>>)
        .find((row) => !["resolved", "suppressed", "false_positive", "accepted_risk"].includes(String(row.status || "").toLowerCase())) || null;
    };

    const qualityObservationRes = await adminClient
      .from("surface_observations" as any)
      .select("value")
      .eq("scan_job_id", job.id)
      .eq("module", "quality")
      .eq("observation_type", "quality_summary")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const qualityValue = qualityObservationRes.data?.value || {};
    const categories = qualityValue?.categories || {};
    const accessibilityScore = Number(categories?.accessibility);
    const seoScore = Number(categories?.seo);

    const whoisObservationRes = await adminClient
      .from("surface_observations" as any)
      .select("value")
      .eq("scan_job_id", job.id)
      .eq("module", "whois")
      .eq("observation_type", "whois_rdap")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const whoisValue = whoisObservationRes.data?.value || {};
    const daysToExpiry = Number(whoisValue?.days_to_expiry);

    const tlsObservationRes = await adminClient
      .from("surface_observations" as any)
      .select("value")
      .eq("scan_job_id", job.id)
      .eq("module", "tls_summary")
      .eq("observation_type", "tls_summary")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const tlsValue = tlsObservationRes.data?.value || {};
    const tls13Supported = Boolean(
      tlsValue?.tls13Supported === true || String(tlsValue?.selectedProtocol || "").toLowerCase().includes("1.3"),
    );
    const http2Alpn = Boolean(tlsValue?.http2Alpn === true);

    const dnsblObservationRes = await adminClient
      .from("surface_observations" as any)
      .select("value")
      .eq("scan_job_id", job.id)
      .eq("module", "dns_blocklists")
      .eq("observation_type", "dnsbl_summary")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const dnsblValue = dnsblObservationRes.data?.value || {};
    const listedCount = Number(dnsblValue?.listed_count);

    const redirectObservationRes = await adminClient
      .from("surface_observations" as any)
      .select("value")
      .eq("scan_job_id", job.id)
      .in("module", ["redirects", "redirect_chain"])
      .in("observation_type", ["redirects_summary", "redirect_chain"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const redirectValue = redirectObservationRes.data?.value || {};
    const redirectsToHttps = Boolean(redirectValue?.redirectsToHttps);

    const mailObservationRes = await adminClient
      .from("surface_observations" as any)
      .select("value")
      .eq("scan_job_id", job.id)
      .eq("module", "mail_security")
      .eq("observation_type", "mail_security_summary")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const mailValue = mailObservationRes.data?.value || {};
    const hasSpfRecord = Boolean(mailValue?.has_spf);

    const hasDnssecFinding = await getLatestFinding("dnssec", [
      "dnssec_missing",
      "dnssec_inconsistent_delegation",
    ]);
    const hasThreatFinding = await getLatestFinding("threats", [
      "safe_browsing_match",
      "urlhaus_listed",
      "phishtank_verified_match",
      "ioc_fresh_high_confidence_match",
      "ioc_fresh_medium_confidence_match",
      "intelguard_high_confidence_match",
      "intelguard_medium_confidence_match",
    ]);
    const hasBlocklistFinding = await getLatestFinding("dns_blocklists", ["dnsbl_listed"]);
    const hasSpfMissing = await getLatestFinding("mail_security", ["mail_spf_missing"]);
    const hasRedirectMissing = await getLatestFindingAnyModule(
      ["redirect_chain", "redirects"],
      ["no_http_to_https_redirect"],
    );
    const hasExpiredDomain = await getLatestFinding("whois", ["domain_expired"]);
    const hasSslInvalid = await getLatestFinding("ssl_certificate", [
      "ssl_certificate_expired",
      "ssl_certificate_self_signed",
      "ssl_certificate_untrusted_chain",
      "ssl_hostname_mismatch",
      "ssl_missing_san",
    ]);

    const passItems = [
      {
        key: "ssl_valid",
        label: "SSL certificate valid",
        passed: !hasSslInvalid,
        sourceModule: "ssl_certificate",
      },
      {
        key: "domain_registration_valid",
        label: "Domain registration is valid",
        passed: Number.isFinite(daysToExpiry) ? daysToExpiry > 0 : !hasExpiredDomain,
        value: Number.isFinite(daysToExpiry) ? daysToExpiry : null,
        sourceModule: "whois",
      },
      {
        key: "accessibility_score",
        label: "Accessibility score",
        passed: Number.isFinite(accessibilityScore) ? accessibilityScore >= 80 : false,
        value: Number.isFinite(accessibilityScore) ? accessibilityScore : null,
        sourceModule: "quality",
      },
      {
        key: "seo_score",
        label: "SEO score",
        passed: Number.isFinite(seoScore) ? seoScore >= 80 : false,
        value: Number.isFinite(seoScore) ? seoScore : null,
        sourceModule: "quality",
      },
      {
        key: "tls13_supported",
        label: "TLS 1.3 negotiated/supported",
        passed: tls13Supported,
        sourceModule: "tls_summary",
      },
      {
        key: "http2_alpn",
        label: "HTTP/2 via ALPN",
        passed: http2Alpn,
        sourceModule: "tls_summary",
      },
      { key: "dnssec_enabled", label: "DNSSEC enabled", passed: !hasDnssecFinding, sourceModule: "dnssec" },
      { key: "no_threat_matches", label: "No threat feed matches", passed: !hasThreatFinding, sourceModule: "threats" },
      {
        key: "spf_published",
        label: "SPF record published",
        passed: hasSpfRecord || !hasSpfMissing,
        sourceModule: "mail_security",
      },
      {
        key: "https_redirect",
        label: "HTTP requests are redirected to HTTPS",
        passed: redirectsToHttps || !hasRedirectMissing,
        sourceModule: "redirects",
      },
      {
        key: "not_on_dns_blocklists",
        label: "Not on tested DNS blocklists",
        passed: Number.isFinite(listedCount) ? listedCount === 0 : !hasBlocklistFinding,
        value: Number.isFinite(listedCount) ? listedCount : null,
        sourceModule: "dns_blocklists",
      },
    ];

    await insertObservation({
      module: "passes",
      observation_type: "passes_summary",
      title: "Passes summary",
      value: {
        passes: passItems,
        passedCount: passItems.filter((entry) => entry.passed).length,
        totalCount: passItems.length,
      },
    });
  };

  const runReverseAndDumpsterModule = async () => {
    if (discoveredIps.size > 0) {
      const ptrResults: Record<string, string[]> = {};
      const ptrSkippedByScope: string[] = [];
      for (const ip of discoveredIps) {
        if (!isIpAllowedInScope(ip)) {
          ptrSkippedByScope.push(ip);
          continue;
        }
        const reverseName = ip.includes(".")
          ? `${ip.split(".").reverse().join(".")}.in-addr.arpa`
          : buildIpv6PtrName(ip);
        if (!reverseName) continue;

        const ptr = await resolveWithDnsOverHttps(reverseName, "PTR");
        ptrResults[ip] = ptr;
        for (const ptrHost of ptr) {
          const normalizedPtr = ptrHost.trim().toLowerCase().replace(/\.$/, "");
          if (!isValidHostnameCandidate(normalizedPtr)) continue;
          const ptrClassification = classifyHostAgainstScope(normalizedPtr);
          if (ptrClassification.blocked) {
            await insertAsset({
              asset_type: "reverse_dns_hostname",
              asset_value: normalizedPtr,
              hostname: normalizedPtr,
              root_domain: rootDomain,
              source: "reverse_dns",
              confidence: "low",
              raw: {
                ip,
                _scope_excluded: true,
                _scope_exclusion_reason: ptrClassification.reason || "scope_excluded_domain",
                _scope_excluded_at: new Date().toISOString(),
              },
            });
            continue;
          }
          discoveredHostnames.add(normalizedPtr);
          await insertAsset({
            asset_type: "reverse_dns_hostname",
            asset_value: normalizedPtr,
            hostname: normalizedPtr,
            root_domain: rootDomain,
            source: "reverse_dns",
            confidence: "low",
            raw: { ip },
          });
        }
      }
      await insertObservation({
        module: "reverse_dns",
        observation_type: "reverse_dns",
        title: "Reverse DNS lookup",
        value: {
          results: ptrResults,
          skipped_out_of_scope_ips: ptrSkippedByScope,
        },
      });
    }

    if (rootDomain) {
      try {
        const crtRes = await fetchWithTimeout(
          `https://crt.sh/?q=%25.${encodeURIComponent(rootDomain)}&output=json`,
          {},
          15000,
        );
        if (crtRes.ok) {
          const payload = await crtRes.json();
          const rows = Array.isArray(payload) ? payload : [];
          const names = new Set<string>();
          const wildcardCertNames = new Set<string>();
          let resolvedSubdomains = 0;
          let unresolvedSubdomains = 0;

          for (const row of rows.slice(0, 500)) {
            const nameValue = String(row?.name_value || "").trim();
            if (!nameValue) continue;
            for (const candidate of nameValue.split("\n")) {
              const normalized = candidate.trim().toLowerCase().replace(/\.$/, "");
              if (!normalized.endsWith(rootDomain)) continue;
              if (normalized.startsWith("*.")) {
                wildcardCertNames.add(normalized);
              } else if (isValidHostnameCandidate(normalized)) {
                names.add(normalized);
              }
            }
          }

          for (const sub of [...names].slice(0, 200)) {
            if (!shouldAcceptScannableHost(sub)) {
              const exclusionReason = scopeReasonFromHost(sub) || "scope_excluded_domain";
              await insertAsset({
                asset_type: "subdomain",
                asset_value: sub,
                hostname: sub,
                root_domain: rootDomain,
                source: "certificate_transparency",
                confidence: "low",
                raw: {
                  _scope_excluded: true,
                  _scope_exclusion_reason: exclusionReason,
                  _scope_excluded_at: new Date().toISOString(),
                },
              });
              continue;
            }
            discoveredHostnames.add(sub);
            const [aRecords, aaaaRecords] = await Promise.all([
              resolveWithDnsOverHttps(sub, "A"),
              resolveWithDnsOverHttps(sub, "AAAA"),
            ]);
            const resolved = [...aRecords, ...aaaaRecords];
            if (resolved.length > 0) {
              resolvedSubdomains += 1;
            } else {
              unresolvedSubdomains += 1;
            }

            await insertAsset({
              asset_type: "subdomain",
              asset_value: sub,
              hostname: sub,
              root_domain: rootDomain,
              source: "certificate_transparency",
              confidence: resolved.length > 0 ? "high" : "low",
              raw: { resolved_ips: resolved.slice(0, 20) },
            });

            for (const ip of resolved.slice(0, 20)) {
              discoveredIps.add(ip);
              await insertAsset({
                asset_type: "ip",
                asset_value: ip,
                hostname: sub,
                root_domain: rootDomain,
                ip,
                source: "certificate_transparency_dns",
                confidence: "medium",
              });
            }
          }

          for (const wildcard of wildcardCertNames) {
            await insertFinding({
              module: "dns_certificate_transparency",
              finding_type: "ssl_wildcard_certificate",
              severity: "info",
              title: `Wildcard rilevato in Certificate Transparency: ${wildcard}`,
              description: `Il dominio wildcard ${wildcard} appare nei log pubblici di Certificate Transparency (crt.sh). Verificare che l'emissione sia autorizzata.`,
              affected_asset: wildcard,
              cwe: ["CWE-295"],
              evidence: { source: "crt.sh", wildcard_domain: wildcard },
              remediation: "Usare wildcard solo se necessario. Monitorare emissioni non autorizzate via CT alert.",
            });
          }

          await insertObservation({
            module: "dns_dumpster_like",
            observation_type: "subdomain_discovery",
            title: "Certificate transparency subdomain discovery",
            value: {
              root_domain: rootDomain,
              subdomains_found: names.size,
              wildcard_certs_found: wildcardCertNames.size,
              resolved_subdomains: resolvedSubdomains,
              unresolved_subdomains: unresolvedSubdomains,
              sample: [...names].slice(0, 50),
            },
          });
        }
      } catch {
        await insertObservation({
          module: "dns_dumpster_like",
          observation_type: "subdomain_discovery_error",
          title: "Subdomain discovery failed",
          value: { root_domain: rootDomain },
          severity: "low",
        });
      }

      const dnsDumpsterApiKey = String(Deno.env.get("DNSDUMPSTER_API_KEY") || "").trim();
      if (dnsDumpsterApiKey) {
        const dnsDumpsterStartedAt = Date.now();
        const dnsDumpUrl = `https://api.dnsdumpster.com/domain/${encodeURIComponent(rootDomain)}`;
        let dnsDumpStatus = "failed";
        let dnsDumpError: string | null = null;
        let dnsDumpSummary: Record<string, unknown> = {};
        try {
          const minDelayMs = 2000;
          const elapsedSinceLast = Date.now() - dnsDumpsterLastRequestAt;
          if (dnsDumpsterLastRequestAt > 0 && elapsedSinceLast < minDelayMs) {
            await waitMs(minDelayMs - elapsedSinceLast);
          }

          let dnsPayload: Record<string, unknown> | null = null;
          let httpStatus = 0;
          let attempts = 0;
          while (attempts < 3 && !dnsPayload) {
            attempts += 1;
            const response = await fetchWithTimeout(
              dnsDumpUrl,
              {
                headers: {
                  "X-API-Key": dnsDumpsterApiKey,
                  accept: "application/json",
                  "user-agent": "SurfaceScan360/1.0",
                },
              },
              10000,
            );
            dnsDumpsterLastRequestAt = Date.now();
            httpStatus = response.status;

            if (response.status === 429 && attempts < 3) {
              await waitMs(2000 * attempts);
              continue;
            }

            if (!response.ok) {
              dnsDumpError = `dnsdumpster_http_${response.status}`;
              break;
            }

            const parsed = await response.json().catch(() => ({}));
            dnsPayload = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
          }

          if (!dnsPayload) {
            dnsDumpStatus = "partial";
            dnsDumpSummary = {
              root_domain: rootDomain,
              status: "no_payload",
              http_status: httpStatus || null,
              attempts,
              reason: dnsDumpError || "dnsdumpster_unavailable",
            };
          } else {
            const hostSet = new Set<string>();
            const ipSet = new Set<string>();
            const mxSet = new Set<string>();
            const nsSet = new Set<string>();
            const txtRecords = new Set<string>();
            const asnSet = new Set<string>();
            const netblockSet = new Set<string>();
            const countrySet = new Set<string>();

            const inspectValue = (value: unknown, parentKey = "") => {
              if (value === null || value === undefined) return;
              if (typeof value === "string") {
                const candidate = value.trim();
                if (!candidate) return;
                if (candidate.includes(rootDomain) && isValidHostnameCandidate(candidate.replace(/\.$/, ""))) {
                  hostSet.add(candidate.replace(/\.$/, "").toLowerCase());
                }
                if (/^\d{1,3}(\.\d{1,3}){3}$/.test(candidate) || candidate.includes(":")) {
                  ipSet.add(candidate.toLowerCase());
                }
                if (parentKey.includes("asn")) asnSet.add(candidate.toUpperCase());
                if (parentKey.includes("net") || parentKey.includes("prefix")) netblockSet.add(candidate);
                if (parentKey.includes("country")) countrySet.add(candidate);
                if (parentKey.includes("txt")) txtRecords.add(candidate);
                return;
              }
              if (Array.isArray(value)) {
                for (const entry of value) inspectValue(entry, parentKey);
                return;
              }
              if (typeof value === "object") {
                const obj = value as Record<string, unknown>;
                const hostCandidate = String(
                  obj.host || obj.hostname || obj.domain || obj.subdomain || obj.name || obj.target || "",
                )
                  .trim()
                  .toLowerCase()
                  .replace(/\.$/, "");
                if (hostCandidate && hostCandidate.includes(rootDomain) && isValidHostnameCandidate(hostCandidate)) {
                  hostSet.add(hostCandidate);
                }
                const ipCandidate = String(obj.ip || obj.address || obj.ipv4 || obj.ipv6 || "").trim().toLowerCase();
                if (ipCandidate && (ipCandidate.includes(":") || /^\d{1,3}(\.\d{1,3}){3}$/.test(ipCandidate))) {
                  ipSet.add(ipCandidate);
                }
                const mxCandidate = String(obj.mx || "").trim().toLowerCase().replace(/\.$/, "");
                if (mxCandidate) mxSet.add(mxCandidate);
                const nsCandidate = String(obj.ns || obj.nameserver || "").trim().toLowerCase().replace(/\.$/, "");
                if (nsCandidate) nsSet.add(nsCandidate);
                const asnCandidate = String(obj.asn || "").trim();
                if (asnCandidate) asnSet.add(asnCandidate.toUpperCase());
                const netblockCandidate = String(obj.netblock || obj.prefix || "").trim();
                if (netblockCandidate) netblockSet.add(netblockCandidate);
                const countryCandidate = String(obj.country || "").trim();
                if (countryCandidate) countrySet.add(countryCandidate);
                const txtCandidate = String(obj.txt || "").trim();
                if (txtCandidate) txtRecords.add(txtCandidate);
                for (const [k, v] of Object.entries(obj)) inspectValue(v, k.toLowerCase());
              }
            };

            inspectValue(dnsPayload);

            for (const subdomain of Array.from(hostSet).slice(0, 250)) {
              if (!shouldAcceptScannableHost(subdomain)) {
                const exclusionReason = scopeReasonFromHost(subdomain) || "scope_excluded_domain";
                await insertAsset({
                  asset_type: "subdomain",
                  asset_value: subdomain,
                  hostname: subdomain,
                  root_domain: rootDomain,
                  source: "dnsdumpster",
                  confidence: "low",
                  raw: {
                    _scope_excluded: true,
                    _scope_exclusion_reason: exclusionReason,
                    _scope_excluded_at: new Date().toISOString(),
                  },
                });
                continue;
              }
              discoveredHostnames.add(subdomain);
              await insertAsset({
                asset_type: "subdomain",
                asset_value: subdomain,
                hostname: subdomain,
                root_domain: rootDomain,
                source: "dnsdumpster",
                confidence: "medium",
              });
            }

            for (const ip of Array.from(ipSet).slice(0, 250)) {
              discoveredIps.add(ip);
              await insertAsset({
                asset_type: "ip",
                asset_value: ip,
                hostname: hostname || rootDomain,
                root_domain: rootDomain,
                ip,
                source: "dnsdumpster",
                confidence: isIpAllowedInScope(ip) ? "medium" : "low",
                raw: {
                  in_scope: isIpAllowedInScope(ip),
                },
              });
            }

            for (const mx of Array.from(mxSet).slice(0, 100)) {
              await insertAsset({
                asset_type: "mx_host",
                asset_value: mx,
                hostname: mx,
                root_domain: rootDomain,
                source: "dnsdumpster",
                confidence: "medium",
              });
            }

            for (const ns of Array.from(nsSet).slice(0, 100)) {
              await insertAsset({
                asset_type: "ns_host",
                asset_value: ns,
                hostname: ns,
                root_domain: rootDomain,
                source: "dnsdumpster",
                confidence: "medium",
              });
            }

            dnsDumpStatus = "success";
            dnsDumpSummary = {
              root_domain: rootDomain,
              subdomains_found: hostSet.size,
              ip_found: ipSet.size,
              mx_found: mxSet.size,
              ns_found: nsSet.size,
              txt_found: txtRecords.size,
              asn_found: asnSet.size,
              netblocks_found: netblockSet.size,
              countries_found: countrySet.size,
            };

            await insertObservation({
              module: "dns_dumpster",
              observation_type: "dnsdumpster_summary",
              title: "DNSDumpster discovery summary",
              value: {
                ...dnsDumpSummary,
                sample_subdomains: Array.from(hostSet).slice(0, 80),
                sample_ips: Array.from(ipSet).slice(0, 80),
                sample_asn: Array.from(asnSet).slice(0, 40),
                sample_netblocks: Array.from(netblockSet).slice(0, 40),
                sample_countries: Array.from(countrySet).slice(0, 20),
                sample_txt: Array.from(txtRecords).slice(0, 80),
              },
              severity: "info",
            });

            await insertExternalIntel(
              "dnsdumpster",
              rootDomain,
              true,
              dnsDumpSummary,
              dnsPayload,
              hostSet.size > 0 || ipSet.size > 0 ? "high" : "medium",
            );
          }
        } catch (error: any) {
          dnsDumpStatus = "partial";
          dnsDumpError = error?.message || String(error);
          dnsDumpSummary = {
            root_domain: rootDomain,
            reason: dnsDumpError,
          };
          await insertObservation({
            module: "dns_dumpster",
            observation_type: "dnsdumpster_error",
            title: "DNSDumpster lookup failed",
            value: {
              root_domain: rootDomain,
              error: dnsDumpError,
            },
            severity: "low",
          });
        } finally {
          await emitEngineEnvelope({
            engine: "dnsdumpster",
            target: rootDomain,
            status: dnsDumpStatus as SurfaceEngineStatus,
            durationMs: Date.now() - dnsDumpsterStartedAt,
            error: dnsDumpError,
            summary: dnsDumpSummary,
          });
        }
      } else {
        await insertObservation({
          module: "dns_dumpster",
          observation_type: "dnsdumpster_skipped",
          title: "DNSDumpster skipped",
          value: {
            reason: "missing_api_key",
            root_domain: rootDomain,
          },
          severity: "info",
        });
        await emitEngineEnvelope({
          engine: "dnsdumpster",
          target: rootDomain,
          status: "skipped",
          durationMs: 0,
          summary: { reason: "missing_api_key" },
        });
      }
    }
  };

  const runAmassModule = async () => {
    const serviceUrl = String(Deno.env.get("SURFACESCAN_AMASS_SERVICE_URL") || "").trim();
    const sharedSecret = String(Deno.env.get("SURFACESCAN_AMASS_SHARED_SECRET") || "").trim();
    const timeoutSeconds = Math.max(
      10,
      Math.min(120, Number(Deno.env.get("SURFACESCAN_AMASS_TIMEOUT_SECONDS") || "45")),
    );
    const maxNames = Math.max(
      1,
      Math.min(500, Number(Deno.env.get("SURFACESCAN_AMASS_MAX_NAMES") || "250")),
    );

    const amassResult = await runAmassDiscovery({
      serviceUrl,
      sharedSecret,
      target: hostname || rootDomain || targetUrl,
      rootDomain,
      scanJobId: job.id,
      timeoutSeconds,
      maxNames,
    });

    let acceptedSubdomains = 0;
    let excludedSubdomains = 0;
    let acceptedIps = 0;
    let excludedIps = 0;

    for (const subdomain of amassResult.subdomains) {
      if (!shouldAcceptScannableHost(subdomain)) {
        excludedSubdomains += 1;
        await insertAsset({
          asset_type: "subdomain",
          asset_value: subdomain,
          hostname: subdomain,
          root_domain: rootDomain,
          source: "amass",
          confidence: "low",
          raw: {
            mode: "active_light",
            amass_version: amassResult.amass_version,
            _scope_excluded: true,
            _scope_exclusion_reason: scopeReasonFromHost(subdomain) || "scope_excluded_domain",
            _scope_excluded_at: new Date().toISOString(),
          },
        });
        continue;
      }
      acceptedSubdomains += 1;
      discoveredHostnames.add(subdomain);
      await insertAsset({
        asset_type: "subdomain",
        asset_value: subdomain,
        hostname: subdomain,
        root_domain: rootDomain,
        source: "amass",
        confidence: "medium",
        raw: {
          mode: "active_light",
          amass_version: amassResult.amass_version,
        },
      });
    }

    for (const ip of amassResult.ips) {
      const inScope = isIpAllowedInScope(ip);
      if (!inScope) {
        excludedIps += 1;
      } else {
        acceptedIps += 1;
        discoveredIps.add(ip);
      }
      await insertAsset({
        asset_type: "ip",
        asset_value: ip,
        hostname: hostname || rootDomain,
        root_domain: rootDomain,
        ip,
        source: "amass",
        confidence: inScope ? "medium" : "low",
        raw: {
          mode: "active_light",
          amass_version: amassResult.amass_version,
          in_scope: inScope,
        },
      });
    }

    const summary = {
      root_domain: rootDomain,
      target: hostname || rootDomain || targetUrl,
      mode: "active_light",
      subdomains_found: amassResult.subdomains.length,
      subdomains_accepted: acceptedSubdomains,
      subdomains_excluded: excludedSubdomains,
      ips_found: amassResult.ips.length,
      ips_accepted: acceptedIps,
      ips_excluded: excludedIps,
      warnings: amassResult.warnings,
      duration_ms: amassResult.duration_ms,
      amass_version: amassResult.amass_version,
      sample_subdomains: amassResult.subdomains.slice(0, 80),
      sample_ips: amassResult.ips.slice(0, 80),
    };

    await insertObservation({
      module: "amass_discovery",
      observation_type: "amass_summary",
      title: "Amass active-light discovery summary",
      value: summary,
      severity: "info",
      confidence: acceptedSubdomains > 0 || acceptedIps > 0 ? "high" : "medium",
    });

    await insertExternalIntel(
      "amass",
      rootDomain || hostname || targetUrl,
      amassResult.subdomains.length > 0 || amassResult.ips.length > 0,
      summary,
      amassResult.raw,
      acceptedSubdomains > 0 || acceptedIps > 0 ? "high" : "medium",
    );

    await emitEngineEnvelope({
      engine: "amass",
      target: rootDomain || hostname || targetUrl,
      status: "success",
      durationMs: amassResult.duration_ms || 0,
      summary,
    });
  };

  const runShodanModule = async () => {
    const key = Deno.env.get("SHODAN_API_KEY");
    if (!key || discoveredIps.size === 0) {
      await insertExternalIntel("shodan", hostname || targetUrl, false, { configured: Boolean(key) }, {}, "low");
      return;
    }

    const shodanEligibleIps = [...discoveredIps].filter((ip) => isIpAllowedInScope(ip)).slice(0, 10);
    const shodanSkippedIps = [...discoveredIps].filter((ip) => !isIpAllowedInScope(ip));
    if (shodanEligibleIps.length === 0) {
      shodanStatus = "scope_filtered";
      await insertObservation({
        module: "shodan",
        observation_type: "scope_guard_skip",
        title: "Shodan skipped: no in-scope IPs",
        value: {
          total_discovered_ips: discoveredIps.size,
          skipped_out_of_scope_ips: shodanSkippedIps.slice(0, 50),
        },
        severity: "info",
      });
      await insertExternalIntel(
        "shodan",
        hostname || targetUrl,
        false,
        {
          configured: true,
          scope_filtered: true,
          skipped_out_of_scope_ips: shodanSkippedIps.slice(0, 50),
        },
        {},
        "low",
      );
      return;
    }

    let exactHostMatch = false;
    let hostDataFound = false;
    let unrelatedHostCount = 0;

    const processShodanIp = async (ip: string) => {
      try {
        const shodanUrl = `https://api.shodan.io/shodan/host/${encodeURIComponent(ip)}?key=${encodeURIComponent(key)}&minify=true`;
        const res = await fetchWithTimeout(shodanUrl, {}, 12000);
        if (!res.ok) return;
        const payload = await res.json();
        shodanHostPayloads.push({
          ip,
          payload: payload as Record<string, unknown>,
        });
        hostDataFound = true;
        const hostnames = Array.isArray(payload?.hostnames) ? payload.hostnames.map((h: any) => String(h)) : [];
        const ports = Array.isArray(payload?.ports) ? payload.ports : [];
        const cpes = Array.isArray(payload?.cpes) ? payload.cpes.map((c: any) => String(c)).filter(Boolean) : [];
        const vulns = Array.isArray(payload?.vulns)
          ? payload.vulns.map((v: any) => String(v))
          : payload?.vulns && typeof payload.vulns === "object"
            ? Object.keys(payload.vulns)
            : [];
        const tags = Array.isArray(payload?.tags) ? payload.tags : [];
        for (const tag of tags.slice(0, 30)) {
          const normalizedTag = String(tag || "").trim();
          if (!normalizedTag) continue;
          addTechFingerprint(normalizedTag, {
            categories: ["service", "osint"],
            confidence: 65,
            source: "shodan_tag",
          });
        }

        for (const h of hostnames) discoveredHostnames.add(String(h).toLowerCase());

        const hostMatchForIp = hostname
          ? hostnames.some((h: string) => {
            const current = h.toLowerCase();
            const targetHost = hostname.toLowerCase();
            if (current === targetHost) return true;
            if (rootDomain && (current === rootDomain.toLowerCase() || current === `www.${rootDomain.toLowerCase()}`)) return true;
            if (rootDomain && current.endsWith(`.${rootDomain.toLowerCase()}`)) return true;
            return false;
          })
          : true;

        if (hostMatchForIp) {
          exactHostMatch = true;
        }

        const unrelatedOnThisIp = hostname
          ? hostnames.filter((h: string) => !h.toLowerCase().endsWith((rootDomain || "").toLowerCase())).length
          : 0;

        if (hostname) {
          unrelatedHostCount += unrelatedOnThisIp;
        }

        const attributionFactor = computeShodanAttributionFactor({
          hostMatch: hostMatchForIp,
          rootDomain,
          hostnames,
          unrelatedHostnames: unrelatedOnThisIp,
          hostingContext,
        });

        await insertExternalIntel(
          "shodan",
          ip,
          true,
          {
            ports_count: ports.length,
            vulns_count: vulns.length,
            hostnames_count: hostnames.length,
            confidence_factor: attributionFactor.score,
            confidence_reasons: attributionFactor.reasons,
            allow_domain_attribution: attributionFactor.allowDomainAttribution,
            allow_ip_attribution: attributionFactor.allowIpAttribution,
          },
          payload,
          attributionFactor.confidence,
        );

        if (vulns.length > 0) {
          const canAttributeDomain = attributionFactor.allowDomainAttribution;
          const canAttributeIp = attributionFactor.allowIpAttribution;
          if (canAttributeDomain || canAttributeIp) {
            for (const cve of vulns.slice(0, 30)) {
              if (canAttributeDomain) {
                await insertFinding({
                  provider: "shodan",
                  module: "shodan",
                  finding_type: "shodan_cve_signal_domain",
                  severity: "medium",
                  title: `Shodan reports ${cve} (domain scope)`,
                  description: "Segnale CVE su dominio/subdominio con confidenza sufficiente e rischio shared non rilevato",
                  affected_asset: hostname || rootDomain || ip,
                  ip,
                  cve: [cve],
                  cwe: ["CWE-1104"],
                  evidence: {
                    ip,
                    hostnames: hostnames.slice(0, 50),
                    ports: ports.slice(0, 50),
                    tags: tags.slice(0, 30),
                    confidence_factor: attributionFactor.score,
                    confidence_reasons: attributionFactor.reasons,
                    shared_risk: attributionFactor.sharedRisk,
                    attribution_target: "domain",
                  },
                  attribution_confidence: attributionFactor.confidence,
                  remediation:
                    "Confermare versione servizio e validare vulnerabilità con scanner API autorizzato.",
                });
              }

              if (canAttributeIp) {
                await insertFinding({
                  provider: "shodan",
                  module: "shodan",
                  finding_type: "shodan_cve_signal_ip",
                  severity: "medium",
                  title: `Shodan reports ${cve} (ip scope)`,
                  description: "Segnale CVE attribuito all'IP con confidenza elevata e senza indicatori di shared hosting",
                  affected_asset: ip,
                  ip,
                  cve: [cve],
                  cwe: ["CWE-1104"],
                  evidence: {
                    ip,
                    hostnames: hostnames.slice(0, 50),
                    ports: ports.slice(0, 50),
                    tags: tags.slice(0, 30),
                    confidence_factor: attributionFactor.score,
                    confidence_reasons: attributionFactor.reasons,
                    shared_risk: attributionFactor.sharedRisk,
                    attribution_target: "ip",
                  },
                  attribution_confidence: attributionFactor.confidence,
                  remediation:
                    "Validare con scansione attiva autorizzata sul target IP e verificare ownership prima di remediation.",
                });
              }
            }
          } else {
            for (const cve of vulns.slice(0, 20)) {
              await insertFinding({
                provider: "shodan",
                module: "shodan",
                finding_type: "shodan_cve_signal_unattributed",
                severity: "low",
                title: `Shodan signal ${cve} (non attribuito)`,
                description: "Segnale CVE su IP condiviso o host non attribuibile con confidenza alta",
                affected_asset: ip,
                ip,
                cve: [cve],
                cwe: ["CWE-200"],
                evidence: {
                  ip,
                  hostnames: hostnames.slice(0, 50),
                  host_match: hostMatchForIp,
                  unrelated_hostnames: unrelatedOnThisIp,
                  tags: tags.slice(0, 20),
                  confidence_factor: attributionFactor.score,
                  confidence_reasons: attributionFactor.reasons,
                  shared_risk: attributionFactor.sharedRisk,
                },
                attribution_confidence: "low",
                remediation:
                  "Trattare come segnale OSINT: confermare ownership e validare con scansione attiva autorizzata.",
              });
            }
            await insertObservation({
              module: "shodan",
              observation_type: "vuln_signal_unattributed",
              title: "Shodan vulnerability signal without strong attribution",
              value: {
                ip,
                vulns: vulns.slice(0, 50),
                host_match: hostMatchForIp,
                unrelated_hostnames: unrelatedOnThisIp,
                confidence_factor: attributionFactor.score,
                confidence_reasons: attributionFactor.reasons,
                shared_risk: attributionFactor.sharedRisk,
              },
              severity: "info",
            });
          }
        }

        for (const port of ports.slice(0, 50)) {
          const portNumber = Number(port);
          await insertAsset({
            asset_type: "open_port",
            asset_value: `${ip}:${port}`,
            hostname,
            root_domain: rootDomain,
            ip,
            source: "shodan",
            confidence: "medium",
            raw: {
              port: portNumber,
              protocol: "tcp",
            },
          });

          await insertFinding({
            provider: "shodan",
            module: "shodan",
            finding_type: "open_port_exposed",
            severity: severityForExposedPort(portNumber),
            title: `Porta ${port} esposta pubblicamente`,
            description:
              "Host raggiungibile su porta aperta da Internet (dato OSINT passivo). Verificare esposizione e controlli di accesso.",
            affected_asset: hostname || ip,
            ip,
            port: portNumber,
            protocol: "tcp",
            cwe: ["CWE-284"],
            cve: cveHintsForService(PORT_SERVICE[portNumber]?.name ?? ""),
            evidence: {
              ip,
              port: portNumber,
              source: "shodan",
              hostnames: hostnames.slice(0, 10),
              service_description: PORT_SERVICE[portNumber]?.description,
            },
            remediation: remediationForExposedPort(portNumber),
          });
          await insertOpenPort(portNumber, hostname || ip, ip, "tcp", "shodan", PORT_SERVICE[portNumber]?.name);
        }

        for (const cpe of cpes.slice(0, 20)) {
          await insertFinding({
            provider: "shodan",
            module: "shodan",
            finding_type: "service_fingerprint_exposed",
            severity: "low",
            title: "Fingerprint servizio/versione esposto",
            description:
              "Sono stati rilevati fingerprint CPE pubblici che possono facilitare identificazione tecnologica e targeting.",
            affected_asset: hostname || ip,
            ip,
            cwe: ["CWE-200"],
            evidence: {
              ip,
              cpe,
              source: "shodan",
            },
            remediation:
              "Ridurre leakage di banner/versioni, harden del servizio e verificare patching continuo delle componenti esposte.",
          });
        }
      } catch {
        // ignore single host errors
      }
    };

    const SHODAN_CHUNK = 3;
    for (let i = 0; i < shodanEligibleIps.length; i += SHODAN_CHUNK) {
      await Promise.allSettled(shodanEligibleIps.slice(i, i + SHODAN_CHUNK).map(processShodanIp));
    }

    if (!hostDataFound) {
      shodanStatus = "not_found";
    } else if (exactHostMatch) {
      shodanStatus = "found_exact";
    } else if (unrelatedHostCount > 5) {
      shodanStatus = "stale_or_low_confidence";
    } else {
      shodanStatus = "found_ip_only";
    }

    if (unrelatedHostCount > 5) {
      hostingContext = "shared_hosting";
      await insertObservation({
        module: "shared_hosting_detector",
        observation_type: "hosting_context",
        title: "Shared hosting likely",
        value: { unrelated_hostnames_detected: unrelatedHostCount },
        severity: "info",
      });
    }
  };

  const runUrlscanModule = async () => {
    const apiKey = Deno.env.get("URLSCAN_API_KEY");
    if (!apiKey || !hostname) {
      await insertExternalIntel("urlscan", hostname || targetUrl, false, { configured: Boolean(apiKey) }, {}, "low");
      return;
    }

    // Lightweight lookup by domain, no forced submission in v1.
    const searchUrl = `https://urlscan.io/api/v1/search/?q=domain:${encodeURIComponent(hostname)}&size=1`;
    const res = await fetchWithTimeout(searchUrl, { headers: { "API-Key": apiKey } }, 12000);
    if (!res.ok) {
      await insertExternalIntel("urlscan", hostname, false, { status: res.status }, {}, "low");
      return;
    }
    const payload = await res.json();
    const result = Array.isArray(payload?.results) ? payload.results[0] : null;
    await insertExternalIntel("urlscan", hostname, Boolean(result), { has_result: Boolean(result) }, payload, "medium");
    if (result?.verdicts?.overall?.malicious) {
      await insertFinding({
        provider: "urlscan",
        module: "urlscan",
        finding_type: "urlscan_malicious_verdict",
        severity: "high",
        title: "urlscan malicious verdict",
        description: "urlscan segnala il target come potenzialmente malevolo",
        affected_asset: hostname,
        evidence: { result },
      });
    }
  };

  const runDenoTcpProbeModule = async () => {
    const targetIps = new Set<string>([
      ...(job.resolved_ips ?? []),
      ...Array.from(discoveredIps).filter(v => /^\d{1,3}(\.\d{1,3}){3}$/.test(v)),
    ].filter(Boolean));

    const portListEnv = Deno.env.get("SURFACESCAN_TCP_PROBE_PORTS");
    const portsToScan = portListEnv
      ? portListEnv.split(",").map(Number).filter(n => n > 0 && n < 65536)
      : TCP_PROBE_PORTS;

    if (targetIps.size === 0) {
      await insertObservation({
        module: "deno_tcp_probe",
        observation_type: "tcp_probe_skipped",
        title: "TCP probe saltato: nessun IP risolto",
        value: { reason: "no_ips" },
        severity: "info",
      });
      return;
    }

    const CONCURRENCY = Number(Deno.env.get("SURFACESCAN_TCP_CONCURRENCY") ?? "10");
    const TIMEOUT_MS  = Number(Deno.env.get("SURFACESCAN_TCP_TIMEOUT_MS")  ?? "2500");
    const openResults: Array<{ ip: string; port: number; banner: string }> = [];

    for (const ip of targetIps) {
      for (let i = 0; i < portsToScan.length; i += CONCURRENCY) {
        const chunk = portsToScan.slice(i, i + CONCURRENCY);
        const results = await Promise.allSettled(
          chunk.map(port => tcpProbe(ip, port, TIMEOUT_MS)),
        );
        for (let j = 0; j < chunk.length; j++) {
          const r = results[j];
          if (r.status === "fulfilled" && r.value.open) {
            openResults.push({ ip, port: chunk[j], banner: r.value.banner });
          }
        }
        if (i + CONCURRENCY < portsToScan.length) {
          await new Promise(res => setTimeout(res, 100));
        }
      }
    }

    for (const { ip, port, banner } of openResults) {
      const svcInfo = PORT_SERVICE[port];
      await insertOpenPort(port, ip, ip, "tcp", "deno_tcp_probe", svcInfo?.name, undefined, banner);
      await insertFinding({
        provider: "deno_tcp_probe",
        module: "deno_tcp_probe",
        finding_type: "open_port_exposed",
        severity: severityForExposedPort(port),
        title: `Porta ${port}${svcInfo ? ` (${svcInfo.name})` : ""} esposta`,
        description: svcInfo
          ? `${svcInfo.description}. ${svcInfo.risk}.${banner ? ` Banner: ${banner.slice(0, 80)}` : ""}`
          : `Porta aperta ${port}/tcp.${banner ? ` Banner: ${banner.slice(0, 80)}` : ""}`,
        affected_asset: job.hostname || ip,
        ip,
        port,
        protocol: "tcp",
        cwe: ["CWE-284"],
        cve: cveHintsForService(svcInfo?.name ?? ""),
        evidence: {
          source: "deno_tcp_probe",
          banner: banner || null,
          service_description: svcInfo?.description,
          risk_summary: svcInfo?.risk,
        },
        remediation: remediationForExposedPort(port),
      });
    }

    await insertObservation({
      module: "deno_tcp_probe",
      observation_type: "tcp_probe_summary",
      title: "TCP Port Probe completato",
      value: {
        ips_scanned: targetIps.size,
        ports_checked: portsToScan.length,
        open_count: openResults.length,
        open_ports: openResults.map(p => `${p.ip}:${p.port}`),
      },
      severity: openResults.length > 0 ? "medium" : "info",
    });
  };

  const modules: Record<string, ModuleExecutionConfig> = {
    dns: {
      key: "dns",
      label: "DNS & Mail Intelligence",
      timeoutMs: 20000,
      retryOnError: true,
      maxRetries: 1,
      retryBackoffMs: 500,
    },
    dnssec: {
      key: "dnssec",
      label: "DNSSEC",
      timeoutMs: 8000,
      featureFlag: "SURFACESCAN_ENABLE_DNSSEC",
      retryOnError: true,
      maxRetries: 1,
      retryBackoffMs: 500,
    },
    whois: {
      key: "whois",
      label: "Domain WHOIS/RDAP",
      timeoutMs: 12000,
      featureFlag: "SURFACESCAN_ENABLE_WEBCHECK_MODULES",
      retryOnError: true,
      maxRetries: 1,
      retryBackoffMs: 600,
    },
    http_security: {
      key: "http_security",
      label: "HTTP Security",
      timeoutMs: Math.max(
        25000,
        Math.min(90000, Number(Deno.env.get("SURFACESCAN_HTTP_MODULE_TIMEOUT_MS") || "50000")),
      ),
      retryOnError: true,
      maxRetries: Math.max(1, Math.min(3, Number(Deno.env.get("SURFACESCAN_HTTP_MODULE_MAX_RETRIES") || "2"))),
      retryBackoffMs: Math.max(500, Math.min(5000, Number(Deno.env.get("SURFACESCAN_HTTP_MODULE_RETRY_BACKOFF_MS") || "1250"))),
    },
    headers: {
      key: "headers",
      label: "HTTP Headers",
      timeoutMs: Math.max(
        25000,
        Math.min(90000, Number(Deno.env.get("SURFACESCAN_HTTP_MODULE_TIMEOUT_MS") || "50000")),
      ),
      retryOnError: true,
      maxRetries: Math.max(1, Math.min(3, Number(Deno.env.get("SURFACESCAN_HTTP_MODULE_MAX_RETRIES") || "2"))),
      retryBackoffMs: Math.max(500, Math.min(5000, Number(Deno.env.get("SURFACESCAN_HTTP_MODULE_RETRY_BACKOFF_MS") || "1250"))),
    },
    robots: { key: "robots", label: "Robots.txt", timeoutMs: 12000 },
    security_txt: { key: "security_txt", label: "Security.txt", timeoutMs: 12000 },
    sitemap: { key: "sitemap", label: "Sitemap", timeoutMs: 12000 },
    redirects: { key: "redirects", label: "Redirect Chain", timeoutMs: 12000 },
    ssl_certificate: {
      key: "ssl_certificate",
      label: "SSL Certificate",
      timeoutMs: 16000,
    },
    tls_summary: {
      key: "tls_summary",
      label: "TLS Summary",
      timeoutMs: 16000,
    },
    server_info: {
      key: "server_info",
      label: "Server Information",
      timeoutMs: 15000,
    },
    server_location: {
      key: "server_location",
      label: "Server Location",
      timeoutMs: 12000,
    },
    ip_geo_asn: {
      key: "ip_geo_asn",
      label: "IP Geo & ASN Intelligence",
      timeoutMs: 30000,
      retryOnError: true,
      maxRetries: 1,
      retryBackoffMs: 700,
    },
    tech_stack: {
      key: "tech_stack",
      label: "Tech Stack",
      timeoutMs: 15000,
    },
    quality: {
      key: "quality",
      label: "Quality Metrics",
      timeoutMs: 35000,
      featureFlag: "SURFACESCAN_ENABLE_QUALITY",
    },
    threats: {
      key: "threats",
      label: "Threat Checks",
      timeoutMs: 18000,
      featureFlag: "SURFACESCAN_ENABLE_THREATS",
      retryOnError: true,
      maxRetries: 1,
      retryBackoffMs: 600,
    },
    dns_blocklists: {
      key: "dns_blocklists",
      label: "DNS Blocklists",
      timeoutMs: 15000,
      featureFlag: "SURFACESCAN_ENABLE_WEBCHECK_MODULES",
      retryOnError: true,
      maxRetries: 1,
      retryBackoffMs: 700,
    },
    reverse_dns_and_dumpster: {
      key: "reverse_dns_and_dumpster",
      label: "Subdomain Discovery",
      timeoutMs: 30000,
      featureFlag: "SURFACESCAN_ENABLE_SUBDOMAINS",
    },
    amass_discovery: {
      key: "amass_discovery",
      label: "Amass Discovery",
      timeoutMs: Math.max(
        20000,
        Math.min(150000, Number(Deno.env.get("SURFACESCAN_AMASS_MODULE_TIMEOUT_MS") || "90000")),
      ),
      featureFlag: "SURFACESCAN_ENABLE_AMASS",
      defaultEnabled: false,
      retryOnError: true,
      maxRetries: 1,
      retryBackoffMs: 1500,
    },
    shodan: { key: "shodan", label: "Shodan Intel", timeoutMs: 30000 },
    urlscan: { key: "urlscan", label: "URLScan Intel", timeoutMs: 20000 },
    deno_tcp_probe: {
      key: "deno_tcp_probe",
      label: "TCP Port Probe",
      timeoutMs: 120_000,
      featureFlag: "SURFACESCAN_ENABLE_TCP_PROBE",
      defaultEnabled: true,
      retryOnError: false,
    },
    open_ports: {
      key: "open_ports",
      label: "Open Ports",
      timeoutMs: 30000,
      featureFlag: "SURFACESCAN_ENABLE_OPEN_PORTS",
    },
    cve_intel: {
      key: "cve_intel",
      label: "CVE Intelligence (MITRE+CIRCL)",
      timeoutMs: 60000,
      retryOnError: true,
      maxRetries: 1,
      retryBackoffMs: 900,
    },
    passes: {
      key: "passes",
      label: "Passes Summary",
      timeoutMs: 15000,
      featureFlag: "SURFACESCAN_ENABLE_WEBCHECK_MODULES",
    },
    connectsecure: {
      key: "connectsecure",
      label: "Attack Surface Mapper",
      timeoutMs: 660_000,
      featureFlag: "CONNECTSECURE_ENABLED",
      defaultEnabled: true,
      retryOnError: false,
    },
  };

  // ── ConnectSecure Attack Surface Mapper — root/scope scan only ───────────
  const runConnectSecureModule = async () => {
    if (String(job.scan_type || "") === "subdomain_enrichment" || (jobConfig as any).no_connectsecure === true) {
      await recordModuleSkipped(modules.connectsecure, "internal_subdomain_enrichment", {
        scan_type: job.scan_type || null,
      });
      return;
    }

    const { data: csCfg } = await adminClient
      .from("connectsecure_config" as any)
      .select("pod_host, client_auth_token, company_id, enabled")
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (csCfg?.enabled === false) {
      await recordModuleSkipped(modules.connectsecure, "disabled", { organization_id: organizationId });
      return;
    }

    const globalPodHost = String(Deno.env.get("CS_POD_HOST") || "").trim();
    const globalToken = String(Deno.env.get("CS_CLIENT_AUTH_TOKEN") || "").trim();
    const globalCompany = String(Deno.env.get("CS_COMPANY_ID") || "").trim();
    const cfg: CsConfig = {
      pod_host: (globalPodHost || String(csCfg?.pod_host || "")).trim().replace(/^https?:\/\//i, "").replace(/\/+$/, ""),
      client_auth_token: csNormalizeClientAuthToken(globalToken || String(csCfg?.client_auth_token || "")),
      company_id: globalCompany ? Number(globalCompany) : Number(csCfg?.company_id || 0),
    };

    if (!cfg.pod_host || !cfg.client_auth_token || !cfg.company_id) {
      await recordModuleSkipped(modules.connectsecure, "no_config", { organization_id: organizationId });
      return;
    }

    const startDomain = rootDomain || hostname || job.normalized_target || "";
    if (!startDomain) {
      await recordModuleSkipped(modules.connectsecure, "no_root_domain", {});
      return;
    }

    const session = { current: await csAuthorize(cfg) };
    const domainId = await csGetOrCreateDomain(cfg, session, startDomain, adminClient, organizationId);
    const scanRequestedAt = new Date(Date.now() - 5_000).toISOString();
    await adminClient.from("connectsecure_domain_registry" as any).upsert({
      organization_id: organizationId,
      domain: startDomain,
      cs_domain_id: domainId,
      depth: 0,
      parent_domain: null,
      last_scanned_at: scanRequestedAt,
    }, { onConflict: "organization_id,domain" });

    await csScanNow(cfg, session, [{ name: startDomain, domain: startDomain, company_id: cfg.company_id, id: domainId }]);
    const result = await csWaitForResults(cfg, session, domainId, startDomain, 420_000, scanRequestedAt);
    const { assets, findings, ports, observations, sensitiveData } = csMapToFindings(result, startDomain, 0);

    for (const a of assets) {
      await insertAsset({
        asset_type:  a.asset_type,
        asset_value: a.asset_value,
        hostname:    a.hostname || undefined,
        root_domain: a.root_domain || undefined,
        ip:          a.ip || undefined,
        source:      a.source,
        confidence:  a.confidence,
        raw:         a.raw || {},
      });
    }

    for (const f of findings) {
      await insertFinding({
        provider:       f.provider,
        module:         f.module,
        finding_type:   f.finding_type,
        severity:       f.severity,
        title:          f.title,
        description:    f.description,
        affected_asset: f.affected_asset,
        ip:             f.ip || undefined,
        port:           f.port || undefined,
        protocol:       f.protocol || undefined,
        cve:            f.cve || [],
        cwe:            f.cwe || [],
        cvss:           f.cvss || undefined,
        evidence:       f.evidence || {},
        remediation:    f.remediation || undefined,
      });
    }

    for (const p of ports) {
      await insertOpenPort(
        p.port, p.host, p.ip, p.protocol,
        "connectsecure",
        p.serviceName, p.serviceVersion, p.banner,
      );
    }

    for (const obs of observations) {
      await insertObservation({
        module:           "connectsecure",
        observation_type: obs.type,
        title:            obs.title,
        value:            obs.value,
        severity:         obs.severity as any,
      });
    }

    if ((sensitiveData.creds?.length || 0) + (sensitiveData.hashes?.length || 0) > 0) {
      await adminClient.from("connectsecure_sensitive_data" as any).insert({
        organization_id: organizationId,
        scan_job_id:     job.id,
        domain:          sensitiveData.domain,
        creds_count:     sensitiveData.creds?.length || 0,
        hashes_count:    sensitiveData.hashes?.length || 0,
        creds:           sensitiveData.creds || null,
        hashes:          sensitiveData.hashes || null,
      });
    }

    const handedToInternalQueue = csExtractSubdomains(result, rootDomain || startDomain)
      .map((entry) => String(entry || "").trim().toLowerCase().replace(/\.$/, ""))
      .filter((entry) => entry && entry !== startDomain && entry.endsWith(`.${rootDomain || startDomain}`));
    for (const subDomain of handedToInternalQueue) {
      discoveredHostnames.add(subDomain);
    }

    await insertObservation({
      module:           "connectsecure",
      observation_type: "bfs_scan_summary",
      title:            "Attack Surface Mapper — root scan completato",
      value: {
        domains_scanned: 1,
        max_depth_reached: 0,
        total_visited: 1,
        max_depth_allowed: 10,
        subdomains_handed_to_internal_queue: handedToInternalQueue.length,
        internal_queue_limit_standard: 10,
      },
      severity: "info",
    });

    await insertExternalIntel(
      "connectsecure",
      rootDomain || hostname || "",
      true,
      { domains_scanned: 1, depth: 0, subdomains_handed_to_internal_queue: handedToInternalQueue.length },
      { company_id: cfg.company_id, pod_host: cfg.pod_host },
      "high",
    );
  };

  const runAmassDiscoveryIfEnabled = async () => {
    const serviceUrl = String(Deno.env.get("SURFACESCAN_AMASS_SERVICE_URL") || "").trim();
    const sharedSecret = String(Deno.env.get("SURFACESCAN_AMASS_SHARED_SECRET") || "").trim();
    const gate = resolveAmassDiscoveryGate({
      featureEnabled: isFeatureEnabled("SURFACESCAN_ENABLE_AMASS", false),
      serviceUrl,
      sharedSecret,
      jobConfig,
      targetType: parsedTarget.target_type,
      rootDomain,
    });

    if (!gate.enabled) {
      await recordModuleSkipped(modules.amass_discovery, gate.reason || "amass_disabled", {
        feature_flag: "SURFACESCAN_ENABLE_AMASS",
        target_type: parsedTarget.target_type,
        has_service_url: Boolean(serviceUrl),
        has_shared_secret: Boolean(sharedSecret),
      });
      return;
    }

    await safeRun(modules.amass_discovery, runAmassModule);
  };

  const runSafeRecon = async () => {
    // Phase 1: baseline resolution — no inter-dependencies
    await Promise.allSettled([
      safeRun(modules.dns, runDnsModule),
      safeRun(modules.dnssec, runDnssecModule),
      safeRun(modules.whois, runWhoisModule),
    ]);
    // Phase 2: HTTP checks + threat intel + IP-based checks (discoveredIps populated by phase 1)
    await Promise.allSettled([
      safeRun(modules.http_security, runHttpModules),
      safeRun(modules.headers, async () => { await fetchPrimaryHttpSnapshot(); }),
      safeRun(modules.robots, runRobotsModule),
      safeRun(modules.security_txt, runSecurityTxtModule),
      safeRun(modules.sitemap, runSitemapModule),
      safeRun(modules.redirects, runRedirectModule),
      safeRun(modules.quality, runQualityModule),
      safeRun(modules.threats, runThreatsModule),
      safeRun(modules.dns_blocklists, runDnsBlocklistsModule),
    ]);
  };

  try {
    await runSafeRecon();

    if (["domain_exposure", "ip_exposure", "cve_api_validation"].includes(job.scan_profile)) {
      const phase3: Promise<void>[] = [
        safeRun(modules.reverse_dns_and_dumpster, runReverseAndDumpsterModule),
        runAmassDiscoveryIfEnabled(),
        safeRun(modules.shodan, runShodanModule),
        safeRun(modules.ip_geo_asn, runIpGeoAndAsnModule),
      ];
      if (["domain_exposure", "cve_api_validation"].includes(job.scan_profile)) {
        phase3.push(safeRun(modules.urlscan, runUrlscanModule));
      }
      await Promise.allSettled(phase3);
    }
    // ConnectSecure BFS depth-10 — eseguito per tutti i profili se config presente
    await safeRun(modules.connectsecure, runConnectSecureModule);
    await safeRun(modules.deno_tcp_probe, runDenoTcpProbeModule);
    await safeRun(modules.open_ports, runOpenPortsModule);
    await safeRun(modules.cve_intel, runCveIntelModule);

    await Promise.allSettled([
      safeRun(modules.ssl_certificate, runSslCertificateModule),
      safeRun(modules.tls_summary, runTlsSummaryModule),
      safeRun(modules.server_info, runServerInfoModule),
      safeRun(modules.server_location, runServerLocationModule),
      safeRun(modules.tech_stack, runTechStackModule),
    ]);

    await safeRun(modules.passes, runPassesModule);

    // Hosting context derivation fallback
    if (hostingContext === "unknown") {
      const hostnames = [...discoveredHostnames];
      const unrelated = rootDomain
        ? hostnames.filter((h) => !h.toLowerCase().endsWith(rootDomain.toLowerCase())).length
        : 0;
      if (unrelated > 8) hostingContext = "shared_hosting";
      if (hostnames.some((h) => /cloudflare|akamai|fastly/i.test(h))) hostingContext = "cdn_proxy";
      if (hostingContext === "unknown" && discoveredIps.size > 0 && unrelated <= 1) hostingContext = "dedicated";
    }

    const findingsAgg = await adminClient
      .from("surface_findings" as any)
      .select("severity,module,finding_type,status")
      .eq("scan_job_id", job.id);
    const findingRows = ((findingsAgg.data || []) as Array<{
      severity: string;
      module?: string | null;
      finding_type?: string | null;
      status?: string | null;
    }>).filter((row) =>
      !["resolved", "suppressed", "false_positive", "accepted_risk"].includes(String(row.status || "").toLowerCase())
    );
    const highestSeverity = findingRows
      .map((row) => row.severity)
      .sort((a, b) => severityRank(b) - severityRank(a))[0] || "info";
    const severityCounts = findingRows.reduce(
      (acc, row) => {
        const key = toSeverity(row.severity || "info");
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      },
      { critical: 0, high: 0, medium: 0, low: 0, info: 0 } as Record<string, number>,
    );
    const observationAgg = await adminClient
      .from("surface_observations" as any)
      .select("module,observation_type,value,created_at")
      .eq("scan_job_id", job.id)
      .in("module", [
        "ssl_certificate",
        "tls_summary",
        "dnssec",
        "dns",
        "mail_security",
        "http_security",
        "open_ports",
        "threats",
        "dns_blocklists",
        "quality",
        "whois",
      ])
      .order("created_at", { ascending: false });
    const observationRows = (observationAgg.data || []) as Array<{
      module: string;
      observation_type: string;
      value: Record<string, unknown>;
      created_at?: string | null;
    }>;
    const getLatestObservation = (moduleKey: string, observationType?: string) =>
      observationRows.find((row) =>
        row.module === moduleKey && (!observationType || row.observation_type === observationType)
      )?.value || {};

    const sslSummary = getLatestObservation("ssl_certificate", "ssl_certificate_summary") as Record<string, unknown>;
    const tlsSummary = getLatestObservation("tls_summary", "tls_summary") as Record<string, unknown>;
    const dnssecSummary = getLatestObservation("dnssec", "dnssec_status") as Record<string, unknown>;
    const dnsSummary = getLatestObservation("dns", "dns_records") as Record<string, unknown>;
    const mailSummary = getLatestObservation("mail_security", "mail_security_summary") as Record<string, unknown>;
    const httpSecuritySummary = getLatestObservation("http_security", "http_security_summary") as Record<string, unknown>;
    const openPortsSummary = getLatestObservation("open_ports", "open_ports_summary") as Record<string, unknown>;
    const threatsSummary = getLatestObservation("threats", "threats_summary") as Record<string, unknown>;
    const dnsblSummary = getLatestObservation("dns_blocklists", "dnsbl_summary") as Record<string, unknown>;
    const qualitySummary = getLatestObservation("quality", "quality_summary") as Record<string, unknown>;
    const whoisSummary = getLatestObservation("whois", "whois_rdap") as Record<string, unknown>;

    const hasFindingType = (types: string[]): boolean => {
      const wanted = new Set(types.map((entry) => String(entry).toLowerCase()));
      return findingRows.some((row) => wanted.has(String(row.finding_type || "").toLowerCase()));
    };
    const asNumber = (value: unknown): number | null => {
      const parsed = Number(value);
      if (!Number.isFinite(parsed)) return null;
      return parsed;
    };
    const asBoolean = (value: unknown): boolean => value === true;
    const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

    let transportScore = 0;
    const sslTrusted = asBoolean((sslSummary as any)?.trusted);
    if (sslTrusted) transportScore += 40;
    if (
      sslTrusted &&
      !hasFindingType([
        "ssl_certificate_untrusted_chain",
        "ssl_certificate_self_signed",
      ])
    ) {
      transportScore += 20;
    }
    const expiresInDays =
      asNumber((sslSummary as any)?.expiresInDays) ?? asNumber((sslSummary as any)?.daysToExpiry);
    if (expiresInDays !== null && expiresInDays > 30) transportScore += 15;
    const tls12Supported = asBoolean((tlsSummary as any)?.tls12Supported) || asBoolean((tlsSummary as any)?.tls13Supported);
    if (tls12Supported) transportScore += 15;
    const weakProtocolsEnabled =
      asBoolean((tlsSummary as any)?.tls10Supported) ||
      asBoolean((tlsSummary as any)?.tls11Supported) ||
      hasFindingType(["tls_legacy_protocols_enabled"]);
    if (!weakProtocolsEnabled) transportScore += 10;
    transportScore = clampScore(transportScore);

    let dnsScore = 0;
    const dnskeyPresent = asBoolean((dnssecSummary as any)?.dnskey_present);
    const dsPresent = asBoolean((dnssecSummary as any)?.ds_present);
    if (dnskeyPresent && dsPresent) dnsScore += 40;
    else if (dnskeyPresent || dsPresent) dnsScore += 20;
    const spfRecords = asArray((mailSummary as any)?.spf_records).map((entry) => String(entry || "").trim()).filter(Boolean);
    if (spfRecords.length > 0) dnsScore += 15;
    const dmarcRecords = asArray((mailSummary as any)?.dmarc_records).map((entry) => String(entry || "").trim()).filter(Boolean);
    if (dmarcRecords.length > 0) dnsScore += 20;
    const caaRecords = asArray((dnsSummary as any)?.CAA).map((entry) => String(entry || "").trim()).filter(Boolean);
    if (caaRecords.length > 0) dnsScore += 10;
    const nsRecords = asArray((dnsSummary as any)?.NS).map((entry) => String(entry || "").trim()).filter(Boolean);
    const mxRecords = asArray((dnsSummary as any)?.MX).map((entry) => String(entry || "").trim()).filter(Boolean);
    if (nsRecords.length >= 2 && mxRecords.length >= 1) dnsScore += 15;
    else if (nsRecords.length >= 1 && mxRecords.length >= 1) dnsScore += 10;
    dnsScore = clampScore(dnsScore);

    let httpSecurityScore = clampScore(asNumber((httpSecuritySummary as any)?.score) ?? 0);
    if (httpSecurityScore === 0 && (httpSecuritySummary as any)?.checks && typeof (httpSecuritySummary as any).checks === "object") {
      const checks = Object.values((httpSecuritySummary as any).checks as Record<string, unknown>);
      const passed = checks.filter((entry) => entry === true).length;
      httpSecurityScore = clampScore((checks.length > 0 ? (passed / checks.length) * 100 : 0));
    }

    let exposureScore = 100;
    const openPorts = asArray((openPortsSummary as any)?.openPorts);
    const criticalPorts = openPorts.filter((entry: any) => severityForExposedPort(Number(entry?.port || 0)) === "critical").length;
    const highPorts = openPorts.filter((entry: any) => severityForExposedPort(Number(entry?.port || 0)) === "high").length;
    const mediumPorts = openPorts.filter((entry: any) => severityForExposedPort(Number(entry?.port || 0)) === "medium").length;
    exposureScore -= criticalPorts * 40;
    exposureScore -= highPorts * 25;
    exposureScore -= mediumPorts * 10;
    const sensitiveKeywords = /(staging|dev|test|backup|vpn|cpanel|webmail|autodiscover|mail)/i;
    const sensitiveSubdomainCount = [...discoveredHostnames]
      .map((entry) => String(entry || "").toLowerCase())
      .filter((entry) => entry && rootDomain && entry.endsWith(`.${String(rootDomain).toLowerCase()}`))
      .filter((entry) => sensitiveKeywords.test(entry))
      .length;
    exposureScore -= Math.min(25, sensitiveSubdomainCount * 5);
    exposureScore = clampScore(exposureScore);

    let reputationScore = 100;
    const safeBrowsingUnsafe = asBoolean((threatsSummary as any)?.safe_browsing?.unsafe);
    const urlHausListed = asBoolean((threatsSummary as any)?.urlhaus?.listed);
    const phishTankVerified =
      asBoolean((threatsSummary as any)?.phishtank?.verified) ||
      (asBoolean((threatsSummary as any)?.phishtank?.in_database) && asBoolean((threatsSummary as any)?.phishtank?.valid));
    if (safeBrowsingUnsafe || urlHausListed || phishTankVerified) {
      reputationScore = 0;
    } else {
      const iocIndicators = asArray(
        (threatsSummary as any)?.ioc_fresh_list?.indicators ||
        (threatsSummary as any)?.intelguard?.indicators,
      );
      const highConfidenceIntel = iocIndicators.filter((entry: any) => Number(entry?.confidence || 0) >= 90).length;
      reputationScore -= Math.min(30, highConfidenceIntel * 10);
      const dnsblListedCount = asNumber((dnsblSummary as any)?.listed_count) ?? 0;
      reputationScore -= Math.min(40, Math.max(0, Math.round(dnsblListedCount)) * 8);
    }
    reputationScore = clampScore(reputationScore);

    const qualityCategories = ((qualitySummary as any)?.categories || {}) as Record<string, unknown>;
    const qualityParts = [
      asNumber(qualityCategories.performance),
      asNumber(qualityCategories.accessibility),
      asNumber(qualityCategories.best_practices),
      asNumber(qualityCategories.seo),
    ].filter((entry): entry is number => entry !== null);
    const qualityScore = clampScore(
      qualityParts.length > 0
        ? qualityParts.reduce((acc, value) => acc + value, 0) / qualityParts.length
        : 0,
    );

    let domainHygieneScore = 70;
    const daysToExpiry = asNumber((whoisSummary as any)?.days_to_expiry);
    if (daysToExpiry !== null) {
      if (daysToExpiry > 90) domainHygieneScore = 100;
      else if (daysToExpiry >= 30) domainHygieneScore = 70;
      else if (daysToExpiry >= 0) domainHygieneScore = 40;
      else domainHygieneScore = 0;
    }
    const registrarName = String((whoisSummary as any)?.registrar || "").trim();
    if (!registrarName) domainHygieneScore -= 10;
    domainHygieneScore = clampScore(domainHygieneScore);

    const weightedOverall = clampScore(
      transportScore * 0.20 +
      dnsScore * 0.15 +
      httpSecurityScore * 0.20 +
      exposureScore * 0.15 +
      reputationScore * 0.15 +
      qualityScore * 0.10 +
      domainHygieneScore * 0.05,
    );
    const severityPenaltyOverall = Math.max(
      0,
      Math.round(
        100 -
          severityCounts.critical * 35 -
          severityCounts.high * 20 -
          severityCounts.medium * 8 -
          severityCounts.low * 3 -
          severityCounts.info * 1,
      ),
    );
    const overallScore = clampScore(Math.round((weightedOverall * 0.75) + (severityPenaltyOverall * 0.25)));
    const riskLevel = riskLevelFromScore(overallScore);
    const scoreBreakdown: SurfaceScoreBreakdown = {
      transportScore,
      dnsScore,
      httpSecurityScore,
      exposureScore,
      reputationScore,
      qualityScore,
      domainHygieneScore,
      overallScore,
      riskLevel,
    };
    const moduleSummary = [...moduleExecution.values()]
      .sort((a, b) => a.key.localeCompare(b.key))
      .map((entry) => ({
        key: entry.key,
        label: entry.label,
        status: entry.status,
        severity: entry.severity || "info",
        started_at: entry.started_at || null,
        completed_at: entry.completed_at || null,
        duration_ms: entry.duration_ms || null,
        error_message: entry.error_message || null,
      }));
    const moduleCounters = moduleSummary.reduce(
      (acc, entry) => {
        acc.total += 1;
        acc[entry.status] = (acc[entry.status] || 0) + 1;
        return acc;
      },
      {
        total: 0,
        queued: 0,
        running: 0,
        success: 0,
        skipped: 0,
        error: 0,
        timeout: 0,
      } as Record<string, number>,
    );
    await triggerCveEnrichmentQueue();
    const subdomainQueueStats = await enqueueDiscoveredSubdomainJobs();

    const scanSummary = {
      overall_score: overallScore,
      risk_level: riskLevel,
      score_breakdown: scoreBreakdown,
      score_components: {
        weighted_model: weightedOverall,
        severity_penalty_model: severityPenaltyOverall,
      },
      severity_counts: severityCounts,
      findings_total: findingRows.length,
      module_counters: moduleCounters,
      modules: moduleSummary,
      scope_guard: scopeCounters,
      hosting_context: hostingContext,
      shodan_status: shodanStatus,
      subdomain_child_queue: subdomainQueueStats,
      warnings: scanWarnings.length > 0 ? scanWarnings : undefined,
    };

    await insertObservation({
      module: "scope_guard",
      observation_type: "scope_guard_summary",
      title: "Scope guard filtering summary",
      value: {
        in_scope: scopeCounters.in_scope,
        excluded_by_scope: scopeCounters.excluded_by_scope,
        excluded_shared_noise: scopeCounters.excluded_shared_noise,
        scope_domains_count: scopeDomains.length,
        ip_scope_rules_count: ipScopeRules.length,
      },
      severity: "info",
    });

    await adminClient
      .from("surface_scan_jobs" as any)
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        resolved_ips: [...discoveredIps],
        hosting_context: hostingContext,
        shodan_status: shodanStatus,
        summary: scanSummary,
      })
      .eq("id", job.id);

    await logAudit("scan_completed", {
      findings_count: findingRows.length,
      highest_severity: highestSeverity,
      hosting_context: hostingContext,
      shodan_status: shodanStatus,
      summary: scanSummary,
      scope_guard: scopeCounters,
    });

    await triggerAutoReportRepository();
  } catch (error: any) {
    await adminClient
      .from("surface_scan_jobs" as any)
      .update({
        status: "failed",
        completed_at: new Date().toISOString(),
        error_message: error?.message || "Enrichment failed",
      })
      .eq("id", job.id);

    await logAudit("scan_failed", {
      error: error?.message || String(error),
    });

    throw error;
  } finally {
    try {
      await dispatchSurfaceScanQueue(adminClient, organizationId, {
        initiatedByUserId: options.initiatedByUserId || job.requested_by || null,
        maxToStart: 1,
      });
    } catch (queueError) {
      console.error("[surface-scan-queue] dispatch after completion failed:", queueError);
    }
  }
}
