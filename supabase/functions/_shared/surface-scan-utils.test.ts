import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  classifyTargetScope,
  evaluateHttpSecurityHeaders,
  isIpInRange,
  isIpWithinMonitoredScope,
  normalizeTargetInput,
  splitMonitoredScopeRules,
  summarizeDnssecStatus,
  summarizeThreatSignals,
  summarizeWhoisRdap,
  type MonitoredScopeRule,
  type NormalizedTarget,
} from "./surface-scan-utils.ts";

const makeTarget = (overrides: Partial<NormalizedTarget>): NormalizedTarget => ({
  raw_target: "",
  normalized_target: "",
  target_type: "domain",
  hostname: null,
  root_domain: null,
  protocol: null,
  port: null,
  ...overrides,
});

Deno.test("splitMonitoredScopeRules separates domain and IP rules", () => {
  const rows: MonitoredScopeRule[] = [
    { entry_type: "domain", input_value: "example.com", ip_start: "", ip_end: "" },
    { entry_type: "single", input_value: "198.51.100.10", ip_start: "198.51.100.10", ip_end: "198.51.100.10" },
  ];

  const { scopeDomains, ipScopeRules } = splitMonitoredScopeRules(rows);
  assertEquals(scopeDomains, ["example.com"]);
  assertEquals(ipScopeRules.length, 1);
});

Deno.test("classifyTargetScope allows in-scope domain and blocks out-of-scope domain", () => {
  const domains = ["example.com"];

  const inScopeTarget = makeTarget({
    target_type: "domain",
    hostname: "api.example.com",
  });

  const outOfScopeTarget = makeTarget({
    target_type: "domain",
    hostname: "other.org",
  });

  assertEquals(classifyTargetScope(inScopeTarget, domains, []).allowed, true);
  assertEquals(classifyTargetScope(outOfScopeTarget, domains, []).code, "target_out_of_scope_domain");
});

Deno.test("classifyTargetScope blocks shared-noise hosts with dedicated code", () => {
  const decision = classifyTargetScope(
    makeTarget({
      target_type: "subdomain",
      hostname: "webx1095.aruba.it",
    }),
    ["example.com"],
    [],
  );

  assertEquals(decision.allowed, false);
  assertEquals(decision.code, "target_out_of_scope_shared_noise");
});

Deno.test("isIpInRange and isIpWithinMonitoredScope work for single/range/cidr-expanded rows", () => {
  assertEquals(isIpInRange("198.51.100.15", "198.51.100.10", "198.51.100.20"), true);
  assertEquals(isIpInRange("198.51.100.25", "198.51.100.10", "198.51.100.20"), false);

  const rules: MonitoredScopeRule[] = [
    { entry_type: "single", input_value: "198.51.100.10", ip_start: "198.51.100.10", ip_end: "198.51.100.10" },
    { entry_type: "range", input_value: "198.51.100.20-198.51.100.30", ip_start: "198.51.100.20", ip_end: "198.51.100.30" },
    { entry_type: "cidr", input_value: "198.51.100.0/24", ip_start: "198.51.100.0", ip_end: "198.51.100.255" },
  ];

  assertEquals(isIpWithinMonitoredScope("198.51.100.10", rules), true);
  assertEquals(isIpWithinMonitoredScope("198.51.100.25", rules), true);
  assertEquals(isIpWithinMonitoredScope("198.51.100.200", rules), true);
  assertEquals(isIpWithinMonitoredScope("203.0.113.10", rules), false);
});

Deno.test("classifyTargetScope enforces strict IP scope", () => {
  const rules: MonitoredScopeRule[] = [
    { entry_type: "single", input_value: "198.51.100.10", ip_start: "198.51.100.10", ip_end: "198.51.100.10" },
  ];

  const inScope = classifyTargetScope(
    makeTarget({
      target_type: "ipv4",
      hostname: "198.51.100.10",
    }),
    [],
    rules,
  );

  const outOfScope = classifyTargetScope(
    makeTarget({
      target_type: "ipv4",
      hostname: "203.0.113.44",
    }),
    [],
    rules,
  );

  assertEquals(inScope.code, "ok");
  assertEquals(outOfScope.code, "target_out_of_scope_ip");
});

Deno.test("normalizeTargetInput accepts bare domain", () => {
  const normalized = normalizeTargetInput("hisolution.it");
  assertEquals(normalized.hostname, "hisolution.it");
  assertEquals(normalized.target_type, "domain");
  assertEquals(normalized.protocol, "https:");
});

Deno.test("normalizeTargetInput accepts www subdomain", () => {
  const normalized = normalizeTargetInput("www.hisolution.it");
  assertEquals(normalized.hostname, "www.hisolution.it");
  assertEquals(normalized.target_type, "subdomain");
});

Deno.test("normalizeTargetInput keeps URL shape while stripping unsafe/private cases", () => {
  const normalized = normalizeTargetInput("https://www.hisolution.it/path?a=1");
  assertEquals(normalized.hostname, "www.hisolution.it");
  assertEquals(normalized.target_type, "url");
  assertEquals(normalized.protocol, "https:");
});

