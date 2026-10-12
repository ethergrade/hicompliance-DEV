
- Asset Management (registro per cliente, tabelle managed_assets*) è separato da Inventario Asset (consistenze numeriche); HaloPSA sincronizza solo in lettura via funzione server halo-asset-sync, perché le credenziali Halo non devono mai arrivare al browser.
- Module visibility per client is decided only by src/config/moduleServiceMap.ts + useModuleAccess (route → active tenant_services.service_type), so sidebar, guard and dashboard never diverge.
- Asset Management register column geometry is defined by ASSET_TABLE_COLUMNS and ResizableAssetHeader with a fixed-layout colgroup, so headers, filters and body cells remain aligned during pointer resizing.
