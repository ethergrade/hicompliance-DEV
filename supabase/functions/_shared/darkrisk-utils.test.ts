import { assert, assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { maskEmail, maskPotentialSecrets } from "./darkrisk-utils.ts";

Deno.test("maskEmail redacts local part", () => {
  assertEquals(maskEmail("security@hisolution.it"), "s***@hisolution.it");
  assertEquals(maskEmail("invalid"), "[REDACTED_EMAIL]");
});

Deno.test("maskPotentialSecrets redacts email password token cookie card iban", () => {
  const raw = [
    "Email: security@hisolution.it",
    "password=SuperSecret123",
    "token=abc1234567890",
    "Cookie: SESSIONID=abcd1234",
    "IBAN IT60X0542811101000000123456",
    "Card 4111 1111 1111 1111",
  ].join("\n");

  const masked = maskPotentialSecrets(raw);

  assertStringIncludes(masked, "s***@hisolution.it");
  assertStringIncludes(masked, "password=[REDACTED]");
  assertStringIncludes(masked, "token=[TOKEN_REDACTED]");
  assertStringIncludes(masked, "cookie=[COOKIE_REDACTED]");
  assertStringIncludes(masked, "[IBAN_REDACTED]");
  assertStringIncludes(masked, "[CARD_REDACTED]");

  assert(!masked.includes("SuperSecret123"));
  assert(!masked.includes("abc1234567890"));
  assert(!masked.includes("IT60X0542811101000000123456"));
  assert(!masked.includes("4111 1111 1111 1111"));
});

Deno.test("maskPotentialSecrets redacts URL credentials", () => {
  const raw = "https://admin:Pa55w0rd!@portal.example.com/login";
  const masked = maskPotentialSecrets(raw);

  assertStringIncludes(masked, "https://admin:[REDACTED]@portal.example.com/login");
  assert(!masked.includes("Pa55w0rd!"));
});

Deno.test("maskPotentialSecrets sanitizes OpenAI prompt-like payload", () => {
  const prompt = `\nCustomer: hi@company.com\nAuthorization: Bearer sk-proj-aaaaaaaaaaaaaaaaaaaaaaaa\napi_key=sk-live-xyz\n`;

  const masked = maskPotentialSecrets(prompt);

  assert(!masked.includes("hi@company.com"));
  assert(!masked.includes("sk-proj-aaaaaaaaaaaaaaaaaaaaaaaa"));
  assert(!masked.includes("sk-live-xyz"));
  assertStringIncludes(masked, "h***@company.com");
  assertStringIncludes(masked, "authorization=Bearer [TOKEN_REDACTED]");
  assertStringIncludes(masked, "token=[TOKEN_REDACTED]");
});
