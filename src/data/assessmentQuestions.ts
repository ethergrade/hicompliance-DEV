export type AssessmentResponse = "completato" | "pianificato_in_corso" | "non_iniziato" | "non_applicabile" | null;

export interface AssessmentQuestion {
  id: number;
  question: string;
  priority: "ALTA" | "MEDIA" | "BASSA";
  dependency?: string; // order_index (1-based) of parent question this depends on
}

export interface AssessmentCategory {
  name: string;
  questions: AssessmentQuestion[];
}

export const ASSESSMENT_CATEGORIES: AssessmentCategory[] = [
  {
    name: "Business Continuity, Disaster recovery, Backup",
    questions: [
      {
        id: 1,
        question: "L'organizzazione ha definito e documentato gli obiettivi di continuità operativa che devono essere perseguiti nella gestione degli scenari di crisi?",
        priority: "MEDIA",
      },
      {
        id: 2,
        question: "L'organizzazione ha effettuato una business impact analysis per identificare i servizi essenziali e individuare le risorse necessarie per garantirne l'erogazione?",
        priority: "MEDIA",
      },
      {
        id: 3,
        question: "Esistono criteri per valutare la gravità dell'interruzione operativa causata da un incidente?",
        priority: "MEDIA",
      },
      {
        id: 4,
        question: "La sicurezza delle informazioni e la continuità dei servizi essenziali sono stati descritti/documentati e inclusi nei piani di continuità (BCP)?",
        priority: "MEDIA",
      },
      {
        id: 5,
        question: "L'organizzazione ha approvato politiche e procedure per la gestione del backup di dati e applicazioni su dispositivi, supporti di archiviazione, cloud, DB e server?",
        priority: "MEDIA",
      },
      {
        id: 6,
        question: "L'organizzazione ha predisposto soluzioni di disaster recovery (DR)?",
        priority: "BASSA",
      },
      {
        id: 7,
        question: "L'Organizzazione ha prevista la ridondanza di tutti i sistemi per garantire la disponibilità dell'impianto di elaborazione delle informazioni ed erogazione dei servizi principali?",
        priority: "MEDIA",
      },
      {
        id: 8,
        question: "La tua organizzazione gestisce e verifica le procedure di backup delle informazioni?",
        priority: "MEDIA",
      },
      {
        id: 9,
        question: "Eseguite test sui vostri sistemi di backup per garantire che i dati possano essere ripristinati correttamente?",
        priority: "MEDIA",
      },
      {
        id: 10,
        question: "Il personale coinvolto riceve formazione e partecipa a esercitazioni di simulazione di crisi?",
        priority: "MEDIA",
      },
      {
        id: 11,
        question: "Esiste un processo per gestire i requisiti di capacity di tutti i sistemi in base al processo aziendale e alla sua criticità?",
        priority: "MEDIA",
      },
    ],
  },
  {
    name: "Certificazioni",
    questions: [
      {
        id: 12,
        question: "L'Organizzazione ha implementato un sistema per la gestione della qualità certificato ISO 9001?",
        priority: "BASSA",
      },
      {
        id: 13,
        question: "L'Organizzazione ha implementato un sistema per la gestione della qualità certificato ISO/IEC 27001?",
        priority: "MEDIA",
      },
      {
        id: 14,
        question: "Esiste una procedura per monitorare la disponibilità di nuovi schemi di certificazione, linee guida e indicazioni per la sicurezza sicurezza?",
        priority: "MEDIA",
      },
    ],
  },
  {
    name: "Crittografia",
    questions: [
      {
        id: 15,
        question: "La tua organizzazione utilizza soluzioni di comunicazione vocale, video e di testo protette?",
        priority: "MEDIA",
      },
      {
        id: 16,
        question: "Esistono politiche per l'utilizzo di strumenti di videoconferenza protetti per garantire la sicurezza delle riunioni aziendali?",
        priority: "MEDIA",
      },
      {
        id: 17,
        question: "I dispositivi aziendali sono crittografati e protetti contro gli accessi non autorizzati?",
        priority: "ALTA",
      },
      {
        id: 18,
        question: "La crittografia è applicata a tutte le comunicazioni di rete per evitare intercettazioni?",
        priority: "ALTA",
      },
      {
        id: 19,
        question: "Le chiavi crittografiche sono protette contro l'accesso non autorizzato e lo smarrimento?",
        priority: "ALTA",
      },
      {
        id: 20,
        question: "Disponete di politiche e procedure formali e documentate che specificano l'uso della crittografia e della cifratura all'interno della vostra organizzazione?",
        priority: "ALTA",
      },
    ],
  },
  {
    name: "Gestione delle identità Gestione degli accessi",
    questions: [
      {
        id: 21,
        question: "La tua organizzazione gestisce le autorizzazioni all'accesso a reti e sistemi (inclusi i privilegi minimi e la separazione dei compiti)?",
        priority: "ALTA",
      },
      {
        id: 22,
        question: "Esiste una politica/procedura documentata che descrive il processo di gestione degli accessi logici e fisici a reti e sistemi?",
        priority: "MEDIA",
      },
      {
        id: 23,
        question: "Applicate il principio del privilegio minimo, assicurandovi che gli utenti abbiano solo l'accesso necessario per svolgere le loro funzioni lavorative?",
        priority: "MEDIA",
      },
      {
        id: 24,
        question: "Esistono procedure per concedere e revocare l'accesso in base a cambiamenti di ruolo, promozioni o interruzioni del rapporto di collaborazione?",
        priority: "ALTA",
      },
      {
        id: 25,
        question: "I profili autorizzativi e i diritti di accesso sono rivisti periodicamente?",
        priority: "MEDIA",
      },
      {
        id: 26,
        question: "Gli utenti di reti e sistemi dispongono di identificativo (user ID) univoco?",
        priority: "ALTA",
      },
      {
        id: 27,
        question: "Avete adottato una politica per l'utilizzo di password di accesso sicure?",
        priority: "ALTA",
      },
      {
        id: 28,
        question: "Monitorate e registrate l'accesso logico ai sistemi e ai dati critici?",
        priority: "ALTA",
      },
      {
        id: 29,
        question: "I log di accesso vengono verificati periodicamente per individuare attività insolite o non autorizzate?",
        priority: "ALTA",
      },
      {
        id: 30,
        question: "Esistono strumenti per verificare e modificare regolarmente i diritti di accesso?",
        priority: "MEDIA",
      },
      {
        id: 31,
        question: "La tua organizzazione gestisce l'accesso remoto?",
        priority: "ALTA",
      },
      {
        id: 32,
        question: "Utilizzate metodi di autenticazione avanzati (ad esempio autenticazione a più fattori, MFA) per accedere a sistemi critici e informazioni sensibili, ivi inclusi i dati particolari?",
        priority: "ALTA",
      },
      {
        id: 33,
        question: "La tua organizzazione gestisce e protegge l'accesso fisico alle risorse?",
        priority: "ALTA",
      },
      {
        id: 34,
        question: "Monitorate e registrate l'accesso fisico ai sistemi e ai dati critici?",
        priority: "ALTA",
      },
      {
        id: 35,
        question: "Avete implementato soluzioni di DLP?",
        priority: "MEDIA",
      },
      {
        id: 36,
        question: "Proteggete i dati inattivi da accessi non autorizzati?",
        priority: "MEDIA",
      },
    ],
  },
  {
    name: "Gestione degli incidenti",
    questions: [
      {
        id: 37,
        question: "L'Organizzazione dispone di una politica e/o di una procedura documentata che descriva il processo per rispondere in modo celere ed efficace agli incidenti di sicurezza informativa?",
        priority: "ALTA",
      },
      {
        id: 38,
        question: "Assegnate la priorità e classificate gli incidenti in base alla loro gravità e al loro impatto?",
        priority: "ALTA",
      },
      {
        id: 39,
        question: "Vengono condotte valutazioni dei rischi correlati a possibili incidenti specifici o a cambiamenti nel panorama delle minacce?",
        priority: "ALTA",
      },
      {
        id: 40,
        question: "Disponete di sistemi di rilevazione e monitoraggio di reti e sistemi in grado di intercettare eventuali incidenti informatici?",
        priority: "ALTA",
      },
      {
        id: 41,
        question: "La tua organizzazione è in grado di analizzare le notifiche provenienti dai sistemi di rilevamento?",
        priority: "ALTA",
      },
      {
        id: 42,
        question: "Integrate le lezioni apprese dagli incidenti passati nelle vostre politiche e procedure?",
        priority: "ALTA",
      },
      {
        id: 43,
        question: "Si è in grado di valutare il potenziale danno transfrontaliero degli incidenti, considerando come potrebbero impattare realtà in altri paesi UE?",
        priority: "ALTA",
      },
      {
        id: 44,
        question: "Documentate tutti gli incidenti, a partire da quelli che potrebbero avere un impatto significativo?",
        priority: "ALTA",
      },
      {
        id: 45,
        question: "Esistono procedure per raccogliere e conservare le prove durante un incidente?",
        priority: "ALTA",
      },
      {
        id: 46,
        question: "La tua organizzazione prevede piani di risposta agli incidenti informatici?",
        priority: "ALTA",
      },
      {
        id: 47,
        question: "Sono state adottate misure preventive per attenuare gli incidenti prima che causino danni significativi?",
        priority: "ALTA",
      },
      {
        id: 48,
        question: "La tua organizzazione analizza gli eventi rilevati per comprendere obiettivi e metodi di attacco?",
        priority: "ALTA",
      },
      {
        id: 49,
        question: "Il personale è consapevole dei propri ruoli e responsabilità durante un incidente?",
        priority: "ALTA",
      },
      {
        id: 50,
        question: "Eseguite simulazioni di incidenti o esercitazioni pratiche per testare le vostre capacità di risposta agli incidenti e di recupero?",
        priority: "ALTA",
      },
      {
        id: 51,
        question: "Valutate la perdita finanziaria derivante da un incidente?",
        priority: "ALTA",
      },
      {
        id: 52,
        question: "Le terze parti interessate vengono informate tempestivamente in caso di incindente?",
        priority: "ALTA",
      },
      {
        id: 53,
        question: "Esistono procedure per informare i destinatari dei vostri servizi di incidenti significativi che potrebbero influire negativamente sulla fornitura dei servizi?",
        priority: "ALTA",
      },
      {
        id: 54,
        question: "Segnalate, eventualmente in forma involontaria, gli incidenti più rilevanti allo CSIRT Italia?",
        priority: "MEDIA",
      },
      {
        id: 55,
        question: "Esistono procedure per garantire che gli incidenti vengano segnalati al CSIRT o all'autorità competente senza indebito ritardo?",
        priority: "MEDIA",
      },
      {
        id: 56,
        question: "Tenete registri dettagliati di tutti gli incidenti segnalati al CSIRT o all'autorità competente?",
        priority: "MEDIA",
      },
      {
        id: 57,
        question: "Stabilite quali informazioni includere nelle notifiche degli incidenti per consentire al CSIRT o all'autorità competente di determinare eventuali impatti transfrontalieri?",
        priority: "MEDIA",
      },
      {
        id: 58,
        question: "Fornite formazione ai dipendenti su come identificare gli incidenti significativi e sulle procedure per segnalarli?",
        priority: "ALTA",
      },
      {
        id: 59,
        question: "La tua organizzazione esamina regolarmente gli incidenti passati per migliorare i processi associati?",
        priority: "ALTA",
      },
      {
        id: 60,
        question: "La tua organizzazione ha adottato processi adeguati o altre soluzioni per contenere le conseguenze di un  incidente di sicurezza informatica?",
        priority: "ALTA",
      },
    ],
  },
  {
    name: "Gestione del rischio",
    questions: [
      {
        id: 61,
        question: "L'Organizzazione ha definito un processo di gestione dei rischi per la sicurezza di reti e sistemi?",
        priority: "ALTA",
      },
      {
        id: 62,
        question: "Vengono effettuati controlli e revisioni regolari per garantire il rispetto di queste politiche?",
        priority: "ALTA",
      },
      {
        id: 63,
        question: "Queste politiche di analisi dei rischi vengono riviste e aggiornate per riflettere le nuove minacce e vulnerabilità?",
        priority: "ALTA",
      },
      {
        id: 64,
        question: "La tua organizzazione ha implementato controlli per la sicurezza di reti e sistemi adeguati ai rischi individuati?",
        priority: "ALTA",
      },
      {
        id: 65,
        question: "I documenti sull'analisi dei rischi e sulla sicurezza delle informazioni vengono rivisti e aggiornati per garantire che rimangano pertinenti ed efficaci?",
        priority: "ALTA",
      },
      {
        id: 66,
        question: "Gli organi direttivi sono attivamente coinvolti nella valutazione dell'efficacia di queste misure?",
        priority: "ALTA",
      },
      {
        id: 67,
        question: "Gli organi direttivi supervisionano l'attuazione delle misure di gestione del rischio informatico?",
        priority: "ALTA",
      },
      {
        id: 68,
        question: "Gli organi direttivi della vostra organizzazione hanno approvato formalmente le misure di gestione del rischio di cybersecurity in atto?",
        priority: "ALTA",
      },
    ],
  },
  {
    name: "Gestione delle risorse",
    questions: [
      {
        id: 69,
        question: "Esiste un inventario di tutti i beni associati alle strutture informatiche e di elaborazione dei dati a supporto dell'erogazione dei servizi?",
        priority: "MEDIA",
      },
      {
        id: 70,
        question: "L'inventario è costantemente e regolarmente aggiornato?",
        priority: "MEDIA",
      },
      {
        id: 71,
        question: "L'inventario comprende i dispositivi e i sistemi fisici e logici (ad esempio computer, dispositivi mobili, dispositivi medici in rete, macchine virtuali, ecc.)?",
        priority: "MEDIA",
      },
      {
        id: 72,
        question: "L'inventario include le piattaforme e delle applicazioni software (ad esempio, Microsoft Windows, OS X, Linux, Amiga OS X, ecc.)?",
        priority: "MEDIA",
      },
      {
        id: 73,
        question: "I proprietari di asset sono tenuti a garantire la sicurezza e il corretto utilizzo dei propri asset?",
        priority: "MEDIA",
      },
      {
        id: 74,
        question: "Gli asset vengono classificati in base alla loro  criticità per la sicurezza informatica dell'Organizzazione?",
        priority: "MEDIA",
      },
      {
        id: 75,
        question: "Esiste una politica (regolamento) che definisca il corretto utilizzo degli asset e specifici i controlli attivati per accertarlo?",
        priority: "MEDIA",
      },
      {
        id: 76,
        question: "La tua organizzazione monitora la presenza di applicazioni non autorizzate sui device?",
        priority: "MEDIA",
      },
      {
        id: 77,
        question: "La tua organizzazione gestisce identità e credenziali per l'accesso ai dispositivi?",
        priority: "MEDIA",
      },
      {
        id: 78,
        question: "L'organizzazione ha definito un processo  per lo smaltimento sicuro e il riutilizzo di attrezzature/asset (che preveda la cancellazione irreversibile delle informazioni precedentemente memorizzate?",
        priority: "MEDIA",
      },
      {
        id: 79,
        question: "L'organizzazione ha creato una politica formale per la gestione dei malware che includa soluzioni efficaci?",
        priority: "MEDIA",
      },
      {
        id: 80,
        question: "La soluzione antimalware è implementata su tutti i sistemi?",
        priority: "MEDIA",
      },
    ],
  },
  {
    name: "Gestione fornitori e acquisti",
    questions: [
      {
        id: 81,
        question: "Esiste una politica/procedura documentata che descrive il processo di gestione dei rischi per la sicurezza delle informazioni associati all'uso dei prodotti o dei servizi del fornitore?",
        priority: "MEDIA",
      },
      {
        id: 82,
        question: "Monitorate costantemente la vostra supply chain per individuare rischi nuovi ed emergenti?",
        priority: "ALTA",
      },
      {
        id: 83,
        question: "Disponete di procedure per gestire gli incidenti che hanno origine nella vostra supply chain o che la riguardano?",
        priority: "ALTA",
      },
      {
        id: 84,
        question: "Garantite una comunicazione tempestiva di potenziali minacce o incidenti?",
        priority: "ALTA",
      },
      {
        id: 85,
        question: "Eseguite audit o valutazioni regolari dei vostri fornitori per garantire la conformità ai requisiti di sicurezza?",
        priority: "MEDIA",
      },
      {
        id: 86,
        question: "I contratti con i fornitori e i service provider includono requisiti di sicurezza specifici?",
        priority: "ALTA",
      },
      {
        id: 87,
        question: "Tutti gli utenti, compresi dipendenti, appaltatori e fornitori di servizi terzi, sono tenuti a utilizzare MFA per accedere a sistemi sensibili?",
        priority: "ALTA",
      },
      {
        id: 88,
        question: "L'accesso del fornitore alle risorse informative e all'infrastruttura è controllato e monitorato?",
        priority: "ALTA",
      },
      {
        id: 89,
        question: "Gli SLA (Service Level Agreement) sono definiti per tutti i fornitori di servizi?",
        priority: "MEDIA",
      },
      {
        id: 90,
        question: "L'acquisto di beni e servizi prevede fra i requisiti criteri di sicurezza delle reti e dei sistemi?",
        priority: "MEDIA",
      },
      {
        id: 91,
        question: "Sono presenti e nel caso gestiti licenze, proprietà del codice e diritti di proprietà intellettuale relativi allo sviluppo affidato in outsourcing?",
        priority: "MEDIA",
      },
    ],
  },
  {
    name: "Governance",
    questions: [
      {
        id: 92,
        question: "L'impegno degli organi direttivi dell'organizzazione in materia di sicurezza informatica è dimostrato politiche e obiettivi definiti, compatibili con la direzione strategica dell'organizzazione?",
        priority: "ALTA",
      },
      {
        id: 93,
        question: "La tua organizzazione ha definito i ruoli e le responsabilità per la sicurezza informatica internamente per il personale dipendente ed esternamente per le terze parti (ad esempio, fornitori, clienti e appaltatori)?",
        priority: "ALTA",
      },
      {
        id: 94,
        question: "Le politiche e le procedure adottate per garantire la sicurezza di reti e sistemi sono allineate ai principali standard di sicurezza informatica  (ad esempio, ISO/IEC 27001, NIST)?",
        priority: "MEDIA",
      },
      {
        id: 95,
        question: "Le politiche e procedure pertinenti la sicurezza di reti e sistemi sono riviste e aggiornate periodicamente?",
        priority: "ALTA",
      },
      {
        id: 96,
        question: "Esiste una persona o un team designato responsabile della supervisione delle politiche e delle pratiche di sicurezza informatica?",
        priority: "ALTA",
      },
      {
        id: 97,
        question: "Gli organi direttivi sono consapevoli della loro potenziale responsabilità in caso di inosservanza degli adempimenti normativi previsti dalla NIS2?",
        priority: "ALTA",
      },
      {
        id: 98,
        question: "I membri degli organi direttivi sono tenuti a sottoporsi a una formazione periodica sulla sicurezza informatica?",
        priority: "ALTA",
      },
      {
        id: 99,
        question: "Esiste una documentazione attestante la partecipazione e il completamento dei programmi di formazione da parte di tutti i membri degli organi direttivi?",
        priority: "MEDIA",
      },
      {
        id: 100,
        question: "Tutti gli utenti privilegiati nella tua organizzazione comprendono i propri ruoli e responsabilità?",
        priority: "ALTA",
      },
    ],
  },
  {
    name: "HR e formazione",
    questions: [
      {
        id: 101,
        question: "Esiste una procedura per garantire che tutto il personale sia consapevole delle proprie responsabilità in materia di sicurezza delle informazioni?",
        priority: "ALTA",
      },
      {
        id: 102,
        question: "Sono in atto programmi o iniziative specifici per promuovere la formazione e la consapevolezza continue sulla sicurezza informatica all'interno dell'organizzazione?",
        priority: "ALTA",
      },
      {
        id: 103,
        question: "La formazione sulla sicurezza informatica viene erogata ai dipendenti a intervalli regolari e aggiornata secondo necessità?",
        priority: "ALTA",
      },
      {
        id: 104,
        question: "Misurate l'efficacia del vostro programma di formazione sulla sicurezza informatica?",
        priority: "ALTA",
      },
      {
        id: 105,
        question: "Fornite formazione al vostro personale sui requisiti per l'utilizzo di prodotti, servizi e processi ICT certificati?",
        priority: "BASSA",
      },
      {
        id: 106,
        question: "Esiste un processo di screening per l'inserimento di personale a tempo pieno, part-time e temporaneo?",
        priority: "ALTA",
      },
      {
        id: 107,
        question: "I termini e le condizioni di impiego includono la politica per la sicurezza informatica dell'organizzazione?",
        priority: "ALTA",
      },
      {
        id: 108,
        question: "Esiste un processo disciplinare formale, comunicato a tutto il personale, che consenta all'organizzazione di prendere provvedimenti contro i dipendenti che hanno commesso una violazione della sicurezza delle informazioni?",
        priority: "MEDIA",
      },
      {
        id: 109,
        question: "Il personale a tempo pieno, part-time e temporaneo è tenuto a firmare accordi di riservatezza o di non divulgazione prima di poter accedere alle informazioni riservate dell'organizzazione e ad altri beni associati?",
        priority: "ALTA",
      },
      {
        id: 110,
        question: "E' ammesso lo smart working ed è adeguatamente regolamentato?",
        priority: "ALTA",
      },
    ],
  },
  {
    name: "Igiene informatica",
    questions: [
      {
        id: 111,
        question: "Il vostro programma di formazione copre argomenti chiave come phishing, ingegneria sociale, gestione delle password e pratiche di sicurezza su Internet?",
        priority: "MEDIA",
      },
      {
        id: 112,
        question: "Esistono linee guida per l'uso sicuro dei dispositivi aziendali e personali (BYOD)?",
        priority: "MEDIA",
      },
      {
        id: 113,
        question: "Sono disponibili policy sulle password vengono riviste e aggiornate?",
        priority: "MEDIA",
      },
      {
        id: 114,
        question: "Vengono applicate policy per password complesse, compreso l'uso dell'autenticazione a più fattori (MFA)?",
        priority: "MEDIA",
      },
      {
        id: 115,
        question: "Sono disponibili policy documentate che delineano le pratiche di base in materia di igiene informatica per tutti i dipendenti?",
        priority: "MEDIA",
      },
    ],
  },
  {
    name: "Manutenzione e miglioramento continuo",
    questions: [
      {
        id: 116,
        question: "Disponete di processi per ricevere, analizzare e rispondere alle vulnerabilità segnalate all'organizzazione da fonti interne ed esterne (ad esempio test interni, bollettini sulla sicurezza o ricercatori sulla sicurezza)?",
        priority: "ALTA",
      },
      {
        id: 117,
        question: "Avete sviluppato e implementato un piano di gestione delle vulnerabilità?",
        priority: "MEDIA",
      },
      {
        id: 118,
        question: "Tutti i sistemi e i software vengono regolarmente aggiornati e sottoposti a patch per risolvere le vulnerabilità note?",
        priority: "ALTA",
      },
      {
        id: 119,
        question: "La tua organizzazione monitora le vulnerabilità dei sistemi tramite scansioni regolari?",
        priority: "MEDIA",
      },
      {
        id: 120,
        question: "Mantenete una separazione tra l'ambiente di sviluppo e test e l'ambiente di produzione?",
        priority: "MEDIA",
      },
      {
        id: 121,
        question: "Ricevete e condividete informazioni su minacce e vulnerabilità con organizzazioni esterne?",
        priority: "BASSA",
      },
      {
        id: 122,
        question: "Identificate e documentate le vulnerabilità delle risorse?",
        priority: "MEDIA",
      },
      {
        id: 123,
        question: "La tua organizzazione controlla le modifiche alla configurazione dei sistemi?",
        priority: "MEDIA",
      },
      {
        id: 124,
        question: "Utilizzate strumenti SIEM (Security Information and Event Management)?",
        priority: "MEDIA",
      },
      {
        id: 125,
        question: "È stata definita una policy per la raccolta analisi e conservazione dei log applicativi e di sistema?",
        priority: "ALTA",
      },
      {
        id: 126,
        question: "I log vengono raccolti, analizzati e conservati secondo la policy?",
        priority: "ALTA",
      },
    ],
  },
  {
    name: "Network Security Best Practices & Operations",
    questions: [
      {
        id: 127,
        question: "L'organizzazione protegge l'integrità della rete e utilizza un'appropriata segmentazione della rete?",
        priority: "ALTA",
      },
      {
        id: 128,
        question: "Sono presenti firewall (next-gen), sistemi di rilevamento/prevenzione delle intrusioni e configurazioni di rete sicure?",
        priority: "ALTA",
      },
      {
        id: 129,
        question: "La tua organizzazione monitora l'attività di rete per rilevare eventi di sicurezza informatica?",
        priority: "MEDIA",
      },
      {
        id: 130,
        question: "Esiste un sistema di allerta automatizzato per attività sospette a livello infrastruttura Network?",
        priority: "MEDIA",
      },
    ],
  },
  {
    name: "Sviluppo software",
    questions: [
      {
        id: 131,
        question: "La tua organizzazione monitora la presenza di codice malevolo?",
        priority: "MEDIA",
      },
      {
        id: 132,
        question: "La sicurezza è requisito di ogni attività di sviluppo interno?",
        priority: "MEDIA",
      },
    ],
  },
];

