
# Piano: Aggiunta campi di scelta interattivi nei Playbook

## Obiettivo
Analizzare ogni riga dei playbook e aggiungere campi `hasInlineInput` dove il cliente deve inserire una scelta (No/Sì), un valore numerico, o altre opzioni contestuali.

---

## Analisi per Playbook

### 1. PHISHING (phishing.ts)

| Sezione | ID | Testo attuale | Campo da aggiungere |
|---------|-----|--------------|---------------------|
| Triage | tr1 | Confermare se evento (tentativo) o incidente (accesso effettivo) | **Stato**: `Tentativo / Incidente` |
| Triage | tr4 | Controllare se MFA by-passato | **MFA Bypassato**: `No / Sì` |
| Triage | tr5 | Verificare se email di phishing ancora presenti in altre mailbox | **Presenti**: `No / Sì` |
| Containment | c6 | Isolare endpoint se sospetto malware correlato | **Malware correlato**: `No / Sì` |
| Containment | c7 | Se VIP/C-level: informare subito Crisis Manager | **VIP coinvolto**: `No / Sì` |
| Containment | c9 | Verificare esfiltrazione: download massivo, mail forward esterne | **Esfiltrazione rilevata**: `No / Sì` |
| Eradication | e5 | Se malware presente: seguire procedura Malware Infection | **Malware presente**: `No / Sì` |
| Communications | com1 | Valutare obbligo notifica Data Breach (art. 33 GDPR) | **Notifica GDPR richiesta**: `No / Sì` |
| Communications | com2 | Se dati personali/sanitari/finanziari: comunicare a interessati | **Dati sensibili coinvolti**: `No / Sì` |

---

### 2. DATA EXFILTRATION (data-exfiltration.ts)
*Gia presente: triage-1 (Confermare esfiltrazione)*

| Sezione | ID | Testo attuale | Campo da aggiungere |
|---------|-----|--------------|---------------------|
| Triage | triage-4 | Stimare quantità e categoria dati | **Categoria dati**: `Personali / Finanziari / IP / Altro` |
| Triage | triage-5 | Severity: dati sensibili + esfil confermata | **Severity**: `P1 / P2 / P3` |
| Containment | containment-4 | Attivare/rafforzare DLP (se disponibile) | **DLP disponibile**: `No / Sì` |
| Compliance | compliance-1 | NIS2: se significativo o malintento/transfrontaliero | **Applicabile NIS2**: `No / Sì` |
| Compliance | compliance-2 | GDPR: valutazione data breach e notifiche | **Notifica GDPR richiesta**: `No / Sì` |

---

### 3. DDOS (ddos.ts)

| Sezione | ID | Testo attuale | Campo da aggiungere |
|---------|-----|--------------|---------------------|
| Triage | triage-1 | Distinguere DDoS vs outage tecnico | **Tipo**: `DDoS / Outage tecnico` |
| Triage | triage-2 | Identificare pattern (L3/L4/L7) | **Pattern**: `L3 / L4 / L7` |
| Triage | triage-4 | Severity: servizio critico down | **Severity**: `P1 / P2 / P3` |
| Containment | containment-3 | Failover/scale out (se disponibile) | **Failover disponibile**: `No / Sì` |
| Containment | containment-4 | Coinvolgere ISP per scrubbing/blackhole | **ISP coinvolto**: `No / Sì` |
| Evidence | evidence-3 | Downtime totale e impatto utenti | **Downtime (ore)**: campo numerico |

---

### 4. PHYSICAL SECURITY (physical-security.ts)

| Sezione | ID | Testo attuale | Campo da aggiungere |
|---------|-----|--------------|---------------------|
| Triage | tr1 | Confermare evento e delimitare area | **Evento confermato**: `No / Sì` |
| Triage | tr3 | Valutare dati potenzialmente esposti (disk encryption? accessi?) | **Disk encryption attiva**: `No / Sì` |
| Containment | c2 | Disabilitare account se device conteneva token/keys | **Token/keys nel device**: `No / Sì` |
| Containment | c4 | Remote wipe/lock (se endpoint gestito) | **Endpoint gestito**: `No / Sì` |
| Containment | c5 | Segregare rete se hardware manomesso | **Hardware manomesso**: `No / Sì` |
| Evidence | ev4 | Denuncia (se applicabile) e numero protocollo | **Denuncia presentata**: `No / Sì` |
| Evidence | ev5 | Chain of custody se acquisizioni forensi | **Acquisizioni forensi**: `No / Sì` |

