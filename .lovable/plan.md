

## Piano: Aggiunta Pulsante "Vedi Esempio" nella Tabella Governance

### Obiettivo
Aggiungere un pulsante contestuale nella sezione "Contatti di Emergenza" che apre un dialog mostrando la tabella compilata con i dati di esempio del PDF.

---

### Dati di Esempio (dal PDF)

| Nome | Titolo | Ruolo IRP | Telefono | Email | Responsabilità |
|------|--------|-----------|----------|-------|----------------|
| Marco Bianchi | IT MANAGER | Incident Response Team | 3333425678 | mb@azienda.com | Gestione tecnica infrastruttura, isolamento sistemi, forensica |
| Luca Rossi | RISK MANAGER | Incident Response Manager | 3333425678 | lr@azienda.com | Coordinamento operativo IR, dichiarazione incidente, tempistiche risposta |
| Andrea Verdi | CISO | Steering Committee | 3333425678 | av@azienda.com | Supervisione strategica, approvazione escalation critiche, liaison esterno |
| Sonia Neri | CTO | Incident Response Program Owner | 3333425678 | sn@azienda.com | Ownership del programma IR, budget, risorse |
| Mario Rossi | CTO CISO | Communications Lead | 3333425678 | mr@azienda.com | Comunicazioni interne/esterne, media relations, cliente notification |
| Luca Azzurri | LEGAL DEPARTMENT | Legal Counsel | 3333425678 | la@azienda.com | Valutazione obbligo GDPR, notifica autorità, comunicazioni legali |
| Matteo Verdi | CISO IT MANAGER | Cyber Insurance | 3333425678 | mv@azienda.com | Gestione polizza cyber, notifica sinistro, coordinamento perito |
| Paolo Biondi | Referente CSIRT | Referente CSIRT | 3333425678 | pb@azienda.com | Notifica CSIRT Italia, gestione pre-alert/alert/report, coordinamento ACN |

---

### Modifiche

#### File: `src/components/irp/GovernanceContactsTable.tsx`

**1. Aggiungere stato per il dialog esempio**
```typescript
const [showExample, setShowExample] = useState(false);
```

**2. Definire i dati di esempio**
Creare un array `exampleContacts` con tutti i contatti del PDF.

**3. Aggiungere pulsante "Vedi Esempio"**
Posizionato nell'header della Card, accanto al titolo o sotto il testo introduttivo:
```tsx
<Button 
  variant="outline" 
  size="sm"
  onClick={() => setShowExample(true)}
>
  <Eye className="w-4 h-4 mr-2" />
  Vedi Esempio
</Button>
```

**4. Aggiungere Dialog con tabella esempio**
Un Dialog che mostra:
- Titolo: "Esempio di Compilazione"
- Testo introduttivo con il placeholder CISO compilato ("Mario Bianchi")
- Tabella identica a quella principale ma popolata con i dati esempio
- Nota a piè pagina: "Questo è un esempio. I dati reali andranno inseriti tramite il pulsante 'Aggiungi Contatto'."

**5. Importare componenti necessari**
```typescript
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Eye } from 'lucide-react';
```

---

### Layout Finale

```text
+--------------------------------------------------+
|  GOVERNANCE E ORGANI DECISIONALI    [Vedi Esempio]|
|                                                   |
|  Nel caso la figura di CISO non sia presente...   |
|                                                   |
|  +----------------------------------------------+ |
|  | Nome | Titolo | Ruolo | Contatto | Respons.  | |
|  +----------------------------------------------+ |
|  | (dati reali o messaggio vuoto)               | |
|  +----------------------------------------------+ |
|                                                   |
|  [+ Aggiungi Contatto]                            |
+---------------------------------------------------+
```

**Dialog Esempio (quando aperto):**
```text
+--------------------------------------------------+
|  Esempio di Compilazione                    [X]   |
|                                                   |
|  Nel caso la figura di CISO non sia presente...   |
|  sarà coperta da: Mario Bianchi                   |
|                                                   |
|  +----------------------------------------------+ |
|  | Marco Bianchi | IT MANAGER | IRT | ... | ... | |
|  | Luca Rossi | RISK MANAGER | Manager | ... |   |
|  | ... (tutti gli 8 contatti esempio)           | |
|  +----------------------------------------------+ |
|                                                   |
|  ℹ️ Questo è un esempio. Inserisci i tuoi dati    |
|     tramite "Aggiungi Contatto".                  |
+---------------------------------------------------+
```

---

### Riepilogo File da Modificare

| File | Modifica |
|------|----------|
| `src/components/irp/GovernanceContactsTable.tsx` | Aggiungere pulsante, dialog e dati esempio |