export const PRIORITY_WEIGHTS: Record<string, number> = {
  ALTA: 1,
  MEDIA: 0.5,
  BASSA: 0.25,
};

export const FEEDBACK_SCORES: Record<string, number | null> = {
  completato: 100,
  pianificato_in_corso: 50,
  non_iniziato: 0,
  non_applicabile: null, // excluded from calculation
};

export type RiskLevel = 'altissimo' | 'alto' | 'moderato' | 'basso' | 'molto_basso';

export const RISK_THRESHOLDS: { min: number; level: RiskLevel; label: string; multiplier: number; color: string }[] = [
  { min: 0, level: 'altissimo', label: 'Altissimo', multiplier: 0.9, color: 'text-red-600' },
  { min: 20, level: 'alto', label: 'Alto', multiplier: 0.8, color: 'text-red-500' },
  { min: 40, level: 'moderato', label: 'Moderato', multiplier: 0.6, color: 'text-orange-500' },
  { min: 60, level: 'basso', label: 'Basso', multiplier: 0.4, color: 'text-yellow-500' },
  { min: 80, level: 'molto_basso', label: 'Molto basso', multiplier: 0.2, color: 'text-green-500' },
];

/**
 * Calculate weighted score for a category.
 * Score = sum(feedback * priority_weight) / sum(max_feedback * priority_weight) * 100
 * Non applicabile questions are excluded.
 */
