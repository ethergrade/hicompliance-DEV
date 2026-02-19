

# Modifica rapida Anagrafiche e Consistenze dalla Selezione Clienti

## Obiettivo
Arricchire la pagina di selezione clienti (`/clients`) con la possibilita di visualizzare e modificare al volo i dati anagrafici (profilo organizzazione) e le consistenze tecniche (asset inventory) di ogni cliente, senza dover navigare alle pagine dedicate.

## Come funzionera per l'utente

Ogni card cliente nella griglia mostrera due nuovi pulsanti accanto a "Gestisci":
- **Anagrafica** (icona FileText) -- apre un dialog laterale (Sheet) con i campi principali del profilo aziendale
- **Consistenze** (icona Server) -- apre un dialog laterale (Sheet) con i campi dell'inventario asset

Le modifiche vengono salvate con un pulsante "Salva" nel pannello laterale, senza uscire dalla pagina di selezione clienti.

```text
+-----------------------------------+
| Card Cliente: Acme Corp (ACME)    |
| Creato il 5 gennaio 2025          |
|                                   |
| [Anagrafica] [Consistenze]        |
| [         Gestisci ->           ] |
+-----------------------------------+
```

Al click su "Anagrafica" si apre uno Sheet da destra con:
- Ragione Sociale, P.IVA, Codice Fiscale
- PEC, Telefono, Email
- Settore, Classificazione NIS2

Al click su "Consistenze" si apre uno Sheet da destra con:
- Utenti, Sedi
- Endpoint, Server, Hypervisor, VM
- Dispositivi di rete (firewall, switch, AP)
- IP/Subnet per VA (con calcolo automatico totali)

## Dettaglio tecnico

### 1. Nuovo componente: `ClientProfileSheet.tsx`
- Riceve `organizationId` e `open/onOpenChange`
- Fetcha `organization_profiles` per quell'org
- Form inline con i campi principali (legal_name, vat_number, fiscal_code, pec, phone, email, business_sector, nis2_classification)
- Pulsante "Salva" che fa upsert su `organization_profiles`
- Usa il componente Sheet di Radix UI

### 2. Nuovo componente: `ClientAssetSheet.tsx`
- Riceve `organizationId` e `open/onOpenChange`
- Fetcha `asset_inventory` per quell'org
- Form con tutti i campi numerici dell'inventario, raggruppati per categoria
- Calcolo automatico totali (rete, IP) come nella pagina AssetInventory
- Pulsante "Salva" che fa upsert su `asset_inventory`
- Usa il componente Sheet di Radix UI

### 3. Modifica: `ClientSelection.tsx`
- Importa i due nuovi componenti Sheet
- Aggiunge stato per `editingOrgId`, `sheetType` (profile/asset)
- Aggiunge due pulsanti per card: "Anagrafica" e "Consistenze" con `stopPropagation` (non triggera la selezione)
- Il click su "Gestisci" continua a selezionare il cliente e navigare alla dashboard

### File coinvolti

| File | Azione |
|------|--------|
| `src/components/clients/ClientProfileSheet.tsx` | Nuovo -- sheet modifica anagrafica |
| `src/components/clients/ClientAssetSheet.tsx` | Nuovo -- sheet modifica consistenze |
| `src/pages/ClientSelection.tsx` | Modifica -- aggiunta pulsanti e integrazione sheet |

### Nessuna modifica al database
Tutti i dati sono gia nelle tabelle `organization_profiles` e `asset_inventory` con le RLS policy corrette per Sales e Super Admin.

