import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { normalizePortScannerOutput } from "./portScannerParser.ts";

Deno.test("normalizePortScannerOutput maps open-port severities", () => {
  const output = {
    output_data: {
      hostnames: ["scan.example.com"],
      ip_address: "203.0.113.40",
      ports: [
        { port_number: 80, port_state: "open", protocol: "tcp", service_name: "http" },
        { port_number: 443, port_state: "open", protocol: "tcp", service_name: "https" },
        { port_number: 3389, port_state: "open", protocol: "tcp", service_name: "ms-wbt-server" },
        { port_number: 6379, port_state: "open", protocol: "tcp", service_name: "redis" },
        { port_number: 3306, port_state: "open", protocol: "tcp", service_name: "mysql" },
        { port_number: 22, port_state: "open", protocol: "tcp", service_name: "ssh" },
      ],
    },
  };

  const rows = normalizePortScannerOutput(output);
  const byPort = new Map(rows.map((row) => [row.port, row]));

  assertEquals(byPort.get(80)?.exposure_level, "info");
  assertEquals(byPort.get(443)?.exposure_level, "info");
  assertEquals(byPort.get(3389)?.exposure_level, "high");
  assertEquals(byPort.get(6379)?.exposure_level, "critical");
  assertEquals(byPort.get(3306)?.exposure_level, "critical");
  assertEquals(byPort.get(22)?.exposure_level, "medium");
});
