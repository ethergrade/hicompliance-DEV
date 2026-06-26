export type ExposureRiskLevel = "Basso" | "Medio" | "Alto" | "Critico";
export type VulnerabilityMatchStatus =
  | "confirmed"
  | "candidate"
  | "unknown"
  | "rejected";

export type ExposureScorePort = {
  id?: string | null;
  host?: string | null;
  ip?: string | null;
  port: number;
  protocol?: string | null;
  service_name?: string | null;
  service_product?: string | null;
  service_version?: string | null;
  banner?: string | null;
  is_web?: boolean | null;
  is_tls?: boolean | null;
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

export type ExposureScoreV2Result = {
  posture_score: number;
  risk_level: ExposureRiskLevel;
  risk_points: number;
  risk_breakdown: {
    web_ports: ExposureRiskComponent;
    alternative_web_ports: ExposureRiskComponent;
    admin_web_ports: ExposureRiskComponent;
    sensitive_ports: ExposureRiskComponent;
    other_services: ExposureRiskComponent;
    tls_header: ExposureRiskComponent;
    findings: ExposureRiskComponent & { by_severity: Record<string, number> };
    confirmed_cves: ExposureRiskComponent;
    candidate_cves: ExposureRiskComponent;
    kev_epss: ExposureRiskComponent;
    delta: ExposureRiskComponent;
    missing_data: ExposureRiskComponent;
  };
  vulnerability_summary: {
    confirmed: number;
    candidate: number;
    unknown: number;
    not_vulnerable_evidence: number;
    services_total: number;
    explanation: string;
  };
};

const STANDARD_WEB_PORTS = new Set([80, 443]);
const ALTERNATIVE_WEB_PORTS = new Set([8000, 8080, 8081, 8888]);
const ADMIN_WEB_PORTS = new Set([2375, 2376, 6443, 8443, 9000, 9090, 9443]);

const SENSITIVE_PORT_POINTS: Record<number, number> = {
  21: 15,
  22: 10,
  23: 25,
  111: 15,
  135: 15,
  139: 20,
  445: 25,
  1433: 25,
  1521: 25,
  2049: 20,
  2375: 25,
  3306: 25,
  3389: 25,
  5432: 25,
  5900: 20,
  5985: 20,
  5986: 20,
  6379: 25,
  9200: 25,
  9300: 25,
  11211: 25,
  27017: 25,
};

const FINDING_POINTS: Record<string, number> = {
  critical: 25,
  high: 12,
  medium: 6,
  low: 2,
  info: 0.5,
};

const PORT_EVIDENCE_FINDINGS = new Set([
  "open_port_exposed",
  "service_fingerprint_exposed",
  "sensitive_port_exposed",
]);

function roundOne(value: number): number {
  return Math.round((Number(value) + Number.EPSILON) * 10) / 10;
}

function bounded(value: unknown, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return min;
  return Math.min(max, Math.max(min, parsed));
}

function normalizedProtocol(value: unknown): string {
  return String(value || "tcp").trim().toLowerCase() || "tcp";
}

export function exposureServiceKey(value: {
  open_port_id?: string | null;
  host?: string | null;
  ip?: string | null;
  port: number;
  protocol?: string | null;
}): string {
  const id = String(value.open_port_id || "").trim();
  if (id) return `id:${id}`;
  return [
    String(value.host || "").trim().toLowerCase(),
    String(value.ip || "").trim().toLowerCase(),
    Math.round(Number(value.port || 0)),
    normalizedProtocol(value.protocol),
  ].join("|");
}

export function riskLevelFromRiskPoints(points: number): ExposureRiskLevel {
  const risk = bounded(points, 0, 100);
  if (risk >= 60) return "Critico";
  if (risk >= 25) return "Alto";
  if (risk >= 11) return "Medio";
  return "Basso";
}

function serviceDetail(
  port: ExposureScorePort,
  points: number,
): Record<string, unknown> {
  return {
    host: port.host || null,
    ip: port.ip || null,
    port: Number(port.port),
    protocol: normalizedProtocol(port.protocol),
    service: port.service_product || port.service_name || null,
    version: port.service_version || null,
    points: roundOne(points),
  };
}

function matchDetail(
  match: ExposureVulnerabilityMatch,
  points: number,
): Record<string, unknown> {
  return {
    host: match.host || null,
    ip: match.ip || null,
    port: Number(match.port),
    protocol: normalizedProtocol(match.protocol),
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

export function computeExposureScoreV2(input: {
  ports?: ExposureScorePort[];
  findings?: ExposureScoreFinding[];
  vulnerabilityMatches?: ExposureVulnerabilityMatch[];
  newOpenPorts?: number;
  tlsHeaderWeaknesses?: number;
}): ExposureScoreV2Result {
  const ports = input.ports || [];
  const findings = input.findings || [];
  const matches = input.vulnerabilityMatches || [];

  const webPorts: ExposureRiskComponent = { count: 0, points: 0, details: [] };
  const alternativeWebPorts: ExposureRiskComponent = {
    count: 0,
    points: 0,
    details: [],
  };
  const adminWebPorts: ExposureRiskComponent = {
    count: 0,
    points: 0,
    details: [],
  };
  const sensitivePorts: ExposureRiskComponent = {
    count: 0,
    points: 0,
    details: [],
  };
  const otherServices: ExposureRiskComponent = {
    count: 0,
    points: 0,
    details: [],
  };

  const uniquePorts = new Map<string, ExposureScorePort>();
  for (const port of ports) {
    const portNumber = Math.round(Number(port.port || 0));
    if (portNumber <= 0 || portNumber > 65535) continue;
    uniquePorts.set(exposureServiceKey({ ...port, port: portNumber }), {
      ...port,
      port: portNumber,
    });
  }

  for (const port of uniquePorts.values()) {
    const portNumber = Number(port.port);
    const sensitivePoints = SENSITIVE_PORT_POINTS[portNumber];
    let component = otherServices;
    let points = 0;

    if (sensitivePoints != null) {
      component = sensitivePorts;
      points = sensitivePoints;
    } else if (ADMIN_WEB_PORTS.has(portNumber)) {
      component = adminWebPorts;
      points = 10;
    } else if (ALTERNATIVE_WEB_PORTS.has(portNumber)) {
      component = alternativeWebPorts;
      points = 4;
    } else if (STANDARD_WEB_PORTS.has(portNumber)) {
      component = webPorts;
      points = 1;
    } else if (port.is_web) {
      component = alternativeWebPorts;
      points = 4;
    }

    component.count += 1;
    component.points += points;
    component.details!.push(serviceDetail(port, points));
  }

  const findingBySeverity: Record<string, number> = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    info: 0,
  };
  let findingPoints = 0;
  let scoredFindings = 0;
  for (const finding of findings) {
    const type = String(finding.finding_type || "").trim().toLowerCase();
    if (PORT_EVIDENCE_FINDINGS.has(type)) continue;
    const severity = String(finding.severity || "info").trim().toLowerCase();
    const normalizedSeverity = FINDING_POINTS[severity] == null
      ? "info"
      : severity;
    findingBySeverity[normalizedSeverity] += 1;
    findingPoints += FINDING_POINTS[normalizedSeverity];
    scoredFindings += 1;
  }

  const matchesByService = new Map<string, ExposureVulnerabilityMatch[]>();
  for (const match of matches) {
    const key = exposureServiceKey(match);
    if (!matchesByService.has(key)) matchesByService.set(key, []);
    matchesByService.get(key)!.push(match);
  }

  const confirmedCves: ExposureRiskComponent = {
    count: 0,
    points: 0,
    details: [],
  };
  const candidateCves: ExposureRiskComponent = {
    count: 0,
    points: 0,
    details: [],
  };
  const kevEpss: ExposureRiskComponent = { count: 0, points: 0, details: [] };
  let rejectedMatches = 0;
  const servicesWithVulnerabilityEvidence = new Set<string>();

  for (const [serviceKey, serviceMatches] of matchesByService.entries()) {
    const scored = serviceMatches.filter((match) =>
      (match.match_status === "confirmed" ||
        match.match_status === "candidate") && Boolean(match.cve_id)
    );
    if (scored.length === 0) {
      rejectedMatches += serviceMatches.filter((match) =>
        match.match_status === "rejected"
      ).length;
      continue;
    }

    servicesWithVulnerabilityEvidence.add(serviceKey);
    let servicePoints = 0;
    for (const match of scored) {
      const cvssPoints = bounded(match.cvss_score, 0, 10) * 4;
      const epssPercentile = bounded(match.epss_percentile, 0, 1);
      const threatPoints = epssPercentile * 10 + (match.cisa_kev ? 25 : 0);
      const weight = match.match_status === "candidate" ? 0.5 : 1;
      const remaining = Math.max(0, 60 - servicePoints);
      const totalForMatch = Math.min(
        remaining,
        (cvssPoints + threatPoints) * weight,
      );
      if (totalForMatch <= 0) continue;

      const cvssPart = Math.min(totalForMatch, cvssPoints * weight);
      const threatPart = Math.max(0, totalForMatch - cvssPart);
      const component = match.match_status === "confirmed"
        ? confirmedCves
        : candidateCves;
      component.count += 1;
      component.points += cvssPart;
      component.details!.push(matchDetail(match, totalForMatch));
      if (threatPart > 0) {
        kevEpss.count += 1;
        kevEpss.points += threatPart;
        kevEpss.details!.push(matchDetail(match, threatPart));
      }
      servicePoints += totalForMatch;
      if (servicePoints >= 60) break;
    }
  }

  let unknownServices = 0;
  for (const [key, port] of uniquePorts.entries()) {
    const serviceMatches = matchesByService.get(key) || [];
    const hasConfirmedOrCandidate = serviceMatches.some((match) =>
      (match.match_status === "confirmed" ||
        match.match_status === "candidate") && Boolean(match.cve_id)
    );
    const hasRejected = serviceMatches.some((match) =>
      match.match_status === "rejected"
    );
    if (!hasConfirmedOrCandidate && !hasRejected) unknownServices += 1;
    if (
      !hasConfirmedOrCandidate &&
      (!port.service_product || !port.service_version)
    ) {
      servicesWithVulnerabilityEvidence.delete(key);
    }
  }

  const newOpenPorts = Math.max(0, Math.floor(Number(input.newOpenPorts || 0)));
  const deltaPoints = Math.min(5, newOpenPorts);
  const tlsHeaderWeaknesses = Math.max(
    0,
    Math.floor(Number(input.tlsHeaderWeaknesses || 0)),
  );
  const tlsHeaderPoints = Math.min(12, tlsHeaderWeaknesses * 3);
  const missingDataPoints = Math.min(2, unknownServices * 0.25);

  const servicePoints = webPorts.points +
    alternativeWebPorts.points +
    adminWebPorts.points +
    sensitivePorts.points +
    otherServices.points;
  const riskPoints = Math.min(
    100,
    servicePoints +
      findingPoints +
      confirmedCves.points +
      candidateCves.points +
      kevEpss.points +
      deltaPoints +
      tlsHeaderPoints +
      missingDataPoints,
  );
  const roundedRiskPoints = roundOne(riskPoints);
  const postureScore = Math.max(0, Math.min(100, Math.round(100 - riskPoints)));
  const confirmedCount = confirmedCves.count;
  const candidateCount = candidateCves.count;

  const explanationParts = [
    `${uniquePorts.size} servizi esposti`,
    confirmedCount > 0
      ? `${confirmedCount} CVE confermate`
      : "nessuna vulnerabilita confermata",
  ];
  if (candidateCount > 0) {
    explanationParts.push(`${candidateCount} CVE candidate da validare`);
  }
  if (unknownServices > 0) {
    explanationParts.push(
      `versione/prodotto non determinati per ${unknownServices} servizi`,
    );
  }

  const normalizeComponent = (
    component: ExposureRiskComponent,
  ): ExposureRiskComponent => ({
    ...component,
    points: roundOne(component.points),
  });

  return {
    posture_score: postureScore,
    risk_level: riskLevelFromRiskPoints(roundedRiskPoints),
    risk_points: roundedRiskPoints,
    risk_breakdown: {
      web_ports: normalizeComponent(webPorts),
      alternative_web_ports: normalizeComponent(alternativeWebPorts),
      admin_web_ports: normalizeComponent(adminWebPorts),
      sensitive_ports: normalizeComponent(sensitivePorts),
      other_services: normalizeComponent(otherServices),
      tls_header: {
        count: tlsHeaderWeaknesses,
        points: roundOne(tlsHeaderPoints),
      },
      findings: {
        count: scoredFindings,
        points: roundOne(findingPoints),
        by_severity: findingBySeverity,
      },
      confirmed_cves: normalizeComponent(confirmedCves),
      candidate_cves: normalizeComponent(candidateCves),
      kev_epss: normalizeComponent(kevEpss),
      delta: { count: newOpenPorts, points: roundOne(deltaPoints) },
      missing_data: {
        count: unknownServices,
        points: roundOne(missingDataPoints),
        details: Array.from(uniquePorts.entries())
          .filter(([key]) => !servicesWithVulnerabilityEvidence.has(key))
          .map(([, port]) => serviceDetail(port, 0)),
      },
    },
    vulnerability_summary: {
      confirmed: confirmedCount,
      candidate: candidateCount,
      unknown: unknownServices,
      not_vulnerable_evidence: rejectedMatches,
      services_total: uniquePorts.size,
      explanation: `${explanationParts.join(", ")}.`,
    },
  };
}
