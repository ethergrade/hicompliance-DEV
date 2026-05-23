import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  classifyTargetScope,
  isIpInRange,
  isIpWithinMonitoredScope,
  splitMonitoredScopeRules,
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
