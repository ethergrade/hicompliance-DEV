import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  calculateFindingRiskScore,
  inferCompromiseType,
  inferRiskDimensions,
} from "./darkrisk-scoring.ts";
import { mapSurfaceSeverity, riskScoreFromSeverity } from "./darkrisk-utils.ts";

Deno.test("scoring handles critical credential leak with high risk", () => {
  const score = calculateFindingRiskScore({
    severity: "critical",
    confidence: "high",
    freshnessDays: 1,
    recurrenceCount: 12,
    affectedAssetCriticality: "high",
    isDirectCompromise: true,
    isThirdPartyOnly: false,
  });

  assert(score >= 95 && score <= 100);
});

Deno.test("scoring handles high stealer-like signal", () => {
  const score = calculateFindingRiskScore({
    severity: "high",
    confidence: "medium",
    freshnessDays: 5,
    recurrenceCount: 4,
    affectedAssetCriticality: "medium",
    isDirectCompromise: false,
    isThirdPartyOnly: false,
  });

  assert(score >= 70);
});

Deno.test("third-party exposure gets lower score than direct comparable finding", () => {
  const direct = calculateFindingRiskScore({
    severity: "medium",
    confidence: "high",
    freshnessDays: 15,
    recurrenceCount: 3,
    affectedAssetCriticality: "medium",
    isDirectCompromise: true,
    isThirdPartyOnly: false,
  });

  const thirdParty = calculateFindingRiskScore({
    severity: "medium",
    confidence: "high",
    freshnessDays: 15,
    recurrenceCount: 3,
    affectedAssetCriticality: "medium",
    isDirectCompromise: false,
    isThirdPartyOnly: true,
  });

  assert(thirdParty < direct);
});

Deno.test("compromise and risk dimension inference covers FTP/DMARC/TLS", () => {
  const ftpType = inferCompromiseType({
    findingType: "open_port_ftp",
    title: "FTP exposed on Internet",
    module: "surface_exposure_engine",
  });
  assertEquals(ftpType, "misconfiguration");

  const dmarcDimensions = inferRiskDimensions({
    findingType: "dmarc_missing",
    title: "DMARC missing",
    module: "mail_security",
    confidence: "high",
    freshnessDays: 2,
  });
  assert(dmarcDimensions.email_trust >= 70);

  const tlsDimensions = inferRiskDimensions({
    findingType: "tls_certificate_mismatch",
    title: "TLS certificate mismatch",
    module: "tls",
    confidence: "medium",
    freshnessDays: 20,
  });
  assert(tlsDimensions.surface_posture >= 70);
});

Deno.test("score bounds stay in 0-100", () => {
  const minScore = calculateFindingRiskScore({
    severity: "info",
    confidence: "low",
    freshnessDays: 500,
    recurrenceCount: 0,
    affectedAssetCriticality: "low",
    isDirectCompromise: false,
    isThirdPartyOnly: true,
  });

  const maxScore = calculateFindingRiskScore({
    severity: "critical",
    confidence: "high",
    freshnessDays: 0,
    recurrenceCount: 99,
    affectedAssetCriticality: "high",
    isDirectCompromise: true,
    isThirdPartyOnly: false,
  });

  assert(minScore >= 0 && minScore <= 100);
  assert(maxScore >= 0 && maxScore <= 100);
});

Deno.test("severity mapping helpers stay consistent", () => {
  assertEquals(mapSurfaceSeverity("CRITICAL"), "critical");
  assertEquals(mapSurfaceSeverity("High"), "high");
  assertEquals(mapSurfaceSeverity("MEDIUM"), "medium");
  assertEquals(mapSurfaceSeverity("unknown"), "info");

  assertEquals(riskScoreFromSeverity("critical"), 95);
  assertEquals(riskScoreFromSeverity("high"), 80);
  assertEquals(riskScoreFromSeverity("medium"), 55);
  assertEquals(riskScoreFromSeverity("low"), 25);
  assertEquals(riskScoreFromSeverity("info"), 10);
});
