import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Shield, Globe, Eye, AlertTriangle, ClipboardCheck, Bot, ArrowRight,
  Server, Lock, Mail, Monitor, Activity, Search, Smartphone, FileCheck,
  CheckCircle2, Network, Zap, LineChart, Users, BookOpen, Siren,
  Wrench, Wallet, Gauge, Target, TrendingUp, CalendarClock,
  Award, MapPin, Layers
} from 'lucide-react';
import logoHi from '@/assets/logo-hi.png';

const modules = [
  {
    icon: ClipboardCheck,
    title: 'HiCompliance',
    tag: 'Assessment NIST / NIS2 / ISO 27001',
    desc: 'Questionario guidato di 132 controlli mappati su NIST CSF, NIS2 e ISO 27001. Genera Gap Analysis, snapshot storici per misurare i miglioramenti nel tempo, report PDF pronti per audit interni ed esterni, e remediation prioritizzata per criticità e impatto.',
    bullets: ['132 controlli con scoring per area', 'Snapshot automatici per Gap/Gain Analysis', 'Report PDF e radar di conformità in tempo reale'],
    color: 'from-blue-500/20 to-blue-700/10',
  },
  {
    icon: Globe,
    title: 'SurfaceScan360',
    tag: 'External Attack Surface Management',
    desc: 'Scopre e monitora in continuo asset esposti, certificati, sottodomini, tecnologie e CVE attribuibili al dominio del cliente. Validazione attiva delle vulnerabilità per ridurre i falsi positivi su shared hosting.',
    bullets: ['Discovery passiva continua di IP, host e servizi', 'Enrichment OSINT: CT log, DNSSEC, tech fingerprint', 'Validazione attiva CVE su autorizzazione esplicita'],
    color: 'from-emerald-500/20 to-emerald-700/10',
  },
  {
    icon: Eye,
    title: 'DarkRisk360',
    tag: 'Dark Web & Threat Intelligence',
    desc: 'Monitoraggio 24/7 di dark web, marketplace, leak forum e Telegram per credenziali compromesse, menzioni del brand, dati esfiltrati e indicatori di attacco mirati. Alert immediati via email ai referenti designati.',
    bullets: ['Credential leak detection con notifica al titolare', 'Brand monitoring e typosquatting domain', 'Indicatori di ransomware e initial-access broker'],
    color: 'from-purple-500/20 to-purple-700/10',
  },
];

const irpFeatures = [
  { icon: BookOpen, title: 'Playbook interattivi', desc: 'Procedure step-by-step per phishing, ransomware, data breach, DDoS, supply-chain. Tracciamento esecuzione, owner per ogni task, evidenze allegate e auto-archiviazione al 100% di completamento.' },
  { icon: LineChart, title: 'Analisi rischi & heatmap', desc: '33 controlli con matrice impatto/probabilità, mitigazioni colorate (grigio → verde) ed export PDF della heatmap pronta per il board.' },
  { icon: Network, title: 'Infrastruttura critica', desc: 'Wizard per censire asset critici (C-01, C-02...) con dipendenze, RTO/RPO, backup, runbook e dati sensibili trattati. Sincronizzato con le Consistenze.' },
  { icon: Users, title: 'Governance & Rubrica', desc: 'CISO sostituto, ruoli IRP, contatti emergenza e fornitori esterni. Rubrica centralizzata riutilizzata nei playbook.' },
  { icon: FileCheck, title: 'Documento IRP esteso', desc: 'Generazione DOCX dinamica con docxtemplater: copertina, governance, classificazione NIS2, asset critici, playbook, allegati. Pronto per il deposito ACN.' },
  { icon: Siren, title: 'Eventi compliance', desc: 'Log temporale degli eventi (incident, esercitazioni, audit) con archiviazione automatica dei playbook eseguiti e tracciabilità completa.' },
];

