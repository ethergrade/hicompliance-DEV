import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { validateDarkRiskSelector } from "./darkrisk-selector-validation.ts";

Deno.test("validateDarkRiskSelector validates supported selector formats", () => {
  assertEquals(validateDarkRiskSelector("security@example.com"), {
    valid: true,
    type: "email",
    normalized: "security@example.com",
  });

  assertEquals(validateDarkRiskSelector("example.com"), {
    valid: true,
    type: "domain",
    normalized: "example.com",
  });

  assertEquals(validateDarkRiskSelector("*.example.com"), {
    valid: true,
    type: "wildcard_domain",
    normalized: "*.example.com",
  });

  assertEquals(validateDarkRiskSelector("https://portal.example.com/login?x=1#hash"), {
    valid: true,
    type: "url",
    normalized: "https://portal.example.com/login?x=1",
  });

  assertEquals(validateDarkRiskSelector("203.0.113.10"), {
    valid: true,
    type: "ipv4",
    normalized: "203.0.113.10",
  });

  assertEquals(validateDarkRiskSelector("2001:db8::1"), {
    valid: true,
    type: "ipv6",
    normalized: "2001:db8::1",
  });

  assertEquals(validateDarkRiskSelector("203.0.113.0/24"), {
    valid: true,
    type: "cidrv4",
    normalized: "203.0.113.0/24",
  });

  assertEquals(validateDarkRiskSelector("2001:db8::/64"), {
    valid: true,
    type: "cidrv6",
    normalized: "2001:db8::/64",
  });

  assertEquals(validateDarkRiskSelector("+39 333 123 4567"), {
    valid: true,
    type: "phone",
    normalized: "+393331234567",
  });

  assertEquals(validateDarkRiskSelector("550e8400-e29b-41d4-a716-446655440000"), {
    valid: true,
    type: "uuid",
    normalized: "550e8400-e29b-41d4-a716-446655440000",
  });

  assertEquals(validateDarkRiskSelector("storageid:ABCD1234XYZ9876"), {
    valid: true,
    type: "storageid",
    normalized: "storageid:ABCD1234XYZ9876",
  });

  assertEquals(validateDarkRiskSelector("systemid:abcde12345-987zyx"), {
    valid: true,
    type: "systemid",
    normalized: "systemid:abcde12345-987zyx",
  });
});

Deno.test("validateDarkRiskSelector rejects generic or marketing strings", () => {
  const generic = validateDarkRiskSelector("marketing campaign q3");
  assertEquals(generic.valid, false);
  assertEquals(generic.type, null);

  const random = validateDarkRiskSelector("best cybersecurity solution ever");
  assertEquals(random.valid, false);
  assertEquals(random.type, null);
});
