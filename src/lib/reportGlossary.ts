/**
 * reportGlossary.ts
 * Termini tecnici usati nei report SurfaceScan360 e DarkRisk360.
 * Spiegazioni semplificate per il lettore non tecnico.
 */

export interface GlossaryTerm {
  term: string;
  definition: string;
}

export const REPORT_GLOSSARY: GlossaryTerm[] = [
  // ── DNS & Mail security ───────────────────────────────────────────────────
  {
    term: 'DMARC',
    definition:
      'Protocollo email che istruisce i server destinatari su cosa fare con messaggi che non superano i controlli SPF o DKIM (rifiutare, quarantena, solo monitoraggio). Senza DMARC il dominio può essere usato per phishing.',
  },
  {
    term: 'DKIM',
    definition:
      'Firma digitale applicata alle email in uscita. Il destinatario verifica la firma tramite DNS: se manca o non coincide il messaggio potrebbe essere contraffatto.',
  },
  {
    term: 'SPF',
    definition:
      'Record DNS che elenca i server autorizzati a inviare email per conto del dominio. Riduce lo spam e la possibilità di impersonare il mittente.',
  },
  {
    term: 'DNSSEC',
    definition:
      'Estensione del DNS che aggiunge firme crittografiche ai record. Previene attacchi DNS spoofing in cui risposte false reindirizzano gli utenti verso siti malevoli.',
  },
  {
    term: 'MX record',
    definition:
      'Record DNS che indica quali server gestiscono la posta elettronica in ingresso per un dominio. Assenza di MX = nessuna casella email ufficiale su quel dominio.',
  },
  {
    term: 'CAA record',
    definition:
      'Record DNS che limita quali Autorità di Certificazione (CA) possono emettere certificati SSL per il dominio. Riduce il rischio di certificati fraudolenti.',
  },
  {
    term: 'SOA record',
    definition:
      'Record DNS "Start of Authority": indica il nameserver primario e i parametri di gestione della zona DNS. Utile per identificare il provider DNS.',
  },
  // ── Web & TLS ─────────────────────────────────────────────────────────────
  {
    term: 'SSL / TLS',
    definition:
      'Protocollo che cifra le comunicazioni tra browser e server (HTTPS). TLS è la versione moderna. Versioni obsolete (SSLv3, TLS 1.0/1.1) hanno vulnerabilità note.',
  },
  {
    term: 'HSTS',
    definition:
      'Header HTTP Strict-Transport-Security: forza il browser a usare sempre HTTPS per il sito, impedendo il downgrade a HTTP in chiaro.',
  },
  {
    term: 'CSP (Content-Security-Policy)',
    definition:
      'Header HTTP che dichiara quali sorgenti possono caricare script, stili e risorse. Riduce il rischio di attacchi Cross-Site Scripting (XSS).',
  },
  {
    term: 'X-Frame-Options',
    definition:
      'Header HTTP che impedisce al browser di includere la pagina in un iframe di un altro sito. Protezione contro attacchi Clickjacking.',
  },
  {
    term: 'Certificato wildcard',
    definition:
      'Certificato SSL valido per tutti i sottodomini di un dominio (es. *.azienda.it). Pratico ma rischioso: una sola chiave copre tutta la superficie.',
  },
  {
    term: 'Certificate Transparency (CT)',
    definition:
      'Registro pubblico e verificabile di tutti i certificati SSL emessi. Usato per scoprire sottodomini e certificati non autorizzati emessi per il dominio.',
  },
  // ── Vulnerabilità & Scoring ───────────────────────────────────────────────
  {
    term: 'CVE',
    definition:
      'Common Vulnerabilities and Exposures: identificatore univoco assegnato a vulnerabilità note (es. CVE-2021-44228). Standard globale per tracciare e comunicare le falle di sicurezza.',
  },
  {
    term: 'CVSS',
    definition:
      'Common Vulnerability Scoring System: punteggio da 0 a 10 che misura la gravità di una vulnerabilità. 7-8.9 = Alto, 9-10 = Critico.',
  },
  {
    term: 'CWE',
    definition:
      'Common Weakness Enumeration: classificazione standardizzata dei tipi di debolezza software (es. CWE-79 = XSS, CWE-89 = SQL Injection).',
  },
  {
    term: 'KEV (CISA)',
    definition:
      'Catalogo CISA delle vulnerabilità attivamente sfruttate in natura. Presenza in KEV = rischio operativo immediato: patch obbligatoria entro giorni.',
  },
  // ── Porte & Servizi esposti ───────────────────────────────────────────────
  {
    term: 'Porta aperta (open port)',
    definition:
      'Porta di rete raggiungibile dall\'esterno di Internet. Ogni servizio esposto è una potenziale superficie di attacco. Porte critiche: 22 (SSH), 3389 (RDP), 3306 (MySQL), 27017 (MongoDB), 6379 (Redis).',
  },
  {
    term: 'Banner grabbing',
    definition:
      'Lettura delle informazioni che un servizio espone al primo contatto (versione software, sistema operativo). Gli attaccanti usano queste info per trovare software vulnerabili.',
  },
  {
    term: 'TCP probe',
    definition:
      'Connessione TCP attiva verso una porta per verificarne l\'apertura e leggerne il banner di risposta. Tecnica usata nello scanner attivo di SurfaceScan360.',
  },
  {
    term: 'RDP (Remote Desktop Protocol)',
    definition:
      'Protocollo Microsoft per il controllo remoto del desktop Windows (porta 3389). Se esposto su Internet è bersaglio privilegiato di brute force e ransomware.',
  },
  {
    term: 'SMB (Server Message Block)',
    definition:
      'Protocollo per la condivisione di file e stampanti su reti Windows (porta 445). Vulnerabilità critiche: EternalBlue (CVE-2017-0144), usata da WannaCry.',
  },
  // ── OSINT & Intelligence ──────────────────────────────────────────────────
  {
    term: 'OSINT',
    definition:
      'Open Source Intelligence: raccolta di informazioni da fonti pubblicamente accessibili (DNS, certificati, registri WHOIS, social, web). Base di ogni attività ricognitiva.',
  },
  {
    term: 'Shodan',
    definition:
      'Motore di ricerca specializzato che indicizza servizi e dispositivi esposti su Internet. Usato per trovare porte aperte, versioni software e configurazioni rischiose.',
  },
  {
    term: 'crt.sh',
    definition:
      'Interfaccia web al registro Certificate Transparency. Permette di scoprire tutti i sottodomini registrati con certificati SSL per un dominio.',
  },
  // ── Dark web & Breach intelligence ───────────────────────────────────────
  {
    term: 'IntelX (Intelligence eXtended)',
    definition:
      'Servizio di threat intelligence che indicizza leak, databreach, dark web e fonti OSINT. Usato da DarkRisk360 per trovare credenziali e dati esposti del cliente.',
  },
  {
    term: 'Credential leak / Databreach',
    definition:
      'Esposizione di credenziali (email + password) avvenuta in seguito a violazioni di sistemi informatici. Indica che quegli account devono essere considerati compromessi.',
  },
  {
    term: 'Stealer log',
    definition:
      'Archivio di dati esfiltrati da computer infetti da malware infostealer. Contiene password salvate nel browser, cookie di sessione, credenziali applicazioni.',
  },
  {
    term: 'Infostealer',
    definition:
      'Malware progettato per rubare in tempo reale credenziali, sessioni browser e dati finanziari dal computer infetto. Esempi: Redline, Vidar, Lumma, MetaStealer.',
  },
  {
    term: 'Dark web',
    definition:
      'Porzione di Internet non indicizzata dai motori di ricerca, accessibile tramite reti anonime (es. Tor). Mercato privilegiato per la vendita di credenziali rubate e dati sensibili.',
  },
  // ── Dominio & Infrastruttura ──────────────────────────────────────────────
  {
    term: 'Domain expiry (scadenza dominio)',
    definition:
      'Data di scadenza della registrazione di un nome di dominio. Un dominio scaduto può essere registrato da terzi per condurre attacchi di phishing o impersonare l\'azienda.',
  },
  {
    term: 'ASN (Autonomous System Number)',
    definition:
      'Blocco di indirizzi IP gestito da un provider Internet o da un\'organizzazione. Usato per identificare dove è fisicamente ospitata l\'infrastruttura.',
  },
  {
    term: 'Subdomain takeover',
    definition:
      'Vulnerabilità in cui un sottodominio punta a un servizio cloud non più attivo che può essere registrato da un attaccante, permettendogli di controllare quel sottodominio.',
  },
  {
    term: 'Scope / Perimetro',
    definition:
      'Insieme di domini, indirizzi IP e asset inclusi nell\'analisi. Solo gli asset in scope vengono scansionati e inclusi nei report.',
  },
  // ── Punteggi & Report ─────────────────────────────────────────────────────
  {
    term: 'Threat score',
    definition:
      'Punteggio di rischio complessivo (0-100) calcolato in base alla gravità e al numero dei finding rilevati. Indica il livello di esposizione dell\'organizzazione.',
  },
  {
    term: 'Severità (Critical / High / Medium / Low / Info)',
    definition:
      'Classificazione della gravità di un finding. Critical = sfruttamento immediato possibile; High = rischio elevato; Medium = rischio moderato; Low = rischio basso; Info = informativa.',
  },
  {
    term: 'Reconnaissance (ricognizione)',
    definition:
      'Prima fase di un attacco informatico: raccolta di informazioni sul bersaglio (IP, servizi esposti, tecnologie usate) senza ancora interagire con i sistemi in modo invasivo.',
  },
];
