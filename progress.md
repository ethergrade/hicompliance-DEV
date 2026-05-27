# Progress

## Status
In Progress

## Tasks
- [x] Wire useContactDirectory from Supabase to API (irpApi)
- [x] Wire useConsistenze from Supabase to API (consistenzeApi)
- [x] Wire useUserPreferences from Supabase to API (preferencesApi)
- [x] Wire ClientCrudDialog from Supabase to API (companiesApi)
- [x] Wire EmergencyContactForm from Supabase to API (irpApi)

## Files Changed
- `src/hooks/useContactDirectory.ts` — rewritten: supabase → irpApi (contacts, createContact, updateContact, deleteContact, emergencyContacts for import)
- `src/hooks/useConsistenze.ts` — rewritten: supabase → consistenzeApi (summary, items, createItem, updateItem, deleteItem). Added mapper functions to bridge API types (tenant_id) → local types (organization_id).
- `src/types/api.ts` — fixed ConsistenzeSummary (matches ConsistenzaClienteResource: nr_sedi, nr_interni_telefonici, etc.) and ConsistenzeItem (matches ConsistenzaItemResource: area, categoria, tecnologia, fornitore, quantita, scadenza, metriche_json)

- `src/hooks/useUserPreferences.ts` — rewritten: supabase → preferencesApi.get/set. Removed organizationId scoping (API handles user context). Kept same hook surface ({preferences, updatePreferences, clearPreferences, isSaving}). useResetAllPreferences invalidates query cache (no bulk-delete API endpoint).

- [x] Wire useDocumentSave from Supabase to API (documentsApi.createWithFile)
- [x] Clean up dead ContactPicker stubs in Documents.tsx

## Files Changed
- `src/lib/api/documents.ts` — added `createWithFile()` multipart upload method for file+metadata upload
- `src/hooks/useDocumentSave.ts` — rewritten: supabase → documentsApi.createWithFile. Removed supabase.storage dependency. Simplified: single API call handles file upload + metadata creation.
- `src/pages/Documents.tsx` — removed 4 dead ContactPicker stubs (Redatto da, Elaborato da, Revisionato da, Approvato da) and unused ContactPicker import

## Notes
- Backend API mapping: `IrpContactResource.tenant_id` → `DirectoryContact.organization_id` for backward compat
- `importFromEmergencyContacts` rewritten to iterate API calls instead of bulk insert
- Hook interface preserved (same return types, same `DirectoryContact` type)
- `documentsApi.createWithFile()` uses native fetch with FormData for multipart upload — apiClient only handles JSON
