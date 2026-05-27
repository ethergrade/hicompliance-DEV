# Progress

## Status
In Progress

## Tasks
- [x] Wire useCriticalInfrastructure hook from Supabase to API
- [x] Rewrite ClientServicesDialog to use tenant-services API instead of Supabase

## Files Changed
- `src/hooks/useCriticalInfrastructure.ts` — rewritten to use `criticalInfrastructureApi` instead of Supabase direct calls
- `src/types/api.ts` — expanded `CriticalInfrastructureAsset` to match full DB shape and added `CriticalInfrastructureUpdate`
- `src/types/api.ts` — added `ServiceCatalog`, `ServiceCatalogField`, `ServiceCatalogEntry` types for tenant-services catalog
- `src/lib/api/tenant-services.ts` — added `groupHeader` helper and updated all methods to pass `X-Group-Id`; fixed `catalog()` return type to `ServiceCatalog`
- `src/components/clients/ClientServicesDialog.tsx` — full rewrite:
  - Uses `useClientOrganization` for `organizationId`
  - Fetches service catalog from `GET /config/tenant-services`
  - Fetches active tenant services from `GET /tenant-services?tenant_id=...`
  - Creates service via `POST /tenant-services` on toggle ON
  - Deletes service via `DELETE /tenant-services/{id}` on toggle OFF
  - Saves settings via `PUT /tenant-services/{id}` with debounced per-service form
  - Dynamically renders catalog fields (`select`, `checkbox`, `text`) including secret inputs
  - Preserves existing UI style (icons, badges, switches, dialog layout)
- `src/pages/Dashboard.tsx` — removed `organizationId` prop from `ClientServicesDialog` call
- `src/pages/ClientSelection.tsx` — removed `organizationId` prop from `ClientServicesDialog` call

## Notes
- Hook maintains identical public interface (assets, loading, saving, addAsset, updateAsset, deleteAsset, reloadAssets)
- Uses `useClientOrganization` for `organizationId` passed as `companyId` to API
- Types imported from `@/types/api` per requirements
- `useContactDirectory.ts` and `useSupplierDirectory.ts` left untouched on Supabase
- TypeScript check: zero errors
- Dialog supports independent services (SurfaceScan360, DarkRisk360) without requiring HiCompliance
- All service configuration is stored in the free-form `settings` JSON blob per tenant-service