const partnerLogos = [
  { name: 'Sophos',      src: '/logos/sophos.svg' },
  { name: 'Bitdefender', src: '/logos/bitdefender.svg' },
  { name: 'ESET',        src: '/logos/eset.svg' },
  { name: 'Fortinet',    src: '/logos/fortinet.svg' },
  { name: 'Darktrace',   src: '/logos/darktrace.png' },
  { name: 'Domotz',      src: '/logos/domotz.svg' },
  { name: 'ServiceNow',  src: '/logos/servicenow.svg' },
];

const hiSolutionServices = [
  { icon: Shield, name: 'HiPatch', desc: 'Patch management automatizzato' },
  { icon: Shield, name: 'HiFirewall', desc: 'Gestione policy firewall' },
  { icon: Monitor, name: 'HiEndpoint', desc: 'EDR e protezione endpoint' },
  { icon: Mail, name: 'HiMail', desc: 'Email security e anti-phishing' },
  { icon: Activity, name: 'HiTrack', desc: 'Monitoring proattivo asset' },
  { icon: Server, name: 'HiLog', desc: 'Log management & SIEM correlato' },
  { icon: Search, name: 'HiDetect', desc: 'Detection & response 24/7' },
  { icon: Smartphone, name: 'HiMobile', desc: 'MDM e protezione dispositivi mobili' },
];

