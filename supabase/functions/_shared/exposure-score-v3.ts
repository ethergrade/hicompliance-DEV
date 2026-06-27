import {
  assessExposedService,
  exposureServiceKey,
  type ExposureEvidenceStatus,
  type ExposureMatrixPort,
  type ServiceExposureAssessment,
} from "./service-exposure-matrix.ts";

export type ExposureRiskLevel = "Basso" | "Medio" | "Alto" | "Critico";
export type VulnerabilityMatchStatus = "confirmed" | "candidate" | "unknown" | "rejected";

export type ExposureScorePort = ExposureMatrixPort & {
  banner?: string | null;
};

export type ExposureScoreFinding = {
  severity?: string | null;
  finding_type?: string | null;
};

export type ExposureVulnerabilityMatch = {
  open_port_id?: string | null;
  host?: string | null;
  ip?: string | null;
  port: number;
  protocol?: string | null;
  cve_id?: string | null;
  match_status: VulnerabilityMatchStatus;
  cvss_score?: number | null;
  epss_score?: number | null;
  epss_percentile?: number | null;
  cisa_kev?: boolean | null;
  service_product?: string | null;
  service_version?: string | null;
  cpe_name?: string | null;
  match_confidence?: number | null;
};

export type ExposureRiskComponent = {
  count: number;
  points: number;
  details?: Array<Record<string, unknown>>;
};

export type ServiceExposureFinding = {
  id: string;
  scan_job_id: string | null;
  finding_type: "internet_exposed_service";
  title: string;
  severity: "low" | "medium" | "high" | "critical";
  cvss: null;
  cve_ids: string[];
  affected_host: string | null;
  affected_port: number;
  affected_protocol: string;
  affected_url: null;
  description: string;
  evidence: string;
  recommendation: string;
  source: "surface_exposure_matrix_v3";
  status: "open";
  created_at: string;
  service_key: string;
  service_class: ServiceExposureAssessment["service_class"];
  service_class_label: string;
  likelihood: number;
  impact: number;
  matrix_score: number;
  evidence_status: ExposureEvidenceStatus;
};

export type ExposureScoreV3Result = {
  score_version: "3.0";
  posture_score: number;
  risk_level: ExposureRiskLevel;
  risk_points: number;
  risk_breakdown: {
    service_exposure: ExposureRiskComponent & {
      primary_points: number;
      breadth_points: number;
    };
    uncertainty: ExposureRiskComponent;
    verified_findings: ExposureRiskComponent & { by_severity: Record<string, number> };
    confirmed_cves: ExposureRiskComponent;
    candidate_cves: ExposureRiskComponent;
    threat_intel: ExposureRiskComponent;
    delta: ExposureRiskComponent;
  };
  vulnerability_summary: {
    exposure_findings: number;
    confirmed: number;
    candidate: number;
    unknown: number;
    fingerprint_unknown: number;
    not_vulnerable_evidence: number;
    services_total: number;
    explanation: string;
  };
  service_assessments: ServiceExposureAssessment[];
  exposure_findings: ServiceExposureFinding[];
};

const FINDING_POINTS: Record<string, number> = {
  critical: 25,
  high: 12,
  medium: 6,
  low: 2,
  info: 0.5,
};

const PORT_ONLY_FINDINGS = new Set([
  "internet_exposed_service",
  "open_port_exposed",
  "service_fingerprint_exposed",
  "sensitive_port_exposed",
]);

const CVE_FINDINGS = new Set([
  "known_cve",
  "vulnerability_detected",
  "shodan_cve_signal",
  "shodan_cve_signal_domain",
  "shodan_cve_signal_ip",
  "shodan_cve_signal_unattributed",
]);

function roundOne(value: number): number {
  return Math.round((Number(value) + Number.EPSILON) * 10) / 10;
}

function bounded(value: unknown, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return min;
  return Math.min(max, Math.max(min, parsed));
}

