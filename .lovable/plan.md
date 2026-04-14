

## Diagnosi: Radar Chart non visibile in Assessment

### Problema identificato

La radar chart mostra la griglia (PolarGrid) e le etichette ma **i poligoni dei dati (Conformità/Target) non sono visibili**. I dati nel database sono corretti e il flusso di caricamento funziona (il punteggio 48/100 e il progresso 100% confermano che le risposte vengono lette).

Il problema è probabilmente legato a un **bug di rendering di Recharts** causato dalla combinazione di:
1. **`ResponsiveContainer` + `key` dinamico**: il `key={radarChartKey}` forza un unmount/remount del chart ogni volta che i dati cambiano, e `ResponsiveContainer` può non ricalcolare le dimensioni correttamente dopo il remount.
2. **Timing di rendering**: il chart viene montato prima che il container abbia dimensioni definitive, e il remount via `key` non triggera un resize.
3. **fillOpacity 0.3 su sfondo scuro**: i poligoni, anche se renderizzati, sono molto difficili da vedere.

### Piano di Fix

**File:** `src/pages/Assessment.tsx`

1. **Rimuovere il `key` dinamico dal `RadarChart`** — non è necessario con `isAnimationActive={false}` e causa solo problemi di remount. Recharts aggiorna automaticamente i path SVG quando i `data` cambiano.

2. **Aumentare la visibilità dei poligoni**:
   - Compliance: `fillOpacity` da 0.3 a **0.45**, `strokeWidth` da 2 a **2.5**
   - Target: `strokeWidth` da 2 a **2**, aggiungere `strokeOpacity={0.8}`

3. **Sostituire `ResponsiveContainer` con un approccio a dimensioni fisse**: dato che il container ha già `height: 380`, usare `<RadarChart width={400} height={360}>` direttamente, avvolto in un `div` centrato. Questo elimina il problema di misurazione asincrona di `ResponsiveContainer`.

4. **Fallback con `useEffect` resize**: aggiungere un piccolo effetto che forza un re-render dopo il mount per garantire che il chart abbia dimensioni corrette, come safety net.

### Dettagli tecnici

```text
Prima:
  <ResponsiveContainer width="100%" height={380}>
    <RadarChart key={radarChartKey} data={radarData} ...>

Dopo:
  <div className="w-full flex justify-center" style={{ height: 380 }}>
    <RadarChart width={460} height={370} data={radarData} ...>
```

Nessuna modifica al flusso dati o al calcolo dei punteggi — il problema è puramente di rendering SVG.

