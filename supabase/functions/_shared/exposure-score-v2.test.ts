import { computeExposureScoreV2 } from "./exposure-score-v2.ts";

Deno.test("ET_NEW web-only exposure stays near 98 posture without invented CVEs", () => {
  const result = computeExposureScoreV2({
    ports: [
      { host: "etruriaretail.it", port: 80, protocol: "tcp", is_web: true },
      {
        host: "etruriaretail.it",
        port: 443,
        protocol: "tcp",
        is_web: true,
        is_tls: true,
      },
    ],
  });

  if (result.posture_score !== 98) {
    throw new Error(`Expected 98, got ${result.posture_score}`);
  }
  if (result.risk_level !== "Basso") {
    throw new Error(`Expected Basso, got ${result.risk_level}`);
  }
  if (result.risk_breakdown.missing_data.points <= 0) {
    throw new Error("Expected a small uncertainty penalty");
  }
  if (result.vulnerability_summary.confirmed !== 0) {
    throw new Error("Unexpected confirmed CVE");
  }
  if (result.vulnerability_summary.unknown !== 2) {
    throw new Error("Expected two unknown services");
  }
});

Deno.test("confirmed critical KEV on HTTPS produces critical risk with CVSS and EPSS evidence", () => {
  const result = computeExposureScoreV2({
    ports: [{
      id: "port-443",
      host: "example.it",
      port: 443,
      protocol: "tcp",
      is_web: true,
      is_tls: true,
    }],
    vulnerabilityMatches: [{
      open_port_id: "port-443",
      host: "example.it",
      port: 443,
      protocol: "tcp",
      cve_id: "CVE-2026-0001",
      match_status: "confirmed",
      cvss_score: 9.8,
      epss_percentile: 0.98,
      epss_score: 0.91,
      cisa_kev: true,
    }],
  });

  if (result.risk_level !== "Critico") {
    throw new Error(`Expected Critico, got ${result.risk_level}`);
  }
  if (result.vulnerability_summary.confirmed !== 1) {
    throw new Error("Expected one confirmed CVE");
  }
  if (result.risk_breakdown.kev_epss.points <= 0) {
    throw new Error("Expected KEV/EPSS points");
  }
});

Deno.test("sensitive database exposure is high risk even without a CVE", () => {
  const result = computeExposureScoreV2({
    ports: [{
      host: "db.example.it",
      port: 5432,
      protocol: "tcp",
      service_name: "postgresql",
    }],
  });

  if (result.risk_level !== "Alto") {
    throw new Error(`Expected Alto, got ${result.risk_level}`);
  }
  if (result.risk_breakdown.sensitive_ports.points < 25) {
    throw new Error("Sensitive port was underweighted");
  }
  if (result.vulnerability_summary.confirmed !== 0) {
    throw new Error("Exposure was mislabeled as vulnerable");
  }
});

Deno.test("candidate CVEs receive half weight", () => {
  const baseMatch = {
    open_port_id: "port-443",
    host: "example.it",
    port: 443,
    protocol: "tcp",
    cve_id: "CVE-2026-0002",
    cvss_score: 8,
    epss_percentile: 0.5,
    cisa_kev: false,
  } as const;
  const confirmed = computeExposureScoreV2({
    ports: [{ id: "port-443", host: "example.it", port: 443, protocol: "tcp" }],
    vulnerabilityMatches: [{ ...baseMatch, match_status: "confirmed" }],
  });
  const candidate = computeExposureScoreV2({
    ports: [{ id: "port-443", host: "example.it", port: 443, protocol: "tcp" }],
    vulnerabilityMatches: [{ ...baseMatch, match_status: "candidate" }],
  });

  const confirmedVulnerabilityPoints =
    confirmed.risk_breakdown.confirmed_cves.points +
    confirmed.risk_breakdown.kev_epss.points;
  const candidateVulnerabilityPoints =
    candidate.risk_breakdown.candidate_cves.points +
    candidate.risk_breakdown.kev_epss.points;
  if (candidateVulnerabilityPoints !== confirmedVulnerabilityPoints / 2) {
    throw new Error("Candidate match did not receive half weight");
  }
});
