import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  normalizeSubdomainFinderOutputForDomain,
} from "./subdomainFinderParser.ts";

Deno.test("normalizeSubdomainFinderOutputForDomain filters wildcard/duplicate/invalid/out-of-scope", () => {
  const output = {
    output_data: {
      subdomains: [
        { hostname: "*.api.example.com", ip_address: "203.0.113.11", resolved: true },
        { hostname: "app.example.com\napi.example.com", ip_address: "203.0.113.12", resolved: true },
        { hostname: "app.example.com", ip_address: "203.0.113.10", resolved: true },
        { hostname: "INVALID_HOST", ip_address: "203.0.113.99", resolved: true },
        { hostname: "evil.org", ip_address: "203.0.113.200", resolved: true },
        { hostname: "mail.example.com", resolved: false },
      ],
    },
  };

  const rows = normalizeSubdomainFinderOutputForDomain(output, 70, "example.com");
  const hosts = rows.map((row) => row.hostname).sort();

  assertEquals(hosts, ["api.example.com", "app.example.com"]);

  const app = rows.find((row) => row.hostname === "app.example.com");
  assertEquals(app?.ips, ["203.0.113.12", "203.0.113.10"]);
});
