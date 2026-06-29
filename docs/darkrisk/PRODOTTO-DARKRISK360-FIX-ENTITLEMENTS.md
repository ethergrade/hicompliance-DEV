# DarkRisk360 entitlement fix for `PRODOTTO`

## What changed

- DarkRisk360 standard now resolves through a shared entitlement resolver instead of trusting only the `/darkrisk/overview` payload.
- The resolver now falls back to `organizations.hicompliance_enabled`, `organizations.dark_risk360_enabled`, and `organizations.darkrisk_esteso_enabled`.
- `/dark-risk` and `/dark-risk-esteso` now show a loading state while entitlement resolution is in progress, so they no longer flash the false "non attivo" card during startup or client switch.

## Why this fix was needed

- ET_NEW had HiCompliance active and the services dialog already showed DarkRisk360 as included, but the standard page could still land on the inactive state when the entitlement query was incomplete or too strict.
- The sidebar and services dialog were already using a more permissive view of the same commercial state. This patch aligns the page with that source of truth.

## Files touched

- `src/features/darkrisk/shared/entitlementResolver.ts`
- `src/features/darkrisk/api/darkRiskGateway.ts`
- `src/features/darkrisk/shared/useDarkRiskEntitlements.ts`
- `src/features/darkrisk/standard/StandardDarkRiskPage.tsx`
- `src/features/darkrisk/extended/ExtendedDarkRiskPage.tsx`

## Behavioral outcome

- HiCompliance active is enough to unlock DarkRisk360 standard in UI.
- DarkRisk360 Esteso still remains gated separately.
- The user no longer sees a premature "DarkRisk360 non attivo" state while the entitlement data is resolving.

## Notes for DEV

- The fallback is intentionally read-only and local to the frontend layer.
- No commercial behavior was changed; this only removes a false negative caused by entitlement resolution timing and source mismatch.
