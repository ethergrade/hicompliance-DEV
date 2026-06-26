import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  csExtractSubdomains,
  csGetOrCreateDomain,
  csGetResults,
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

Deno.test("csMapToFindings extracts subdomains from asset-oriented ConnectSecure payloads", () => {
  const result = {
    id: 1,
    name: "example.com",
    website: "example.com",
    status: "Completed",
    attack_surface_domain_id: 123,
    company_id: 13805,
    assets: [
      { host_name: "www.example.com", ip: "203.0.113.20" },
      { asset_value: "https://shop.example.com/login" },
      { name: "api.example.com." },
      { name: "example.com" },
      { name: "outside.test" },
    ],
    results: {
      rows: [
        { fqdn: "cdn.example.com", dns_records: [{ type: "CNAME", value: "edge.example.net" }] },
        { domain_name: "mail.example.com" },
      ],
    },
  } satisfies CsResult;

  const mapped = csMapToFindings(result, "example.com", 0);

  assertEquals(csExtractSubdomains(result), [
    "api.example.com",
    "cdn.example.com",
    "mail.example.com",
    "shop.example.com",
    "www.example.com",
  ]);
  assertEquals(
    mapped.assets
      .filter(asset => asset.asset_type === "subdomain")
      .map(asset => asset.asset_value),
    ["api.example.com", "cdn.example.com", "mail.example.com", "shop.example.com", "www.example.com"],
  );
  const subdomainObservation = mapped.observations.find(obs => obs.type === "connectsecure_discovered_subdomains");
  assert(subdomainObservation);
  assertEquals(subdomainObservation?.value.total, 5);
});

Deno.test("csMapToFindings emits valid ConnectSecure mail config as mail_config observation", () => {
  const result = {
    id: 1,
    name: "example.com",
    website: "example.com",
    status: "Completed",
    attack_surface_domain_id: 123,
    company_id: 13805,
    mx: { hosts: ["mx1.example.com"] },
    spf: { valid: true, record: "v=spf1 mx -all", dns_lookups: 1 },
    dmarc: { valid: true, record: "v=DMARC1; p=quarantine;", location: "example.com" },
  } satisfies CsResult;

  const mapped = csMapToFindings(result, "example.com", 0);
  const mailObservation = mapped.observations.find(obs =>
    obs.module === "mail_config" && obs.type === "mail_config_summary"
  );

  assert(mailObservation);
  assertEquals(mailObservation?.value.has_spf, true);
  assertEquals(mailObservation?.value.spf_records, ["v=spf1 mx -all"]);
  assertEquals(mailObservation?.value.has_dmarc, true);
  assertEquals(mailObservation?.value.dmarc_records, ["v=DMARC1; p=quarantine;"]);
  assertEquals(mapped.findings.some(finding => finding.finding_type === "dns_mail_security"), false);
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

Deno.test("csGetResults performs a single freshness-aware poll", async () => {
  const originalFetch = globalThis.fetch;
  const stale = {
    id: 1,
    name: "example.com",
    website: "example.com",
    status: "Completed",
    attack_surface_domain_id: 123,
    company_id: 13805,
    created: "2026-06-26T09:00:00",
    updated: "2026-06-26T09:00:30",
  } satisfies CsResult;

  globalThis.fetch = (() => Promise.resolve(new Response(JSON.stringify({
    status: true,
    data: [stale],
  }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  }))) as typeof fetch;

  try {
    const result = await csGetResults(
      { pod_host: "pod.example", client_auth_token: "unused", company_id: 13805 },
      { current: { token: "access-token", userId: "user-id" } },
      123,
      "2026-06-26T09:29:59Z",
    );

    assertEquals(result, null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("csGetOrCreateDomain reuses a domain already present in ConnectSecure", async () => {
  const originalFetch = globalThis.fetch;
  const registryWrites: Array<Record<string, unknown>> = [];
  const registryQuery = {
    select() { return this; },
    eq() { return this; },
    maybeSingle() { return Promise.resolve({ data: null }); },
    upsert(row: Record<string, unknown>) {
      registryWrites.push(row);
      return Promise.resolve({ error: null });
    },
  };
  const adminClient = {
    from(table: string) {
      assertEquals(table, "connectsecure_domain_registry");
      return registryQuery;
    },
  };
  let calls = 0;

  globalThis.fetch = ((input: string | URL | Request) => {
    calls += 1;
    assert(String(input).includes("/r/company/attack_surface_domain?"));
    return Promise.resolve(new Response(JSON.stringify({
      status: true,
      data: calls === 1
        ? [{ id: 2000, domain: "another-example.com" }]
        : [{ id: 2547, domain: "example.com" }],
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
  }) as typeof fetch;

  try {
    const domainId = await csGetOrCreateDomain(
      { pod_host: "pod.example", client_auth_token: "unused", company_id: 13805 },
      { current: { token: "access-token", userId: "user-id" } },
      "example.com",
      adminClient,
      "org-id",
    );

    assertEquals(domainId, 2547);
    assertEquals(calls, 2);
    assertEquals(registryWrites, [{
      organization_id: "org-id",
      domain: "example.com",
      cs_domain_id: 2547,
    }]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
