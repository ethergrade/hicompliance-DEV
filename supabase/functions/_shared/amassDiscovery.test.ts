import { assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildAmassEndpoint,
  normalizeAmassServiceResponse,
  resolveAmassDiscoveryGate,
  runAmassDiscovery,
} from "./amassDiscovery.ts";

Deno.test("normalizeAmassServiceResponse deduplicates names and IPs", () => {
  const result = normalizeAmassServiceResponse({
    subdomains: ["WWW.Example.com.", "*.api.example.com", "invalid host"],
    ips: ["198.51.100.10", "not-an-ip"],
    results: [
      { name: "api.example.com", addresses: ["198.51.100.10", "2001:db8::10"] },
      { hostname: "admin.example.com.", ip: "203.0.113.20" },
    ],
    warnings: ["rate_limited_source"],
    duration_ms: 1200,
    amass_version: "v5.1.1",
  });

  assertEquals(result.subdomains, ["admin.example.com", "api.example.com", "www.example.com"]);
  assertEquals(result.ips, ["198.51.100.10", "2001:db8::10", "203.0.113.20"]);
  assertEquals(result.warnings, ["rate_limited_source"]);
  assertEquals(result.duration_ms, 1200);
  assertEquals(result.amass_version, "v5.1.1");
});

Deno.test("resolveAmassDiscoveryGate explains optional skip cases", () => {
  const base = {
    featureEnabled: true,
    serviceUrl: "https://amass.example.workers.dev",
    sharedSecret: "secret",
    jobConfig: { amass: { enabled: true } },
    targetType: "domain",
    rootDomain: "example.com",
  };

  assertEquals(resolveAmassDiscoveryGate({ ...base, featureEnabled: false }), {
    enabled: false,
    reason: "feature_flag_disabled",
  });
  assertEquals(resolveAmassDiscoveryGate({ ...base, jobConfig: {} }), {
    enabled: false,
    reason: "job_toggle_disabled",
  });
  assertEquals(resolveAmassDiscoveryGate({ ...base, serviceUrl: "" }), {
    enabled: false,
    reason: "missing_service_url",
  });
  assertEquals(resolveAmassDiscoveryGate({ ...base, targetType: "ipv4" }), {
    enabled: false,
    reason: "target_not_domain",
  });
  assertEquals(resolveAmassDiscoveryGate(base), { enabled: true, reason: null });
});

Deno.test("runAmassDiscovery posts expected active-light contract", async () => {
  const result = await runAmassDiscovery({
    serviceUrl: "https://amass.example.workers.dev/base/",
    sharedSecret: "shared-secret",
    target: "example.com",
    rootDomain: "example.com",
    scanJobId: "scan-1",
    timeoutSeconds: 30,
    maxNames: 25,
    fetchFn: async (url, init) => {
      assertEquals(String(url), "https://amass.example.workers.dev/base/amass/enum");
      assertEquals(init?.method, "POST");
      assertEquals((init?.headers as Record<string, string>).Authorization, "Bearer shared-secret");
      const body = JSON.parse(String(init?.body || "{}"));
      assertEquals(body, {
        target: "example.com",
        root_domain: "example.com",
        mode: "active_light",
        timeout_seconds: 30,
        max_names: 25,
        scan_job_id: "scan-1",
      });
      return new Response(JSON.stringify({
        subdomains: ["www.example.com"],
        ips: ["198.51.100.10"],
      }), { status: 200 });
    },
  });

  assertEquals(result.subdomains, ["www.example.com"]);
  assertEquals(result.ips, ["198.51.100.10"]);
});

Deno.test("runAmassDiscovery surfaces container errors", async () => {
  await assertRejects(
    () => runAmassDiscovery({
      serviceUrl: "https://amass.example.workers.dev",
      sharedSecret: "shared-secret",
      target: "example.com",
      rootDomain: "example.com",
      scanJobId: "scan-1",
      fetchFn: async () => new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 }),
    }),
    Error,
    "unauthorized",
  );
});

Deno.test("runAmassDiscovery handles malformed success payload as empty result", async () => {
  const result = await runAmassDiscovery({
    serviceUrl: "https://amass.example.workers.dev",
    sharedSecret: "shared-secret",
    target: "example.com",
    rootDomain: "example.com",
    scanJobId: "scan-1",
    fetchFn: async () => new Response("not-json", { status: 200 }),
  });

  assertEquals(result.subdomains, []);
  assertEquals(result.ips, []);
});

Deno.test("buildAmassEndpoint appends route predictably", () => {
  assertEquals(
    buildAmassEndpoint("https://amass.example.workers.dev/custom/"),
    "https://amass.example.workers.dev/custom/amass/enum",
  );
});