export function calculateCategoryScore(
  questions: AssessmentQuestion[],
  responses: Record<number, AssessmentResponse>
): number {
  let weightedSum = 0;
  let maxWeightedSum = 0;

  for (const q of questions) {
    const response = responses[q.id];
    if (!response || response === 'non_applicabile') continue;

    const weight = PRIORITY_WEIGHTS[q.priority] ?? 0.5;
    const feedbackScore = FEEDBACK_SCORES[response];
    if (feedbackScore === null || feedbackScore === undefined) continue;

    weightedSum += feedbackScore * weight;
    maxWeightedSum += 100 * weight;
  }

  if (maxWeightedSum === 0) return 0;
  return Math.round((weightedSum / maxWeightedSum) * 100);
}

export function getRiskFromScore(score: number): { level: RiskLevel; label: string; multiplier: number; color: string } {
  // Higher score = lower risk
  for (let i = RISK_THRESHOLDS.length - 1; i >= 0; i--) {
    if (score >= RISK_THRESHOLDS[i].min) return RISK_THRESHOLDS[i];
  }
  return RISK_THRESHOLDS[0];
}

export const RESPONSE_LABELS: Record<string, string> = {
  completato: "Completato",
  pianificato_in_corso: "Pianificato / in corso",
  non_iniziato: "Non iniziato",
  non_applicabile: "Non applicabile",
};