---

### 5. UNAUTHORIZED ACCESS (unauthorized-access.ts)

| Sezione | ID | Testo attuale | Campo da aggiungere |
|---------|-----|--------------|---------------------|
| Triage | tr1 | Confermare intrusion (evidenze accesso non autorizzato) | **Intrusione confermata**: `No / Sì` |
| Triage | tr4 | Determinare se l'attaccante è ancora attivo | **Attaccante attivo**: `No / Sì` |
| Eradication | e6 | Verificare rimozione completa backdoor | **Backdoor rimossa**: `No / Sì` |
| Compliance | comp1 | Se malintento sospetto/confermato → valutare Pre-alert CSIRT 24h | **Malintento**: `No / Sospetto / Confermato` |
| Compliance | comp2 | Se dati personali coinvolti → coinvolgere Legal/DPO | **Dati personali coinvolti**: `No / Sì` |

---

### 6. SUPPLY CHAIN (supply-chain.ts)

| Sezione | ID | Testo attuale | Campo da aggiungere |
|---------|-----|--------------|---------------------|
| Triage | tr4 | Verificare integrità artefatti (hash, firme, provenance) | **Integrità verificata**: `No / Sì` |
| Containment | c2 | Rollback a versione nota-buona | **Rollback eseguito**: `No / Sì` |
| Eradication | e1 | Patch/upgrade a versione sicura | **Patch applicata**: `No / Sì` |
| Recovery | r4 | Comunicazioni a clienti/partner se necessario | **Comunicazioni necessarie**: `No / Sì` |

---

### 7. RANSOMWARE (ransomware.ts)

| Sezione | ID | Testo attuale | Campo da aggiungere |
|---------|-----|--------------|---------------------|
| Triage | triage-1 | Confermare se cifratura/malware è in corso (attivo o contenuto) | **Stato**: `Attivo / Contenuto` |
| Triage | triage-4 | Verificare integrità e isolamento backup | **Backup integro/isolato**: `No / Sì` |
| Triage | triage-5 | Severity: se sistemi core o downtime critico | **Severity**: `P1 / P2 / P3` |
| Containment | containment-5 | Preservare evidenze (se forensics) | **Forensics richiesta**: `No / Sì` |
| Containment | containment-7 | Avviare Situation Room se ALTO/CRITICO | **Situation Room attivata**: `No / Sì` |
| Communications | comm-1 | Valutare CSIRT (NIS2) se significativo | **Notifica CSIRT**: `No / Sì` |
| Communications | comm-2 | Valutare GDPR se dati personali esfiltrati | **Dati personali esfiltrati**: `No / Sì` |
| Communications | comm-3 | Comunicazioni stakeholder (CdA/AD) per CRITICO | **Comunicazione CdA**: `No / Sì` |
| Evidence | evidence-3 | Snapshot/immagini e chain of custody (se illegittimo) | **Illegittimo sospetto**: `No / Sì` |

---

## Riepilogo Modifiche

| Playbook | Campi da aggiungere |
|----------|---------------------|
| Phishing | 9 nuovi campi |
| Data Exfiltration | 5 nuovi campi |
| DDoS | 6 nuovi campi |
| Physical Security | 7 nuovi campi |
| Unauthorized Access | 5 nuovi campi |
| Supply Chain | 4 nuovi campi |
| Ransomware | 9 nuovi campi |
| **TOTALE** | **45 nuovi campi interattivi** |

---

## Dettaglio tecnico

Per ogni campo, verrà aggiunto:
```typescript
hasInlineInput: true,
inlineInputLabel: 'Etichetta',
inlineInputValue: '',
inlineInputPlaceholder: 'Opzione1 / Opzione2'
```

I tipi di input saranno:
- **Scelte binarie**: `No / Sì`
- **Scelte multiple**: `Opzione1 / Opzione2 / Opzione3`
- **Valori numerici**: `es. 24` (per ore, minuti, etc.)
- **Severity standard**: `P1 / P2 / P3`

---

## File da modificare

1. `src/data/playbooks/phishing.ts`
2. `src/data/playbooks/data-exfiltration.ts`
3. `src/data/playbooks/ddos.ts`
4. `src/data/playbooks/physical-security.ts`
5. `src/data/playbooks/unauthorized-access.ts`
6. `src/data/playbooks/supply-chain.ts`
7. `src/data/playbooks/ransomware.ts`
