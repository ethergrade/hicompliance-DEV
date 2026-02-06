

## Piano: Correzione Importazione Asset in Analisi Rischi

### Problemi Identificati

#### Problema 1: "Da Infrastruttura" mostra "Nessun asset disponibile"
**Causa**: Nella tabella `critical_infrastructure` esistono 2 asset:
- C-01 con `component_name = "Server_TLS_DC1"`
- C-02 con `component_name = "Server_TLS_DC1"` (nome duplicato!)

La logica di filtraggio usa `component_name || asset_id` per determinare quali asset sono disponibili. Poiche entrambi hanno lo stesso nome e "Server_TLS_DC1" esiste gia in Risk Analysis, entrambi vengono filtrati.

**Problema aggiuntivo**: Il codice usa `component_name` come identificatore, ma non gestisce correttamente i casi in cui piu asset hanno lo stesso nome.

#### Problema 2: Asset manuali non appaiono in Infrastruttura Critica
**Causa**: Sono due tabelle separate (`risk_analysis` e `critical_infrastructure`) senza sincronizzazione. Questo e un comportamento previsto ma non documentato all'utente.

---

### Soluzione Proposta

#### Fix 1: Migliorare la logica di filtraggio

Modificare il confronto per usare una combinazione univoca `asset_id + component_name` oppure usare direttamente `asset_id` come identificatore primario nella selezione.

**Approccio**: Quando l'utente importa da infrastruttura, memorizzare anche un riferimento all'asset_id per evitare duplicazioni basate solo sul nome.

#### Fix 2: Usare l'asset_id come identificatore primario

```text
+------------------------------------------+
| Logica Attuale (PROBLEMATICA)            |
+------------------------------------------+
| 1. Prende component_name || asset_id     |
| 2. Confronta con asset_name in risk_analysis
| 3. Se esiste -> filtra fuori             |
+------------------------------------------+

+------------------------------------------+
| Logica Corretta                          |
+------------------------------------------+
| 1. Usa asset_id come identificatore unico|
| 2. Mostra "asset_id - component_name"    |
| 3. Memorizza riferimento in risk_analysis|
+------------------------------------------+
```

---

### Modifiche da Implementare

#### File 1: `src/components/irp/RiskAnalysisManager.tsx`

**Cambiamento 1** - Logica di filtraggio (righe 98-101):
```typescript
// PRIMA:
const availableInfraAssets = infrastructureAssets.filter(infra => {
  const name = infra.component_name || infra.asset_id;
  return name && !assetSummaries.some(s => s.assetName === name);
});

// DOPO:
// Filtra usando l'asset_id come identificatore univoco
// Ma permette di importare con lo stesso component_name se e un asset_id diverso
const availableInfraAssets = infrastructureAssets.filter(infra => {
  // Crea un identificatore univoco per questo asset
  const uniqueId = infra.asset_id;
  const displayName = infra.component_name 
    ? `${infra.component_name} (${infra.asset_id})` 
    : infra.asset_id;
  
  // Controlla se questo specifico asset_id e gia stato importato
  // Verificando se esiste un asset con nome che contiene l'asset_id
  return !assetSummaries.some(s => 
    s.assetName === displayName || 
    s.assetName === infra.component_name ||
    s.assetName === infra.asset_id
  );
});
```

**Cambiamento 2** - Dropdown display (righe 370-382):
```typescript
// Mostrare asset_id + component_name per disambiguare
{availableInfraAssets.map((infra) => {
  const displayName = infra.component_name 
    ? infra.component_name 
    : infra.asset_id;
  return (
    <SelectItem key={infra.id} value={displayName}>
      <div className="flex items-center gap-2">
        <Badge variant="outline" className="text-[10px]">
          {infra.asset_id}
        </Badge>
        <span>{infra.component_name || '(senza nome)'}</span>
      </div>
    </SelectItem>
  );
})}
```

**Cambiamento 3** - Messaggio vuoto piu chiaro (righe 351-359):
```typescript
// Mostrare quanti asset ci sono e perche non sono disponibili
<p className="text-xs mt-1">
  {infrastructureAssets.length > 0 
    ? `${infrastructureAssets.length} asset presenti, ma gia tutti importati.`
    : "Nessun asset in Infrastruttura Critica."}
</p>
```

---

### Nota per l'Utente

Gli asset creati manualmente in "Analisi Rischi" NON vengono automaticamente aggiunti a "Infrastruttura Critica" perche sono due censimenti separati:

- **Infrastruttura Critica**: censimento tecnico degli asset con dati di backup/recovery
- **Analisi Rischi**: valutazione dei controlli di sicurezza

Se l'utente desidera che un asset manuale appaia anche in Infrastruttura Critica, deve aggiungerlo separatamente in quella sezione.

---

### Riepilogo Modifiche

| File | Modifica |
|------|----------|
| `RiskAnalysisManager.tsx` | Correzione logica filtraggio duplicati |
| `RiskAnalysisManager.tsx` | Miglioramento visualizzazione dropdown |
| `RiskAnalysisManager.tsx` | Messaggio errore piu chiaro |