const HiConsoleLanding: React.FC = () => {
  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-muted/20">
      {/* Top bar */}
      <header className="border-b border-border/40 backdrop-blur-sm sticky top-0 z-50 bg-background/80">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3">
            <img src={logoHi} alt="HiSolution" className="w-10 h-10 rounded-full" />
            <div className="font-bold text-base tracking-wide">HISOLUTION CONSOLE</div>
          </Link>
          <div className="flex items-center gap-2">
            <Link to="/auth">
              <Button variant="ghost" size="sm">Accedi</Button>
            </Link>
            <Link to="/auth?role=admin">
              <Button size="sm">
                <Lock className="w-4 h-4 mr-2" />
                Login Admin
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="container mx-auto px-4 py-20 md:py-28">
        <div className="max-w-4xl mx-auto text-center space-y-6">
          <Badge variant="outline" className="px-3 py-1">
            <Zap className="w-3 h-3 mr-1.5 text-primary" />
            Piattaforma IT & Cyber per la Serenità Tecnologica
          </Badge>
          <h1 className="text-4xl md:text-6xl font-bold tracking-tight leading-tight">
            Una sola console per
            <span className="block bg-gradient-to-r from-primary via-primary to-primary/60 bg-clip-text text-transparent">
              compliance, attack surface e incident response
            </span>
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground max-w-3xl mx-auto leading-relaxed">
            <strong>HiSolution Console</strong> è la piattaforma unificata HiSolution per gestire la serenità tecnologica.{' '}
            IT e cybersecurity: assessment normativi, monitoraggio della superficie d'attacco, threat intelligence sul dark web,
            risposta agli incidenti, remediation pianificata con budget, Endpoint e Firewall Dashboard,
            monitoraggio dei dispositivi, patch e log management, SIEM/SOAR con PowerQuery semplificato.{' '}
            <strong>Tutto in un unico posto.</strong>
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center pt-4">
            <Link to="/auth?role=admin">
              <Button size="lg" className="w-full sm:w-auto">
                <Lock className="w-4 h-4 mr-2" />
                Accedi come Admin
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </Link>
            <a href="#moduli">
              <Button size="lg" variant="outline" className="w-full sm:w-auto">
                Scopri i moduli
              </Button>
            </a>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-8">
            <span className="flex items-center gap-2 rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1.5 text-xs font-medium text-blue-400">
              <Shield className="w-3.5 h-3.5" />NIS2 ready
            </span>
            <span className="flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-400">
              <Award className="w-3.5 h-3.5" />ISO 27001 compliant
            </span>
            <span className="flex items-center gap-2 rounded-full border border-purple-500/30 bg-purple-500/10 px-3 py-1.5 text-xs font-medium text-purple-400">
              <Layers className="w-3.5 h-3.5" />Multi-tenant RLS
            </span>
            <span className="flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-400">
              <MapPin className="w-3.5 h-3.5" />Made in Italy
            </span>
          </div>
        </div>
      </section>

      {/* Modules */}
      <section id="moduli" className="container mx-auto px-4 py-16">
        <div className="text-center mb-12 space-y-3">
          <Badge variant="secondary" className="text-sm px-3 py-1">I moduli integrabili</Badge>
          <h2 className="text-3xl md:text-5xl font-bold">I moduli che puoi attivare</h2>
          <p className="text-muted-foreground max-w-2xl mx-auto text-lg">
            Attivi solo quello che ti serve, modulo per modulo e cliente per cliente. Senza vincoli.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6 max-w-6xl mx-auto">
          {modules.map((m) => (
            <Card key={m.title} className="relative overflow-hidden border-border/50 hover:border-primary/50 transition-colors">
              <div className={`absolute inset-0 bg-gradient-to-br ${m.color} opacity-50`} />
              <CardContent className="relative p-6 space-y-4">
                <div className="w-12 h-12 rounded-xl bg-background/80 backdrop-blur flex items-center justify-center border">
                  <m.icon className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <h3 className="text-xl font-bold">{m.title}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">{m.tag}</p>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">{m.desc}</p>
                <ul className="space-y-1.5 text-sm">
                  {m.bullets.map((b) => (
                    <li key={b} className="flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Remediation Pianificata - full width row under the 3 boxes */}
        <div className="max-w-6xl mx-auto mt-6">
          <Card className="relative overflow-hidden border-amber-500/30">
            <div className="absolute inset-0 bg-gradient-to-br from-amber-500/15 via-orange-500/10 to-transparent" />
            <CardContent className="relative p-8 grid md:grid-cols-[auto_1fr_auto] gap-6 items-center">
              <div className="w-14 h-14 rounded-xl bg-background/80 backdrop-blur flex items-center justify-center border">
                <Wrench className="w-7 h-7 text-amber-500" />
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-2xl font-bold">Remediation Pianificata</h3>
                  <Badge variant="outline" className="border-amber-500/40 text-amber-500">
                    <Wallet className="w-3 h-3 mr-1" /> con evidenza del budget
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed max-w-3xl">
                  Trasforma findings e gap di compliance in un <strong>piano operativo con tempi, owner e costi</strong>.
                  Ogni intervento ha priorità, effort stimato, budget allocato e stato avanzamento.
                  Vedi a colpo d'occhio quanto stai investendo, quanto rischio stai abbattendo e a che punto sei nel percorso verso l'obiettivo.
                </p>
                <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-1.5 text-sm pt-1">
                  <li className="flex items-start gap-2"><CalendarClock className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" /><span>Roadmap con milestone trimestrali</span></li>
                  <li className="flex items-start gap-2"><Wallet className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" /><span>Budget per intervento: previsto / consuntivo</span></li>
                  <li className="flex items-start gap-2"><Target className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" /><span>Linking automatico a findings, CVE e gap NIS2</span></li>
                  <li className="flex items-start gap-2"><TrendingUp className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" /><span>Impatto stimato sul True Risk Score</span></li>
                </ul>
              </div>
              <Link to="/auth?role=admin" className="hidden md:block">
                <Button variant="outline" className="border-amber-500/40">
                  Vedi nella console
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* True Risk Score */}
      <section className="container mx-auto px-4 py-20">
        <div className="max-w-6xl mx-auto">
          <Card className="relative overflow-hidden border-primary/30">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/15 via-background to-background" />
            <CardContent className="relative p-10 grid md:grid-cols-[1fr_auto] gap-10 items-center">
              <div className="space-y-5">
                <Badge variant="outline" className="px-3 py-1">
                  <Gauge className="w-3 h-3 mr-1.5 text-primary" />
                  Indice unico di rischio
                </Badge>
                <h2 className="text-3xl md:text-5xl font-bold tracking-tight">
                  True Risk Score
                  <span className="block text-base font-normal text-muted-foreground mt-2">
                    Un solo numero per capire dove sei. Davvero.
                  </span>
                </h2>
                <p className="text-muted-foreground leading-relaxed">
                  Il <strong>True Risk Score</strong> è l'unico indice sintetico della piattaforma:
                  un valore <strong>0–100</strong> che combina in un solo numero tutto ciò che conta —
                  postura di compliance, superficie d'attacco, esposizione su dark web,
                  maturità IRP e copertura dei servizi gestiti. Niente cruscotti contraddittori,
                  niente metriche slegate: una sola verità, aggiornata ad ogni assessment, scan e alert.
                </p>
                <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
                  <li className="flex items-start gap-2"><CheckCircle2 className="w-4 h-4 text-primary mt-0.5 shrink-0" /><span>Pesato su criticità asset e classificazione NIS2</span></li>
                  <li className="flex items-start gap-2"><CheckCircle2 className="w-4 h-4 text-primary mt-0.5 shrink-0" /><span>Aggiornato in tempo reale dai moduli attivi</span></li>
                  <li className="flex items-start gap-2"><CheckCircle2 className="w-4 h-4 text-primary mt-0.5 shrink-0" /><span>Storico trend per dimostrare il miglioramento</span></li>
                  <li className="flex items-start gap-2"><CheckCircle2 className="w-4 h-4 text-primary mt-0.5 shrink-0" /><span>Simulazione "what-if" sugli interventi in roadmap</span></li>
                </ul>
                <p className="text-xs text-muted-foreground italic pt-1">
                  Disponibile esclusivamente con il modulo <strong>HiCompliance</strong> attivo — è l'assessment a fornire la baseline di calcolo.
                </p>
              </div>
              <div className="flex justify-center md:justify-end">
                <div className="relative w-56 h-56 rounded-full bg-gradient-to-br from-primary/30 to-primary/5 border-4 border-primary/40 flex items-center justify-center shadow-2xl shadow-primary/20">
                  <div className="absolute inset-3 rounded-full bg-background/60 backdrop-blur flex flex-col items-center justify-center">
                    <div className="text-5xl font-bold bg-gradient-to-br from-primary to-primary/60 bg-clip-text text-transparent">72</div>
                    <div className="text-xs text-muted-foreground mt-1 uppercase tracking-wider">True Risk Score</div>
                    <div className="text-[10px] text-emerald-500 mt-1 flex items-center gap-1">
                      <TrendingUp className="w-3 h-3" /> +8 negli ultimi 90gg
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* IRP deep dive */}
      <section className="container mx-auto px-4 py-20">
        <div className="max-w-6xl mx-auto">
          <div className="grid md:grid-cols-2 gap-12 items-start">
            <div className="space-y-5">
              <Badge variant="outline" className="px-3 py-1">
                <AlertTriangle className="w-3 h-3 mr-1.5 text-amber-500" />
                Modulo IRP — Incident Response Plan
              </Badge>
              <h2 className="text-3xl md:text-4xl font-bold">
                Quando succede, sai esattamente cosa fare.
              </h2>
              <p className="text-muted-foreground leading-relaxed">
                L'<strong>Incident Response Plan</strong> di HiSolution Console non è un documento PDF da aggiornare ogni due anni:
                è un sistema vivo, integrato con la tua infrastruttura e il tuo team. Quando scatta un incidente,
                il responsabile apre il playbook giusto, segue gli step, assegna i task ai responsabili nominati nella rubrica,
                allega evidenze e screenshot, e a fine procedura ottiene automaticamente il documento archiviabile per l'ACN o l'autorità di controllo.
              </p>
              <p className="text-muted-foreground leading-relaxed">
                Tutto è già pre-popolato per <strong>NIS2</strong>: classificazione del soggetto, CISO sostituto, asset critici,
                fornitori essenziali. Tu pensi al business, il piano evolve con te.
              </p>
              <Link to="/auth?role=admin">
                <Button>
                  Provalo in console
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </Link>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              {irpFeatures.map((f) => (
                <Card key={f.title} className="border-border/50">
                  <CardContent className="p-4 space-y-2">
                    <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                      <f.icon className="w-5 h-5 text-primary" />
                    </div>
                    <h4 className="font-semibold text-sm">{f.title}</h4>
                    <p className="text-xs text-muted-foreground leading-relaxed">{f.desc}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* HiSolution services */}
      <section className="bg-muted/20 border-y border-border/40 py-20">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12 space-y-3">
            <Badge variant="secondary">Servizi HiSolution collegabili</Badge>
            <h2 className="text-3xl md:text-4xl font-bold">Integra l'intero ecosistema HiSolution</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Collega i servizi gestiti HiSolution alla console: stato in tempo reale, metriche, alert e correlazione log.
            </p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 max-w-5xl mx-auto">
            {hiSolutionServices.map((s) => (
              <Card key={s.name} className="border-border/50 hover:border-primary/50 transition-colors">
                <CardContent className="p-4 flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <s.icon className="w-5 h-5 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <div className="font-semibold text-sm">{s.name}</div>
                    <div className="text-xs text-muted-foreground">{s.desc}</div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Partner Integrations */}
      <section className="py-16 bg-muted/10 border-y border-border/40 overflow-hidden">
        <style>{`
          @keyframes marquee-logos {
            from { transform: translateX(0); }
            to   { transform: translateX(-50%); }
          }
          .logos-marquee { animation: marquee-logos 28s linear infinite; }
          .logos-marquee:hover { animation-play-state: paused; }
        `}</style>
        <div className="container mx-auto px-4 text-center mb-10 space-y-3">
          <Badge variant="secondary">Ecosistema tecnologico</Badge>
          <h2 className="text-2xl md:text-3xl font-bold">Le nostre integrazioni</h2>
          <p className="text-muted-foreground max-w-2xl mx-auto text-sm leading-relaxed">
            HiSolution Console orchestra i principali vendor di cybersecurity e IT service management:
            Sophos, BitDefender, ESET, Fortinet, Darktrace, Domotz, ServiceNow e altri.
            Un'unica piattaforma per leggere lo stato reale di tutte le protezioni dei tuoi clienti.
          </p>
        </div>
        <div className="overflow-hidden select-none">
          <div className="logos-marquee flex gap-8 items-center w-max">
            {[...partnerLogos, ...partnerLogos].map((logo, i) => (
              <div
                key={i}
                className="flex flex-col items-center gap-3 rounded-2xl px-8 py-5 min-w-[140px] shadow-sm transition-all duration-300 hover:scale-105"
                style={{ background: '#ffffff', border: '1px solid rgba(255,255,255,0.15)' }}
              >
                <img
                  src={logo.src}
                  alt={logo.name}
                  className="h-8 w-28 object-contain"
                  style={{ filter: 'none' }}
                  onError={(e) => {
                    const img = e.target as HTMLImageElement;
                    img.style.display = 'none';
                    const fallback = img.nextElementSibling as HTMLElement;
                    if (fallback) fallback.style.display = 'flex';
                  }}
                />
                <span
                  className="text-xs font-bold tracking-wide"
                  style={{ display: 'none', color: '#333', alignItems: 'center' }}
                >
                  {logo.name}
                </span>
                <span className="text-[10px] font-medium text-gray-500 tracking-widest uppercase">{logo.name}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="container mx-auto px-4 py-20">
        <Card className="max-w-4xl mx-auto border-primary/30 bg-gradient-to-br from-primary/10 via-background to-background">
          <CardContent className="p-10 text-center space-y-5">
            <Bot className="w-12 h-12 text-primary mx-auto" />
            <h2 className="text-3xl font-bold">Serenità tecnologica, in una sola login.</h2>
            <p className="text-muted-foreground max-w-xl mx-auto">
              Accedi a HiSolution Console per orchestrare compliance, attack surface, dark web monitoring,
              incident response, remediation pianificata e i servizi HiSolution dei tuoi clienti.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
              <Link to="/auth?role=admin">
                <Button size="lg">
                  <Lock className="w-4 h-4 mr-2" />
                  Login Admin
                </Button>
              </Link>
              <Link to="/auth">
                <Button size="lg" variant="outline">
                  Accedi come cliente
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/40 py-8">
        <div className="container mx-auto px-4 text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} HiCompliance · HiSolution Console — Piattaforma per la serenità tecnologica
        </div>
      </footer>
    </div>
  );
};

export default HiConsoleLanding;
