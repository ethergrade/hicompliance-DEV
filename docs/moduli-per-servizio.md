# Moduli visibili in base ai servizi del cliente

Aggiornato: 12/10/2026

## Regola
Con un cliente selezionato, menu laterale, pagine e dashboard mostrano solo i moduli il cui servizio è **attivo** per quel cliente (`tenant_services.tenant_id = organizations.id`, `status = 'active'`).
Senza cliente selezionato (vista console super admin / sales) si vede tutto.
I moduli generali (Home, Dashboard, CyberNews, Report, Gestione Documenti, Impostazioni, Admin) sono sempre visibili.

## Mappa pagina → servizio
Unica fonte: `src/config/moduleServiceMap.ts`.

| Pagina | service_type |
|---|---|
| /assessment, /analytics, /remediation, /compliance-events, /incident-response, /business-impact-analysis, /supply-chain | hicompliance |
| /surface-scan/* | surfacescan |
| /dark-risk, /dark-risk-esteso | darkrisk (Esteso richiede anche tier extended nei settings) |
| /asset-management | assetmanagement (nuovo) |
| /dashboard/service/hitrack, hipatch, hiendpoint, hifirewall, hidetect, himail, himobile, hilog | stesso codice |

Supply Chain resta inoltre limitata alla demo Innovatech.

## Componenti
- `useModuleAccess()` (`src/hooks/useModuleAccess.ts`): `isRouteAllowed(path)`, `isServiceActive(code)`, `servicesReady`.
- `organizationStore`: nuovo campo `servicesOrgId` (a quale cliente si riferiscono i servizi caricati) per evitare decisioni su dati del cliente precedente; `deriveOrganizationFlags` copre tutti i servizi. DarkRisk non è più attivato implicitamente da HiCompliance.
- `AppSidebar`: tutte le voci passano da `isFeatureAllowed` → `isRouteAllowed`. Rimosse le eccezioni "super admin vede HiTrack/Sophos" e "Innovatech vede sempre i Sophos".
- `ClientSelectionGuard`: se il servizio non è attivo mostra "Modulo non attivo per questo cliente" con ritorno alla dashboard (protegge anche l'accesso da indirizzo diretto).
- `Dashboard`: il riquadro rischio per servizio considera solo HiTrack/SurfaceScan/DarkRisk attivi; se nessuno è attivo mostra "Nessun servizio di sicurezza attivo".

## Dati
- Aggiunto `assetmanagement` a `hisolution_services` e a `FALLBACK_SERVICE_CATALOG`.
- Attivato `assetmanagement` per AKC e per i clienti che avevano già asset (Innovatech).
- AKC ha quindi solo Asset Management.

## Aggiungere un nuovo modulo
1. Aggiungere il servizio al catalogo (`hisolution_services` + `serviceCatalog.ts`).
2. Aggiungere la riga in `MODULE_SERVICE_MAP`.
3. Avvolgere la pagina in `ClientSelectionGuard`.

## Test manuali
- AKC: menu con sole voci generali + Asset Management; `/assessment` → pagina "non attivo".
- Innovatech: tutti i moduli visibili.
- Cliente senza servizi: solo voci generali; dashboard con "Nessun servizio di sicurezza attivo".
- Vista console senza cliente: tutto visibile.

## Da fare prima della produzione
- La restrizione è solo nell'interfaccia: le tabelle dei moduli non controllano ancora il servizio attivo lato database (RLS). Valutare una funzione `has_active_service(org, code)` nelle policy.
- Migrare l'attivazione servizi in PRODOTTO (backend Laravel) con lo stesso `service_type`.
