import {
  assertEquals,
  assertRejects,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  envelopeEncryptJson,
  filterAuthorizedCorrelatedDomains,
  parseKek,
  retryDelaySeconds,
} from "./worker-utils.ts";

Deno.test("envelope encryption stores ciphertext and wrapped DEK only", async () => {
  const kek = crypto.getRandomValues(new Uint8Array(32));
  const encrypted = await envelopeEncryptJson(
    { password: "secret-value" },
    kek,
    "test-v1",
  );
  assertEquals(encrypted.algorithm, "AES-256-GCM+AES-KW-GCM");
  assertEquals(encrypted.keyVersion, "test-v1");
  assertEquals(encrypted.ciphertext.includes("secret-value"), false);
  assertEquals(encrypted.encryptedDek.length > 32, true);
});

Deno.test("KEK must decode to 32 bytes", async () => {
  await assertRejects(async () => parseKek(btoa("short")), Error, "32_bytes");
});

Deno.test("retry backoff is bounded", () => {
  assertEquals(retryDelaySeconds(1), 30);
  assertEquals(retryDelaySeconds(3), 120);
  assertEquals(retryDelaySeconds(20), 900);
});

Deno.test("IP correlation keeps only approved roots and their subdomains", () => {
  assertEquals(
    filterAuthorizedCorrelatedDomains(
      [
        "example.com",
        "vpn.example.com",
        "example.com.evil.test",
        "unrelated.test",
      ],
      ["example.com"],
    ),
    {
      authorized: ["example.com", "vpn.example.com"],
      rejectedCount: 2,
    },
  );
});