export const RESPONSE_COLORS: Record<string, string> = {
  completato: "bg-green-500/10 text-green-500 border-green-500/20",
  pianificato_in_corso: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
  non_iniziato: "bg-red-500/10 text-red-400 border-red-500/20",
  non_applicabile: "bg-muted text-muted-foreground border-border",
};

export const CATEGORY_DESCRIPTIONS: Record<string, string> = {
  'Governance': 'Struttura di gestione della sicurezza, definizione delle responsabilità, strategie e politiche per garantire la conformità e la resilienza aziendale.',
  'Gestione del rischio': 'Identificazione, valutazione e mitigazione dei rischi di cybersecurity per garantire la protezione degli asset critici e la continuità operativa.',
  'Gestione degli incidenti': 'Procedure di rilevamento, risposta e ripristino da incidenti di sicurezza per minimizzare l\'impatto e prevenire future compromissioni.',
  'Business Continuity, Disaster recovery, Backup': 'Strategie di continuità operativa, gestione della crisi, ripristino dei servizi IT e politiche di backup per garantire la resilienza aziendale.',
  'HR e formazione': 'Formazione del personale sulla sicurezza informatica, policy di accesso e consapevolezza per ridurre il rischio umano nelle minacce cyber.',
  'Gestione delle identità Gestione degli accessi': 'Controllo degli accessi, autenticazione, autorizzazione e protezione delle identità digitali per prevenire accessi non autorizzati ai sistemi.',
  'Gestione delle risorse': 'Allocazione e protezione degli asset IT, incluse infrastrutture fisiche e virtuali, per garantire la sicurezza e l\'efficienza operativa.',
  'Gestione fornitori e acquisti': 'Valutazione della sicurezza dei fornitori e gestione degli approvvigionamenti (Supply Chain) per ridurre i rischi derivanti da terze parti.',
  'Manutenzione e miglioramento continuo': 'Aggiornamento e ottimizzazione costante delle misure di sicurezza per rispondere all\'evoluzione delle minacce cyber.',
  'Sviluppo software': 'Adozione di pratiche sicure nello sviluppo applicativo, inclusi secure coding, testing e gestione delle vulnerabilità.',
  'Igiene informatica': 'Adozione di best practices per la protezione di sistemi e dati, incluse patching, aggiornamenti e hardening delle configurazioni.',
  'Crittografia': 'Implementazione di tecniche crittografiche per la protezione dei dati sensibili in transito e a riposo.',
  'Network Security Best Practices & Operations': 'Protezione delle reti aziendali attraverso firewall, segmentazione, monitoraggio del traffico e gestione delle vulnerabilità.',
  'Certificazioni': 'Adozione e mantenimento di certificazioni di sicurezza (ISO 27001) per dimostrare la conformità e la maturità dell\'azienda.',
};
