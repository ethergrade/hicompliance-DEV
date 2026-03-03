

# Piano: Modulo AI CISO Assistant

## Panoramica

Nuovo modulo **AI CISO Assistant** accessibile solo a `super_admin`. Interfaccia chat stile Grok (sfondo con costellazioni animate, stelle e comete) che dialoga con OpenAI GPT-4o-mini per analizzare dati di sicurezza mock e fornire remediation, executive summary e report PDF.

---

## Prerequisito: Chiave OpenAI

Servira la tua chiave OpenAI API da salvare come secret Supabase `OPENAI_API_KEY`. Te la chiedero prima di implementare.

---

## FASE 1 -- Accesso Super Admin

### 1a. Credenziali `superadmin@superadmin.com` / `superadmin@2026`

Aggiungere nel `AuthProvider.tsx` la stessa logica shortcut gia presente per `admin` e `sales`:
- Se email = `superadmin` -> redirect a `superadmin@superadmin.com` + password `superadmin@2026`
- Auto-signup se non esiste, assegnazione ruolo `super_admin` nella tabella `user_roles`

### 1b. Route protetta

- Nuova route `/ai-ciso` visibile SOLO se `isSuperAdmin === true`
- Non passa per `role_module_permissions` (hardcoded super_admin only)

---

## FASE 2 -- Edge Function `ai-ciso-chat`

### 2a. `supabase/functions/ai-ciso-chat/index.ts`

- Riceve `{ userPrompt, conversationHistory }` via POST
- Costruisce i messaggi OpenAI:
  - `system`: System Prompt dal MD 1 (guardrails inclusi dal MD 4)
  - `assistant`: Dati mock di contesto (firewall, endpoint, vulnerabilita, patch, alert) basati sul template MD 2
  - `user`: Prompt dell'utente
- Chiama `gpt-4o-mini` con `max_tokens: 2000`
- Ritorna la risposta strutturata
- Gestisce guardrails: input validation, no prompt injection

### 2b. Dati Mock

Hardcoded nella edge function, un dataset realistico:
- 245 endpoint (7 in attenzione, 3 offline)
- 1842 connessioni firewall bloccate, 3 anomalie regole
- 4 CVE (2 High, 1 Critical, 1 Medium)
- 2 patch failed (SRV2025-HYPERV, WS-PC-031)
- 1 alert critico ransomware (ALR-001)
- Log aggregati con 12 eventi sospetti

---

## FASE 3 -- Database

### 3a. Tabella `ai_ciso_conversations`

```text
ai_ciso_conversations
  - id (uuid PK)
  - user_id (uuid, ref auth.users)
  - user_prompt (text)
  - ai_response (text)
  - context_data (jsonb)
  - created_at (timestamptz)
```

RLS: solo l'utente proprietario puo leggere/scrivere le proprie conversazioni. Policy aggiuntiva per super_admin che vede tutto.

---

## FASE 4 -- Pagina UI `/ai-ciso`

### 4a. Sfondo animato stile Grok

- Canvas o elementi CSS per:
  - Campo stellare con punti luminosi fini che si muovono lentamente
  - Linee di costellazione sottilissime che collegano stelle vicine
  - Cometa che appare ogni ~15 secondi con scia luminosa
- Colori coerenti con HiCompliance (cyan, slate, dark)

### 4b. Interfaccia Chat

- Area messaggi scrollabile con bubble utente (destra) e AI (sinistra)
- Input in basso con placeholder "Analizza la postura di sicurezza..."
- Quick action buttons (template dal MD 3):
  - "Executive Summary"
  - "Remediation Prioritizzata"
  - "Trend Report"
  - "Note Compliance NIS2/GDPR"
- Risposte AI renderizzate con markdown (titoli, liste, badge colore per severity)

### 4c. Generazione Report PDF

- Pulsante "Genera Report PDF" sulla risposta AI
- Usa `jspdf` (gia installato) per generare PDF con template dal MD 6:
  - Executive Summary
  - Risk Findings
  - Remediation Plan
  - Compliance Notes
  - Trends & Metrics
  - Timestamp e branding HiCompliance

### 4d. Storico conversazioni

- Sidebar sinistra con lista conversazioni precedenti (da `ai_ciso_conversations`)
- Click per riaprire una conversazione passata

---

## FASE 5 -- Sidebar e Routing

### 5a. `AppSidebar.tsx`

Nuova voce nel gruppo admin (visibile solo super_admin):
```text
Gestione Multi-Cliente
  ...
  AI CISO Assistant   <-- NUOVO, icona Bot/Brain
```

### 5b. `App.tsx`

```text
<Route path="/ai-ciso" element={<AICiso />} />
```

Senza `ClientSelectionGuard` (e cross-organization).

---

## Riepilogo file

| File | Azione |
|---|---|
| `supabase/functions/ai-ciso-chat/index.ts` | Edge function OpenAI |
| `supabase/migrations/..._ai_ciso.sql` | Tabella conversazioni + RLS |
| `src/pages/AICiso.tsx` | Pagina principale con chat + sfondo animato |
| `src/components/ai-ciso/StarfieldBackground.tsx` | Canvas stelle/costellazioni/comete |
| `src/components/ai-ciso/ChatMessage.tsx` | Bubble messaggio con markdown |
| `src/components/ai-ciso/QuickActions.tsx` | Bottoni template prompt |
| `src/components/ai-ciso/ConversationHistory.tsx` | Sidebar storico |
| `src/components/ai-ciso/ReportGenerator.tsx` | Generazione PDF |
| `src/hooks/useAICiso.ts` | Hook per chiamate edge function e CRUD conversazioni |
| `src/components/auth/AuthProvider.tsx` | Shortcut login superadmin |
| `src/components/layout/AppSidebar.tsx` | Voce menu super_admin |
| `src/App.tsx` | Nuova route |