Deno.test("normalizeTargetInput accepts public IPv4", () => {
  const normalized = normalizeTargetInput("192.0.2.1");
  assertEquals(normalized.hostname, "192.0.2.1");
  assertEquals(normalized.target_type, "ipv4");
});

Deno.test("normalizeTargetInput parses url with multi-level public suffix", () => {
  const normalized = normalizeTargetInput("http://sub.example.co.uk");
  assertEquals(normalized.hostname, "sub.example.co.uk");
  assertEquals(normalized.target_type, "url");
  assertEquals(normalized.protocol, "http:");
});

Deno.test("summarizeDnssecStatus parses dnskey/ds/rrsig/ad flags", () => {
  const dnskeyPayload = {
    AD: true,
    Answer: [{ type: 48, data: "key-record" }],
  };
  const dsPayload = {
    Answer: [{ type: 43, data: "ds-record" }],
  };
  const aPayload = {
    Answer: [{ type: 1, data: "93.184.216.34" }, { type: 46, data: "rrsig" }],
  };

  const summary = summarizeDnssecStatus(dnskeyPayload, dsPayload, aPayload);
  assertEquals(summary.dnskey_present, true);
  assertEquals(summary.ds_present, true);
  assertEquals(summary.rrsig_present, true);
  assertEquals(summary.authenticated_data, true);
});

Deno.test("summarizeDnssecStatus handles missing records", () => {
  const summary = summarizeDnssecStatus({}, {}, {});
  assertEquals(summary.dnskey_present, false);
  assertEquals(summary.ds_present, false);
  assertEquals(summary.rrsig_present, false);
  assertEquals(summary.authenticated_data, false);
});

Deno.test("summarizeWhoisRdap extracts registrar, dates, nameservers and dnssec", () => {
  const now = Date.parse("2026-05-24T00:00:00.000Z");
  const payload = {
    ldhName: "hisolution.it",
    events: [
      { eventAction: "registration", eventDate: "2020-01-01T00:00:00Z" },
      { eventAction: "last changed", eventDate: "2026-01-01T00:00:00Z" },
      { eventAction: "expiration", eventDate: "2026-06-30T00:00:00Z" },
    ],
    secureDNS: { delegationSigned: true },
    nameservers: [{ ldhName: "NS1.HISOLUTION.IT" }, { ldhName: "ns2.hisolution.it" }],
    entities: [
      {
        roles: ["registrar"],
        vcardArray: ["vcard", [["fn", {}, "text", "Registrar SRL"]]],
      },
    ],
  };

  const summary = summarizeWhoisRdap(payload, now);
  assertEquals(summary.domain, "hisolution.it");
  assertEquals(summary.registrar, "Registrar SRL");
  assertEquals(summary.created, "2020-01-01T00:00:00Z");
  assertEquals(summary.updated, "2026-01-01T00:00:00Z");
  assertEquals(summary.expires, "2026-06-30T00:00:00Z");
  assertEquals(summary.registration_valid, true);
  assertEquals(summary.days_to_expiry !== null && summary.days_to_expiry > 0, true);
  assertEquals(summary.nameservers, ["ns1.hisolution.it", "ns2.hisolution.it"]);
  assertEquals(summary.dnssec, "signed");
});

Deno.test("evaluateHttpSecurityHeaders handles all present and frame-ancestors fallback", () => {
  const allPresent = evaluateHttpSecurityHeaders({
    "content-security-policy": "default-src 'self'; frame-ancestors 'none'",
    "strict-transport-security": "max-age=31536000; includeSubDomains",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "referrer-policy": "strict-origin-when-cross-origin",
    "permissions-policy": "geolocation=()",
  });
  assertEquals(allPresent.all_present, true);

  const frameAncestorsOnly = evaluateHttpSecurityHeaders({
    "content-security-policy": "frame-ancestors 'none'",
  });
  assertEquals(frameAncestorsOnly.x_frame_options_or_frame_ancestors, true);
  assertEquals(frameAncestorsOnly.all_present, false);
});

Deno.test("evaluateHttpSecurityHeaders reports missing set when headers absent", () => {
  const summary = evaluateHttpSecurityHeaders({});
  assertEquals(summary.content_security_policy, false);
  assertEquals(summary.strict_transport_security, false);
  assertEquals(summary.missing.includes("content-security-policy"), true);
  assertEquals(summary.missing.includes("strict-transport-security"), true);
});

Deno.test("summarizeThreatSignals evaluates SafeBrowsing/URLHaus/PhishTank", () => {
  const sbOnly = summarizeThreatSignals({
    safeBrowsingMatches: [{ threatType: "MALWARE" }],
    urlHausListed: false,
    phishTank: null,
  });
  assertEquals(sbOnly.safe_browsing_unsafe, true);
  assertEquals(sbOnly.has_threat_match, true);

  const clean = summarizeThreatSignals({
    safeBrowsingMatches: [],
    urlHausListed: false,
    phishTank: { inDatabase: false, valid: false, verified: false },
  });
  assertEquals(clean.has_threat_match, false);
});
