export type ExposureServiceClass =
  | "public_protected"
  | "public_cleartext_or_alternative"
  | "generic_unknown"
  | "remote_or_admin"
  | "legacy_or_infrastructure"
  | "data_or_control_plane";

export type ExposureMatrixSeverity = "low" | "medium" | "high" | "critical";

export type ExposureEvidenceStatus =
  | "exposure_only"
  | "fingerprint_unknown"
  | "no_known_cve"
  | "cve_candidate"
  | "cve_confirmed";

export type ExposureMatrixPort = {
  id?: string | null;
  scan_job_id?: string | null;
  host?: string | null;
  ip?: string | null;
  port: number;
  protocol?: string | null;
  service_name?: string | null;
  service_product?: string | null;
  service_version?: string | null;
  is_web?: boolean | null;
  is_tls?: boolean | null;
  last_seen_at?: string | null;
};

export type ServiceExposureAssessment = {
  service_key: string;
  open_port_id: string | null;
  host: string | null;
  ip: string | null;
  port: number;
  protocol: string;
  service_name: string | null;
  service_product: string | null;
  service_version: string | null;
  service_class: ExposureServiceClass;
  service_class_label: string;
  likelihood: number;
  impact: number;
  matrix_score: number;
  severity: ExposureMatrixSeverity;
  evidence_status: ExposureEvidenceStatus;
  rationale: string;
  remediation: string;
};

const PUBLIC_PROTECTED_PORTS = new Set([
  53, 443, 465, 587, 636, 853, 989, 990, 993, 995,
]);

const PUBLIC_CLEARTEXT_OR_ALT_PORTS = new Set([
  25, 80, 110, 119, 143, 3000, 4000, 5000, 7080, 7443, 8000, 8080,
  8081, 8443, 8888, 9000, 9090, 9443, 10000, 15672, 28017,
]);

const REMOTE_OR_ADMIN_PORTS = new Set([
  22, 3389, 5900, 5901, 5985, 5986,
]);

const LEGACY_OR_INFRASTRUCTURE_PORTS = new Set([
  20, 21, 23, 69, 79, 88, 111, 135, 139, 161, 389, 445, 500, 515,
  631, 1194, 1723, 2049, 9100, 9418,
]);

const DATA_OR_CONTROL_PLANE_PORTS = new Set([
  1433, 1521, 2181, 2375, 2376, 2379, 2380, 3306, 4646, 5432, 5672,
  5984, 6379, 6443, 8500, 9092, 9200, 9300, 10250, 10255, 11211,
  27017, 27018,
]);

const REMOTE_OR_ADMIN_RX = /\b(?:ssh|rdp|remote\s*desktop|vnc|winrm|webmin|admin(?:istration)?|management)\b/i;
const LEGACY_OR_INFRASTRUCTURE_RX = /\b(?:ftp|telnet|tftp|rpc|netbios|smb|snmp|ldap|nfs|pptp|finger|kerberos)\b/i;
const DATA_OR_CONTROL_RX = /\b(?:mysql|maria(?:db)?|postgres(?:ql)?|mssql|sql\s*server|oracle|redis|mongo(?:db)?|memcached|elastic(?:search)?|docker|kubernetes|kubelet|etcd|consul|nomad|kafka|rabbitmq|zookeeper|couchdb)\b/i;

const CLASS_CONFIG: Record<ExposureServiceClass, {
  label: string;
  likelihood: number;
  impact: number;
  rationale: string;
  remediation: string;
}> = {
  public_protected: {
    label: "Servizio pubblico standard/protetto",
    likelihood: 2,
    impact: 2,
    rationale: "Servizio comunemente pubblicato su Internet; l'esposizione resta verificabile ma ha impatto contenuto in assenza di ulteriori debolezze.",
    remediation: "Confermare la necessità del servizio, mantenere TLS e configurazione aggiornati e limitare banner e funzionalità non necessarie.",
  },
  public_cleartext_or_alternative: {
    label: "Servizio pubblico clear-text o alternativo",
    likelihood: 3,
    impact: 3,
    rationale: "Servizio web o applicativo raggiungibile su protocollo non cifrato o porta alternativa, più esposto a ricognizione e configurazioni deboli.",
    remediation: "Preferire TLS, reindirizzare i protocolli in chiaro, verificare autenticazione e restringere l'accesso se il servizio non è destinato al pubblico.",
  },
  generic_unknown: {
    label: "Servizio non identificato",
    likelihood: 3,
    impact: 3,
    rationale: "La porta è raggiungibile da Internet ma prodotto, versione e controlli applicati non sono ancora determinati.",
    remediation: "Identificare ownership, prodotto e versione; chiudere la porta se non necessaria oppure limitarla tramite firewall, VPN o allowlist.",
  },
  remote_or_admin: {
    label: "Accesso remoto o amministrativo",
    likelihood: 4,
    impact: 4,
    rationale: "Un'interfaccia di accesso remoto o amministrativo esposta aumenta la probabilità di brute force, abuso credenziali e compromissione privilegiata.",
    remediation: "Rimuovere l'esposizione diretta; usare VPN/ZTNA, MFA, allowlist IP, rate limiting e monitoraggio degli accessi.",
  },
  legacy_or_infrastructure: {
    label: "Protocollo legacy o infrastrutturale",
    likelihood: 5,
    impact: 4,
    rationale: "Protocollo legacy o infrastrutturale direttamente raggiungibile, spesso soggetto a enumerazione, downgrade o autenticazione debole.",
    remediation: "Disabilitare protocolli legacy, adottare alternative cifrate e confinare il servizio su reti private o sorgenti autorizzate.",
  },
  data_or_control_plane: {
    label: "Database, cache o control plane",
    likelihood: 5,
    impact: 5,
    rationale: "Servizio dati o control plane esposto direttamente: un abuso può compromettere dati, segreti, workload o controllo dell'infrastruttura.",
    remediation: "Rimuovere l'accesso Internet diretto; usare private networking, firewall, bastion, autenticazione forte e segmentazione dedicata.",
  },
};