function stableId(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function matchDetail(match: ExposureVulnerabilityMatch, points: number): Record<string, unknown> {
  return {
    host: match.host || null,
    ip: match.ip || null,
    port: Number(match.port),
    protocol: String(match.protocol || "tcp").toLowerCase(),
    cve_id: match.cve_id || null,
    status: match.match_status,
    cvss: match.cvss_score ?? null,
    epss: match.epss_score ?? null,
    epss_percentile: match.epss_percentile ?? null,
    cisa_kev: Boolean(match.cisa_kev),
    product: match.service_product || null,
    version: match.service_version || null,
    cpe: match.cpe_name || null,
    confidence: match.match_confidence ?? null,
    points: roundOne(points),
  };
}

export function riskLevelFromRiskPoints(points: number): ExposureRiskLevel {
  const risk = bounded(points, 0, 100);
  if (risk >= 60) return "Critico";
  if (risk >= 25) return "Alto";
  if (risk >= 11) return "Medio";
  return "Basso";
}

function matchesForPort(
  port: ExposureScorePort,
  matchesByPortId: Map<string, ExposureVulnerabilityMatch[]>,
  matchesByServiceKey: Map<string, ExposureVulnerabilityMatch[]>,
): ExposureVulnerabilityMatch[] {
  const portId = String(port.id || "").trim();
  if (portId && matchesByPortId.has(portId)) return matchesByPortId.get(portId)!;
  return matchesByServiceKey.get(exposureServiceKey(port)) || [];
}

function evidenceStatusForPort(port: ExposureScorePort, matches: ExposureVulnerabilityMatch[]): ExposureEvidenceStatus {
  if (matches.some((match) => match.match_status === "confirmed" && Boolean(match.cve_id))) return "cve_confirmed";
  if (matches.some((match) => match.match_status === "candidate" && Boolean(match.cve_id))) return "cve_candidate";
  if (matches.some((match) => match.match_status === "rejected")) return "no_known_cve";
  if (!port.service_product || !port.service_version || matches.some((match) => match.match_status === "unknown")) {
    return "fingerprint_unknown";
  }
  return "exposure_only";
}

function buildExposureFinding(port: ExposureScorePort, assessment: ServiceExposureAssessment): ServiceExposureFinding {
  const host = assessment.host || assessment.ip || "host non determinato";
  const service = assessment.service_product || assessment.service_name;
  const protocol = assessment.protocol.toLowerCase();
  return {
    id: `exposure-v3-${stableId(assessment.service_key)}`,
    scan_job_id: String(port.scan_job_id || "").trim() || null,
    finding_type: "internet_exposed_service",
    title: `Esposizione di servizio: ${host}:${assessment.port}/${protocol}${service ? ` (${service})` : ""}`,
    severity: assessment.severity,
    cvss: null,
    cve_ids: [],
    affected_host: assessment.host || assessment.ip,
    affected_port: assessment.port,
    affected_protocol: protocol,
    affected_url: null,
    description: assessment.rationale,
    evidence: `Servizio raggiungibile su ${assessment.port}/${protocol}; classe ${assessment.service_class_label}; matrice ${assessment.likelihood} × ${assessment.impact} = ${assessment.matrix_score}; stato evidenza ${assessment.evidence_status}.`,
    recommendation: assessment.remediation,
    source: "surface_exposure_matrix_v3",
    status: "open",
    created_at: String(port.last_seen_at || new Date(0).toISOString()),
    service_key: assessment.service_key,
    service_class: assessment.service_class,
    service_class_label: assessment.service_class_label,
    likelihood: assessment.likelihood,
    impact: assessment.impact,
    matrix_score: assessment.matrix_score,
    evidence_status: assessment.evidence_status,
  };
}

export function computeExposureScoreV3(input: {
  ports?: ExposureScorePort[];
  findings?: ExposureScoreFinding[];
  vulnerabilityMatches?: ExposureVulnerabilityMatch[];
  newOpenPorts?: number;
}): ExposureScoreV3Result {
  const findings = input.findings || [];
  const matches = input.vulnerabilityMatches || [];
  const uniquePorts = new Map<string, ExposureScorePort>();
  for (const port of input.ports || []) {
    const portNumber = Math.round(Number(port.port || 0));
    if (portNumber < 1 || portNumber > 65535) continue;
    const normalized = { ...port, port: portNumber };
    const key = exposureServiceKey(normalized);
    const existing = uniquePorts.get(key);
    const incomingFingerprint = Number(Boolean(port.service_product)) + Number(Boolean(port.service_version));
    const existingFingerprint = Number(Boolean(existing?.service_product)) + Number(Boolean(existing?.service_version));
    if (!existing || incomingFingerprint >= existingFingerprint) uniquePorts.set(key, normalized);
  }

  const matchesByPortId = new Map<string, ExposureVulnerabilityMatch[]>();
  const matchesByServiceKey = new Map<string, ExposureVulnerabilityMatch[]>();
  for (const match of matches) {
    const portId = String(match.open_port_id || "").trim();
    if (portId) {
      if (!matchesByPortId.has(portId)) matchesByPortId.set(portId, []);
      matchesByPortId.get(portId)!.push(match);
    }
    const key = exposureServiceKey(match);
    if (!matchesByServiceKey.has(key)) matchesByServiceKey.set(key, []);
    matchesByServiceKey.get(key)!.push(match);
  }

  const serviceAssessments: ServiceExposureAssessment[] = [];
  const exposureFindings: ServiceExposureFinding[] = [];
  let unknownServices = 0;
  let fingerprintUnknown = 0;
  let servicesWithNoKnownCve = 0;
  for (const port of uniquePorts.values()) {
    const serviceMatches = matchesForPort(port, matchesByPortId, matchesByServiceKey);
    const evidenceStatus = evidenceStatusForPort(port, serviceMatches);
    if (evidenceStatus === "fingerprint_unknown") fingerprintUnknown += 1;
    if (evidenceStatus === "fingerprint_unknown" || evidenceStatus === "exposure_only") unknownServices += 1;
    if (evidenceStatus === "no_known_cve") servicesWithNoKnownCve += 1;
    const assessment = assessExposedService(port, evidenceStatus);
    serviceAssessments.push(assessment);
    exposureFindings.push(buildExposureFinding(port, assessment));
  }

  serviceAssessments.sort((a, b) => b.matrix_score - a.matrix_score || a.service_key.localeCompare(b.service_key));
  exposureFindings.sort((a, b) => b.matrix_score - a.matrix_score || a.service_key.localeCompare(b.service_key));

  const highestMatrixScore = serviceAssessments[0]?.matrix_score || 0;
  const primaryPoints = serviceAssessments.length > 0 ? 30 * (highestMatrixScore / 25) : 0;
  const breadthPoints = serviceAssessments.length > 1
    ? Math.min(10, 1.5 * serviceAssessments.slice(1).reduce((sum, item) => sum + item.matrix_score / 25, 0))
    : 0;
  const serviceExposurePoints = Math.min(40, primaryPoints + breadthPoints);
  const uncertaintyPoints = unknownServices > 0
    ? Math.min(5, 1 + 0.75 * Math.log2(unknownServices + 1))
    : 0;

  const findingBySeverity: Record<string, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  let verifiedFindingPoints = 0;
  let verifiedFindingCount = 0;
  for (const finding of findings) {
    const type = String(finding.finding_type || "").trim().toLowerCase();
    if (PORT_ONLY_FINDINGS.has(type) || CVE_FINDINGS.has(type)) continue;
    const rawSeverity = String(finding.severity || "info").trim().toLowerCase();
    const severity = FINDING_POINTS[rawSeverity] == null ? "info" : rawSeverity;
    findingBySeverity[severity] += 1;
    verifiedFindingPoints += FINDING_POINTS[severity];
    verifiedFindingCount += 1;
  }
  verifiedFindingPoints = Math.min(30, verifiedFindingPoints);

  const confirmedCves: ExposureRiskComponent = { count: 0, points: 0, details: [] };
  const candidateCves: ExposureRiskComponent = { count: 0, points: 0, details: [] };
  const threatIntel: ExposureRiskComponent = { count: 0, points: 0, details: [] };
  const scoredMatchesByService = new Map<string, ExposureVulnerabilityMatch[]>();
  for (const match of matches) {
    if (!match.cve_id || (match.match_status !== "confirmed" && match.match_status !== "candidate")) continue;
    const key = String(match.open_port_id || "").trim() || exposureServiceKey(match);
    if (!scoredMatchesByService.has(key)) scoredMatchesByService.set(key, []);
    scoredMatchesByService.get(key)!.push(match);
  }

  for (const serviceMatches of scoredMatchesByService.values()) {
    let servicePoints = 0;
    const uniqueCves = new Set<string>();
    for (const match of serviceMatches) {
      const cveId = String(match.cve_id || "").toUpperCase();
      if (!cveId || uniqueCves.has(`${match.match_status}|${cveId}`)) continue;
      uniqueCves.add(`${match.match_status}|${cveId}`);
      const weight = match.match_status === "candidate" ? 0.5 : 1;
      const cvssPoints = bounded(match.cvss_score, 0, 10) * 4 * weight;
      const threatPoints = (bounded(match.epss_percentile, 0, 1) * 10 + (match.cisa_kev ? 25 : 0)) * weight;
      const remaining = Math.max(0, 60 - servicePoints);
      const totalForMatch = Math.min(remaining, cvssPoints + threatPoints);
      if (totalForMatch <= 0) continue;
      const cvssPart = Math.min(totalForMatch, cvssPoints);
      const threatPart = Math.max(0, totalForMatch - cvssPart);
      const component = match.match_status === "confirmed" ? confirmedCves : candidateCves;
      component.count += 1;
      component.points += cvssPart;
      component.details!.push(matchDetail(match, totalForMatch));
      if (threatPart > 0) {
        threatIntel.count += 1;
        threatIntel.points += threatPart;
        threatIntel.details!.push(matchDetail(match, threatPart));
      }
      servicePoints += totalForMatch;
      if (servicePoints >= 60) break;
    }
  }

  const newOpenPorts = Math.max(0, Math.floor(Number(input.newOpenPorts || 0)));
  const deltaPoints = Math.min(5, newOpenPorts);
  const riskPoints = Math.min(
    100,
    serviceExposurePoints + uncertaintyPoints + verifiedFindingPoints +
      confirmedCves.points + candidateCves.points + threatIntel.points + deltaPoints,
  );
  const roundedRiskPoints = roundOne(riskPoints);
  const confirmedCount = confirmedCves.count;
  const candidateCount = candidateCves.count;
  const explanation = [
    `${serviceAssessments.length} esposizioni di servizio`,
    confirmedCount > 0 ? `${confirmedCount} CVE confermate` : "nessuna CVE confermata",
    candidateCount > 0 ? `${candidateCount} CVE candidate` : "nessuna CVE candidata",
    fingerprintUnknown > 0 ? `${fingerprintUnknown} servizi da fingerprintare` : null,
    servicesWithNoKnownCve > 0 ? `${servicesWithNoKnownCve} servizi verificati senza CVE note` : null,
  ].filter(Boolean).join(", ");

  const normalizeComponent = (component: ExposureRiskComponent): ExposureRiskComponent => ({
    ...component,
    points: roundOne(component.points),
  });

  return {
    score_version: "3.0",
    posture_score: Math.max(0, Math.min(100, Math.round(100 - roundedRiskPoints))),
    risk_level: riskLevelFromRiskPoints(roundedRiskPoints),
    risk_points: roundedRiskPoints,
    risk_breakdown: {
      service_exposure: {
        count: serviceAssessments.length,
        points: roundOne(serviceExposurePoints),
        primary_points: roundOne(primaryPoints),
        breadth_points: roundOne(breadthPoints),
        details: serviceAssessments as unknown as Array<Record<string, unknown>>,
      },
      uncertainty: { count: unknownServices, points: roundOne(uncertaintyPoints) },
      verified_findings: {
        count: verifiedFindingCount,
        points: roundOne(verifiedFindingPoints),
        by_severity: findingBySeverity,
      },
      confirmed_cves: normalizeComponent(confirmedCves),
      candidate_cves: normalizeComponent(candidateCves),
      threat_intel: normalizeComponent(threatIntel),
      delta: { count: newOpenPorts, points: roundOne(deltaPoints) },
    },
    vulnerability_summary: {
      exposure_findings: serviceAssessments.length,
      confirmed: confirmedCount,
      candidate: candidateCount,
      unknown: unknownServices,
      fingerprint_unknown: fingerprintUnknown,
      not_vulnerable_evidence: servicesWithNoKnownCve,
      services_total: serviceAssessments.length,
      explanation: `${explanation}.`,
    },
    service_assessments: serviceAssessments,
    exposure_findings: exposureFindings,
  };
}
