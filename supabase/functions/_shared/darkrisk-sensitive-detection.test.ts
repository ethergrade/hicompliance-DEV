import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  detectSensitiveIndicators,
  extractSensitiveValueHits,
} from "./darkrisk-sensitive-detection.ts";

Deno.test("extractSensitiveValueHits detects adjacent database dump passwords near emails", () => {
  const dumpLine = [
    "32730711",
    "pbkdf2_sha256$20000$example$hashvalue",
    "demoPass7",
    "emmaterenzi@icloud.com",
    "it",
  ].join(" ");

  const hits = extractSensitiveValueHits(dumpLine);
  const passwords = hits.filter((entry) => entry.tag === "passwords").map((entry) => entry.value);

  assert(passwords.includes("demoPass7"));
  assertEquals(detectSensitiveIndicators(dumpLine).passwords, 1);
});

Deno.test("extractSensitiveValueHits ignores all-zero cards and metadata dates as sensitive values", () => {
  const metadata = "created 2020-07-09 coords 36.833274 59.191345 card 0000000000000000";
  const hits = extractSensitiveValueHits(metadata);

  assertEquals(hits.filter((entry) => entry.tag === "credit_cards").length, 0);
  assertEquals(hits.filter((entry) => entry.tag === "phone_numbers").length, 0);
});
