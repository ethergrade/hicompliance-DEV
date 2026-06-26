import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  csExtractSubdomains,
  csMapToFindings,
  csWaitForResults,
  type CsResult,
} from "./connectsecure-adapter.ts";

Deno.test("csMapToFindings normalizes nested ConnectSecure ASM arrays", () => {
  const result = {
    id: 1,
    name: "example.com",
    website: "example.com",
    status: "Completed",
    attack_surface_domain_id: 123,
    company_id: 13805,
    target_ips: [
      {
        "IP Address": "203.0.113.10",
        ASN: "64500",
        Location: "IT",
        Vulnerabities: "",
        port_protocol: "80, 443",
      },
    ],
    subdomains: [[
      { subdomain: "VPN.Example.com.", dns_records: { A: ["203.0.113.10"] } },
      { subdomain: "mail.example.com" },
    ]],
    dns_records: [[]],
    emails: [[]],
    guessed_emails: [[]],
    usernames: [[]],
    s3buckets: [[]],
    creds: [[]],
    hashes: [[{ algorithm: "sha256", value: "sample" }]],
    raw_headers: { server: "nginx" },
  } satisfies CsResult;

  const mapped = csMapToFindings(result, "example.com", 0);

  assertEquals(csExtractSubdomains(result), ["mail.example.com", "vpn.example.com"]);
  assert(mapped.assets.some(asset => asset.asset_type === "subdomain" && asset.asset_value === "vpn.example.com"));
  assert(mapped.assets.some(asset => asset.asset_type === "ipv4" && asset.asset_value === "203.0.113.10"));
  assertEquals(mapped.ports.map(port => `${port.port}/${port.protocol}`), ["80/tcp", "443/tcp"]);
  assertEquals(mapped.findings.some(finding => finding.finding_type === "exposed_storage_bucket"), false);
  assertEquals(mapped.observations.some(obs => obs.type === "discovered_emails"), false);
  assertEquals(mapped.observations.some(obs => obs.type === "dns_records"), false);
  assertEquals(mapped.observations.some(obs => obs.type === "http_server_banner"), true);
  assertEquals(mapped.sensitiveData.creds?.length, 0);
  assertEquals(mapped.sensitiveData.hashes?.length, 1);
});

Deno.test("csMapToFindings ignores placeholder storage bucket records", () => {
  const result = {
    id: 1,
    name: "example.com",
    website: "example.com",
    status: "Completed",
    attack_surface_domain_id: 123,
    company_id: 13805,
    s3buckets: [
      { name: "sconosciuto", url: "" },
      { bucket: "unknown" },
      { bucket_name: "n/a" },
    ],
  } satisfies CsResult;

  const mapped = csMapToFindings(result, "example.com", 0);

  assertEquals(mapped.findings.some(finding => finding.finding_type === "exposed_storage_bucket"), false);
});

Deno.test("csMapToFindings keeps actionable storage bucket evidence", () => {
  const result = {
    id: 1,
    name: "example.com",
    website: "example.com",
    status: "Completed",
    attack_surface_domain_id: 123,
    company_id: 13805,
    s3buckets: [
      { bucket_name: "assets-example-public", endpoint: "https://assets-example-public.s3.amazonaws.com" },
    ],
  } satisfies CsResult;

  const mapped = csMapToFindings(result, "example.com", 0);
  const finding = mapped.findings.find(item => item.finding_type === "exposed_storage_bucket");

  assert(finding);
  assertEquals(finding?.title, "Bucket storage pubblico rilevato: assets-example-public");
  assertEquals(finding?.affected_asset, "https://assets-example-public.s3.amazonaws.com");
});

Deno.test("csWaitForResults ignores completed results older than the scan request", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  const stale = {
    id: 1,
    name: "example.com",
    website: "example.com",
    status: "Completed",
    attack_surface_domain_id: 123,
    company_id: 13805,
    created: "2026-06-26T09:00:00",
    updated: "2026-06-26T09:00:30",
  };
  const fresh = {
    ...stale,
    id: 2,
    created: "2026-06-26T09:30:00",
    updated: "2026-06-26T09:30:30",
  };

  globalThis.fetch = (() => {
    calls += 1;
    return Promise.resolve(new Response(JSON.stringify({
      status: true,
      data: [calls === 1 ? stale : fresh],
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
  }) as typeof fetch;

  try {
    const result = await csWaitForResults(
      { pod_host: "pod.example", client_auth_token: "unused", company_id: 13805 },
      { current: { token: "access-token", userId: "user-id" } },
      123,
      "example.com",
      1_000,
      "2026-06-26T09:29:59Z",
      1,
    );

    assertEquals(result.id, 2);
    assertEquals(calls, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
