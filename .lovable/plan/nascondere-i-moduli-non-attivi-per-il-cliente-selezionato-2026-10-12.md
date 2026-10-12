# Nascondere i moduli non attivi per il cliente selezionato

## Obiettivo
Quando si apre un cliente (es. AKC, che ha solo Asset Management), menu laterale, dashboard e indirizzi diretti mostrano solo i moduli attivi per quel cliente. Vale per HiCompliance (Assessment, Analisi, Remediation, Supply Chain, BIA, IRP, Eventi Compliance), SurfaceScan360, DarkRisk360/Esteso, HiTrack, HiPatch, HiEndpoint, HiFirewall, HiDetect, HiMail, HiMobile, HiLog e Asset Management.

## Cosa cambia
1. **Asset Management diventa un servizio** del catalogo (`assetmanagement`), attivabile dalla scheda Servizi del cliente come gli altri. AKC: solo questo servizio attivo. I clienti che oggi usano Asset Management vengono attivati automaticamente per non perdere l'accesso.
2. **Regola unica modulo → servizio** in un solo file di configurazione (pagina → servizio richiesto). Usata da menu, dashboard e protezione delle pagine.
3. **Menu laterale**: con un cliente selezionato si nascondono tutte le voci dei servizi non attivi. Si elimina l'eccezione per cui il super admin vede HiTrack anche se non attivo. Supply Chain e BIA seguono HiCompliance (Supply Chain resta anche limitata alla demo Innovatech). Le sezioni vuote spariscono.
4. **Dashboard del cliente**: card, semafori, rischio per servizio e True Risk contano solo i servizi attivi; se nessun servizio di sicurezza è attivo, al posto degli indicatori compare un messaggio "Nessun servizio di sicurezza attivo".
5. **Accesso diretto via indirizzo**: aprendo l'indirizzo di un modulo non attivo compare una pagina "Modulo non attivo per questo cliente" con ritorno alla dashboard.
6. **Vista console** (super admin / commerciali senza cliente selezionato): invariata, vedono tutto.
7. **Moduli generali** (Home, Dashboard, CyberNews, Report, Gestione Documenti, Impostazioni): restano sempre visibili.

## Documento per i DEV
`docs/moduli-per-servizio.md`: tabella pagina → servizio, regola di visibilità, nuovo servizio Asset Management, comportamento console, pagina "non attivo", come aggiungere un modulo, test manuali (AKC solo Asset Management; Innovatech tutto; cliente senza servizi), e nota che la protezione lato database (RLS per servizio) non è ancora inclusa e va valutata prima della produzione.

## Dettagli tecnici
- Nuovo `src/config/moduleServiceMap.ts` (route → service_type, o `null` = sempre visibile) + `useModuleAccess()` che legge `orgFlags`/`tenantServices` da `organizationStore`.
- `deriveOrganizationFlags` esteso a tutti i service_type (hiendpoint, hifirewall, hidetect, himail, himobile, hilog, assetmanagement); `dark_risk360_enabled` non più derivato da hicompliance.
- `AppSidebar.isFeatureAllowed` sostituito da `useModuleAccess`; rimosso `|| isSuperAdmin` su HiTrack.
- Nuovo guard `ServiceGuard` in `App.tsx` attorno alle route dei moduli.
- `serviceCatalog.ts` + inserimento riga `hisolution_services` per `assetmanagement`; insert `tenant_services` per AKC e per le organizzazioni con righe in `managed_assets`.
- `Dashboard.tsx`/`serviceHealth.ts`/`ServiceRiskBreakdownCard`: filtro per servizi attivi.
- Verifica Playwright: AKC (solo Asset Management) e Innovatech.