function normalizedProtocol(value: unknown): string {
  return String(value || "tcp").trim().toLowerCase() || "tcp";
}

function normalizedHost(value: unknown): string {
  return String(value || "").trim().toLowerCase();
}

export function exposureServiceKey(value: ExposureMatrixPort): string {
  const host = normalizedHost(value.host);
  const ip = normalizedHost(value.ip);
  return [host || ip || "unknown", ip, Math.round(Number(value.port || 0)), normalizedProtocol(value.protocol)].join("|");
}

function severityFromMatrixScore(score: number): ExposureMatrixSeverity {
  if (score >= 21) return "critical";
  if (score >= 10) return "high";
  if (score >= 5) return "medium";
  return "low";
}

function classifyServiceClass(port: ExposureMatrixPort): ExposureServiceClass {
  const portNumber = Math.round(Number(port.port || 0));
  const fingerprint = [port.service_name, port.service_product]
    .map((entry) => String(entry || "").trim())
    .filter(Boolean)
    .join(" ");

  if (DATA_OR_CONTROL_PLANE_PORTS.has(portNumber) || DATA_OR_CONTROL_RX.test(fingerprint)) {
    return "data_or_control_plane";
  }
  if (LEGACY_OR_INFRASTRUCTURE_PORTS.has(portNumber) || LEGACY_OR_INFRASTRUCTURE_RX.test(fingerprint)) {
    return "legacy_or_infrastructure";
  }
  if (REMOTE_OR_ADMIN_PORTS.has(portNumber) || REMOTE_OR_ADMIN_RX.test(fingerprint)) {
    return "remote_or_admin";
  }
  if (PUBLIC_PROTECTED_PORTS.has(portNumber) || Boolean(port.is_tls)) {
    return "public_protected";
  }
  if (PUBLIC_CLEARTEXT_OR_ALT_PORTS.has(portNumber) || Boolean(port.is_web)) {
    return "public_cleartext_or_alternative";
  }
  return "generic_unknown";
}

export function assessExposedService(
  port: ExposureMatrixPort,
  evidenceStatus: ExposureEvidenceStatus = "fingerprint_unknown",
): ServiceExposureAssessment {
  const serviceClass = classifyServiceClass(port);
  const config = CLASS_CONFIG[serviceClass];
  const matrixScore = config.likelihood * config.impact;

  return {
    service_key: exposureServiceKey(port),
    open_port_id: String(port.id || "").trim() || null,
    host: String(port.host || "").trim() || null,
    ip: String(port.ip || "").trim() || null,
    port: Math.round(Number(port.port || 0)),
    protocol: normalizedProtocol(port.protocol),
    service_name: String(port.service_name || "").trim() || null,
    service_product: String(port.service_product || "").trim() || null,
    service_version: String(port.service_version || "").trim() || null,
    service_class: serviceClass,
    service_class_label: config.label,
    likelihood: config.likelihood,
    impact: config.impact,
    matrix_score: matrixScore,
    severity: severityFromMatrixScore(matrixScore),
    evidence_status: evidenceStatus,
    rationale: config.rationale,
    remediation: config.remediation,
  };
}

export function severityForExposedService(port: ExposureMatrixPort): ExposureMatrixSeverity {
  return assessExposedService(port).severity;
}

export function remediationForExposedService(port: ExposureMatrixPort): string {
  return assessExposedService(port).remediation;
}
