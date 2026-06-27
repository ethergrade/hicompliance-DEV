import { computeExposureScoreV3 } from "./exposure-score-v3.ts";

Deno.test("34 HTTPS services without fingerprint produce actionable medium risk", () => {
  const result = computeExposureScoreV3({
    ports: Array.from({ length: 34 }, (_, index) => ({
      id: `port-${index}`,
      host: `web-${index}.example.it`,
      port: 443,
      protocol: "tcp",
      is_web: true,
      is_tls: true,
    })),
  });

  if (result.score_version !== "3.0") throw new Error("Expected V3 score");
  if (result.posture_score !== 82 || result.risk_points !== 17.6) {
    throw new Error(`Expected posture 82 / risk 17.6, got ${result.posture_score} / ${result.risk_points}`);
  }
  if (result.risk_level !== "Medio") throw new Error(`Expected Medio, got ${result.risk_level}`);
  if (result.exposure_findings.length !== 34) throw new Error("Expected one finding per exposed service");
  if (result.vulnerability_summary.confirmed !== 0 || result.vulnerability_summary.candidate !== 0) {
    throw new Error("Port-only evidence must not invent CVEs");
  }
  if (result.vulnerability_summary.fingerprint_unknown !== 34) {
    throw new Error("Expected all services to require fingerprinting");
  }
});

Deno.test("database exposure is critical per service and high in aggregate without CVEs", () => {
  const result = computeExposureScoreV3({
    ports: [{ host: "db.example.it", port: 5432, protocol: "tcp", service_name: "postgresql" }],
  });

  if (result.risk_level !== "Alto") throw new Error(`Expected Alto, got ${result.risk_level}`);
  if (result.exposure_findings[0]?.severity !== "critical") {
    throw new Error("Expected a critical service exposure finding");
  }
  if (result.vulnerability_summary.confirmed !== 0) throw new Error("Unexpected confirmed CVE");
});

Deno.test("confirmed critical KEV produces critical organization risk", () => {
  const result = computeExposureScoreV3({
    ports: [{ id: "port-443", host: "example.it", port: 443, protocol: "tcp", is_tls: true }],
    vulnerabilityMatches: [{
      open_port_id: "port-443",
      host: "example.it",
      port: 443,
      protocol: "tcp",
      cve_id: "CVE-2026-0001",
      match_status: "confirmed",
      cvss_score: 9.8,
      epss_percentile: 0.98,
      cisa_kev: true,
    }],
  });

  if (result.risk_level !== "Critico") throw new Error(`Expected Critico, got ${result.risk_level}`);
  if (result.vulnerability_summary.confirmed !== 1) throw new Error("Expected one confirmed CVE");
  if (result.service_assessments[0]?.evidence_status !== "cve_confirmed") {
    throw new Error("Expected confirmed evidence status");
  }
});

Deno.test("exact CPE without vulnerable CVEs keeps exposure and marks no known CVE", () => {
  const result = computeExposureScoreV3({
    ports: [{
      id: "port-443",
      host: "example.it",
      port: 443,
      protocol: "tcp",
      service_product: "nginx",
      service_version: "1.26.0",
      is_tls: true,
    }],
    vulnerabilityMatches: [{
      open_port_id: "port-443",
      host: "example.it",
      port: 443,
      protocol: "tcp",
      match_status: "rejected",
      service_product: "nginx",
      service_version: "1.26.0",
    }],
  });

  if (result.exposure_findings.length !== 1) throw new Error("Exposure finding must remain visible");
  if (result.service_assessments[0]?.evidence_status !== "no_known_cve") {
    throw new Error("Expected no_known_cve evidence status");
  }
  if (result.vulnerability_summary.not_vulnerable_evidence !== 1) {
    throw new Error("Expected one service verified without known CVEs");
  }
});

Deno.test("duplicate scanner evidence counts a service once", () => {
  const result = computeExposureScoreV3({
    ports: [
      { id: "shodan", host: "example.it", ip: "192.0.2.1", port: 443, protocol: "tcp", is_tls: true },
      { id: "active", host: "example.it", ip: "192.0.2.1", port: 443, protocol: "tcp", is_tls: true, service_product: "nginx" },
    ],
  });
  if (result.service_assessments.length !== 1 || result.exposure_findings.length !== 1) {
    throw new Error("Expected one deduplicated service");
  }
});

Deno.test("port and TLS evidence are each counted exactly once", () => {
  const result = computeExposureScoreV3({
    ports: [{ host: "example.it", port: 443, protocol: "tcp", is_tls: true }],
    findings: [
      { finding_type: "open_port_exposed", severity: "high" },
      { finding_type: "missing_hsts", severity: "medium" },
    ],
  });
  if (result.risk_breakdown.verified_findings.count !== 1) throw new Error("Expected one verified finding");
  if (result.risk_breakdown.verified_findings.points !== 6) throw new Error("Expected one medium finding contribution");
});
