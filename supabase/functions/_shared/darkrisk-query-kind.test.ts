import { assert, assertFalse } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { isEmailLikeSelectorTerm, isEmailSelectorCoverageKind } from "./darkrisk-query-kind.ts";

Deno.test("isEmailLikeSelectorTerm recognizes valid email selectors", () => {
  assert(isEmailLikeSelectorTerm("emmaterenzi@icloud.com"));
  assertFalse(isEmailLikeSelectorTerm("panapesca.it"));
});

Deno.test("isEmailSelectorCoverageKind supports legacy selector rows with email query term", () => {
  assert(isEmailSelectorCoverageKind("email_selector", "emmaterenzi@icloud.com"));
  assert(isEmailSelectorCoverageKind("selector", "emmaterenzi@icloud.com"));
  assertFalse(isEmailSelectorCoverageKind("selector", "@panapesca.it"));
  assertFalse(isEmailSelectorCoverageKind("at_domain_tld", "@panapesca.it"));
});
